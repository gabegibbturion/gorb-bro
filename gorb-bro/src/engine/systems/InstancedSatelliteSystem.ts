// Instanced Satellite Rendering System - high-performance shader-based rendering
// Based on the EntityManager approach with InstancedBufferGeometry

import * as THREE from "three";
import type { System, EntityId, IEngine, BillboardComponent } from "../types";
import { ComponentType } from "../types";
import type { RenderingService } from "../services/RenderingService";

export class InstancedSatelliteSystem implements System {
    name = "instancedSatellite";
    priority = 50; // Before RenderSystem (100) so arrays are ready
    requiredComponents = [ComponentType.BILLBOARD]; // Only need billboard, position comes from propagation

    private engine: IEngine | null = null;
    private renderingService: RenderingService | null = null;

    // Instanced rendering
    private instancedMesh: THREE.Mesh | null = null;
    private satelliteGeometry: THREE.InstancedBufferGeometry | null = null;
    private satelliteMaterial: THREE.RawShaderMaterial | null = null;

    // Direct arrays for maximum performance (ZERO-COPY updates from propagators)
    private maxSatellites: number = 100000;
    private positions: Float32Array;
    private colors: Float32Array;
    private sizes: Float32Array;

    // Entity tracking
    private entityToIndex: Map<EntityId, number> = new Map();
    private indexToEntity: Map<number, EntityId> = new Map();
    private nextIndex: number = 0;
    private freeIndices: number[] = [];

    private tempColor: THREE.Color = new THREE.Color();
    private needsUpdate: boolean = false;
    public renderTime: number = 0; // Exposed for stats

    constructor(maxSatellites: number = 100000) {
        this.maxSatellites = maxSatellites;
        this.positions = new Float32Array(maxSatellites * 3);
        this.colors = new Float32Array(maxSatellites * 3);
        this.sizes = new Float32Array(maxSatellites);

        // Initialize to hidden state
        this.initializeArrays();
    }

    private initializeArrays(): void {
        for (let i = 0; i < this.maxSatellites; i++) {
            const i3 = i * 3;
            // Hidden position (far away)
            this.positions[i3] = 100000;
            this.positions[i3 + 1] = 100000;
            this.positions[i3 + 2] = 100000;
            // Black color (invisible)
            this.colors[i3] = 0;
            this.colors[i3 + 1] = 0;
            this.colors[i3 + 2] = 0;
            // Default size
            this.sizes[i] = 1;
        }
    }

    init(engine: IEngine): void {
        console.log("[InstancedSatelliteSystem] Initializing...");
        this.engine = engine;
        this.renderingService = engine.getService<RenderingService>("rendering") ?? null;

        if (!this.renderingService) {
            console.warn("[InstancedSatelliteSystem] ⚠️ RenderingService not found!");
            return;
        }

        // Create the instanced mesh
        this.createInstancedMesh();
        console.log("[InstancedSatelliteSystem] ✅ Initialized with mesh");
    }

    private createInstancedMesh(): void {
        if (!this.renderingService) return;

        // Create a simple quad geometry for true circle rendering
        this.satelliteGeometry = new THREE.InstancedBufferGeometry();

        // Create a simple quad (two triangles)
        const positions = new Float32Array([
            -0.5,
            -0.5,
            0, // bottom left
            0.5,
            -0.5,
            0, // bottom right
            0.5,
            0.5,
            0, // top right
            -0.5,
            0.5,
            0, // top left
        ]);

        const uvs = new Float32Array([
            0,
            0, // bottom left
            1,
            0, // bottom right
            1,
            1, // top right
            0,
            1, // top left
        ]);

        const indices = new Uint16Array([
            0,
            1,
            2, // first triangle
            0,
            2,
            3, // second triangle
        ]);

        this.satelliteGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.satelliteGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        this.satelliteGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Create instanced attributes
        this.satelliteGeometry.setAttribute("translate", new THREE.InstancedBufferAttribute(this.positions, 3));
        this.satelliteGeometry.setAttribute("color", new THREE.InstancedBufferAttribute(this.colors, 3));
        this.satelliteGeometry.setAttribute("size", new THREE.InstancedBufferAttribute(this.sizes, 1));

        // Create raw shader material for billboard behavior
        this.satelliteMaterial = new THREE.RawShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
            },
            vertexShader: `
                precision highp float;
                uniform mat4 modelViewMatrix;
                uniform mat4 projectionMatrix;
                uniform float time;

                attribute vec3 position;
                attribute vec2 uv;
                attribute vec3 translate;
                attribute vec3 color;
                attribute float size;

                varying vec2 vUv;
                varying vec3 vColor;

                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(translate, 1.0);
                    // Billboard size - satellites at ~7000km from origin
                    // size = 50, scale by 3 → 150km wide billboards (visible but not huge)
                    mvPosition.xyz += position * (size * 3.0);
                    vUv = uv;
                    vColor = color;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec2 vUv;
                varying vec3 vColor;

                void main() {
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    if (dist > 0.5) discard;
                    
                    // Create smooth circle with anti-aliasing
                    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        // Create mesh
        this.instancedMesh = new THREE.Mesh(this.satelliteGeometry, this.satelliteMaterial);

        // Add to scene
        const scene = this.renderingService.getScene();
        scene.add(this.instancedMesh);

        console.log(`InstancedSatelliteSystem created with capacity for ${this.maxSatellites} satellites`);
    }

    private getOrAllocateIndex(entity: EntityId): number {
        let index = this.entityToIndex.get(entity);
        if (index !== undefined) {
            return index;
        }

        // Allocate new index
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;
        } else {
            if (this.nextIndex >= this.maxSatellites) {
                console.warn(`InstancedSatelliteSystem: Max satellites (${this.maxSatellites}) reached!`);
                return -1;
            }
            index = this.nextIndex++;
        }

        this.entityToIndex.set(entity, index);
        this.indexToEntity.set(index, entity);
        return index;
    }

    /**
     * ZERO-COPY API: Get direct array access for propagators
     */
    public getPositionArray(): Float32Array {
        return this.positions;
    }

    /**
     * ZERO-COPY API: Get entity's array index
     */
    public getEntityIndex(entity: EntityId): number | undefined {
        return this.entityToIndex.get(entity);
    }

    /**
     * ZERO-COPY API: Allocate index for new entity
     */
    public allocateIndex(entity: EntityId): number {
        return this.getOrAllocateIndex(entity);
    }

    /**
     * ZERO-COPY API: Direct position write from propagators
     * Propagators call this directly instead of returning values
     */
    public writePositionDirect(entity: EntityId, x: number, y: number, z: number): void {
        const index = this.getOrAllocateIndex(entity);
        if (index < 0) return;

        const i3 = index * 3;

        // Positions are in km - write directly (Earth is also at km scale: radius 6371)
        this.positions[i3] = x;
        this.positions[i3 + 1] = y;
        this.positions[i3 + 2] = z;

        this.needsUpdate = true;
    }

    /**
     * ZERO-COPY API: Direct color write
     */
    public writeColorDirect(entity: EntityId, color: number): void {
        const index = this.entityToIndex.get(entity);
        if (index === undefined) return;

        const i3 = index * 3;
        this.tempColor.setHex(color);
        this.colors[i3] = this.tempColor.r;
        this.colors[i3 + 1] = this.tempColor.g;
        this.colors[i3 + 2] = this.tempColor.b;

        this.needsUpdate = true;
    }

    /**
     * ZERO-COPY API: Direct size write
     */
    public writeSizeDirect(entity: EntityId, size: number): void {
        const index = this.entityToIndex.get(entity);
        if (index === undefined) return;

        this.sizes[index] = size;
        this.needsUpdate = true;
    }

    private freeIndex(entity: EntityId): void {
        const index = this.entityToIndex.get(entity);
        if (index === undefined) return;

        this.entityToIndex.delete(entity);
        this.indexToEntity.delete(index);
        this.freeIndices.push(index);

        // Hide the satellite
        const i3 = index * 3;
        this.positions[i3] = 100000;
        this.positions[i3 + 1] = 100000;
        this.positions[i3 + 2] = 100000;
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
        this.sizes[index] = 0;
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        if (!this.engine || !this.satelliteGeometry) {
            if (!this.satelliteGeometry && entities.length > 0) {
                console.warn("[InstancedSatelliteSystem] ⚠️ Geometry not initialized but have", entities.length, "entities");
            }
            return;
        }

        const startTime = performance.now();

        // Log first time we get entities
        if (entities.length > 0 && this.entityToIndex.size === 0) {
            console.log("[InstancedSatelliteSystem] 📊 Processing first entities:", entities.length);
        }

        // Register new entities and update colors/sizes from billboard components
        for (const entity of entities) {
            const billboard = this.engine.getComponent<BillboardComponent>(entity, ComponentType.BILLBOARD);
            if (!billboard) continue;

            const index = this.getOrAllocateIndex(entity);
            if (index < 0) continue;

            const i3 = index * 3;

            // Update color if changed
            this.tempColor.setHex(billboard.color);
            if (this.colors[i3] !== this.tempColor.r || this.colors[i3 + 1] !== this.tempColor.g || this.colors[i3 + 2] !== this.tempColor.b) {
                this.colors[i3] = this.tempColor.r;
                this.colors[i3 + 1] = this.tempColor.g;
                this.colors[i3 + 2] = this.tempColor.b;
                this.needsUpdate = true;
            }

            // Update size if changed
            if (this.sizes[index] !== billboard.size) {
                this.sizes[index] = billboard.size;
                this.needsUpdate = true;
            }
        }

        // Free indices for removed entities
        const activeSet = new Set(entities);
        for (const [entity] of this.entityToIndex) {
            if (!activeSet.has(entity)) {
                this.freeIndex(entity);
                this.needsUpdate = true;
            }
        }

        // Update GPU buffers
        // ALWAYS update translate (positions) because propagators write directly to the array
        const translateAttr = this.satelliteGeometry.getAttribute("translate") as THREE.InstancedBufferAttribute;
        translateAttr.needsUpdate = true;

        // Only update colors/sizes if something changed
        if (this.needsUpdate) {
            const colorAttr = this.satelliteGeometry.getAttribute("color") as THREE.InstancedBufferAttribute;
            const sizeAttr = this.satelliteGeometry.getAttribute("size") as THREE.InstancedBufferAttribute;

            colorAttr.needsUpdate = true;
            sizeAttr.needsUpdate = true;

            this.needsUpdate = false;
        }

        // Debug: Log first satellite position (once)
        if (entities.length > 0 && this.entityToIndex.size > 0) {
            const firstEntity = entities[0];
            const firstIndex = this.entityToIndex.get(firstEntity);
            if (firstIndex !== undefined) {
                const i3 = firstIndex * 3;
                const pos = [this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]];
                const col = [this.colors[i3], this.colors[i3 + 1], this.colors[i3 + 2]];
                const size = this.sizes[firstIndex];

                // Log every 60 frames (1 second at 60fps)
                if (Math.random() < 0.016) {
                    console.log(`[InstancedSatelliteSystem] Sample satellite:`, {
                        entity: firstEntity,
                        index: firstIndex,
                        position: `[${pos[0].toFixed(3)}, ${pos[1].toFixed(3)}, ${pos[2].toFixed(3)}]`,
                        color: `[${col[0].toFixed(3)}, ${col[1].toFixed(3)}, ${col[2].toFixed(3)}]`,
                        size: size,
                        totalSatellites: this.entityToIndex.size,
                    });
                }
            }
        }

        this.renderTime = performance.now() - startTime;
    }

    cleanup(): void {
        if (this.instancedMesh && this.renderingService) {
            const scene = this.renderingService.getScene();
            scene.remove(this.instancedMesh);
        }

        this.satelliteGeometry?.dispose();
        this.satelliteMaterial?.dispose();

        this.instancedMesh = null;
        this.satelliteGeometry = null;
        this.satelliteMaterial = null;

        this.entityToIndex.clear();
        this.indexToEntity.clear();
        this.freeIndices = [];

        this.engine = null;
        this.renderingService = null;
    }
}
