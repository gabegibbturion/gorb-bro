// Base class for celestial bodies

import * as THREE from "three";
import type { IEngine, EntityId } from "../types";
import { ComponentType, ReferenceFrame } from "../types";

export interface CelestialBodyConfig {
    radius: number;
    segments?: number;
    color?: number;
    emissive?: number;
    emissiveIntensity?: number;
    textureUrl?: string;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    frame?: ReferenceFrame;
}

export abstract class CelestialBody {
    protected entity: EntityId | null = null;
    protected mesh: THREE.Mesh | null = null;
    protected config: CelestialBodyConfig;
    protected engine: IEngine | null = null;

    constructor(config: CelestialBodyConfig) {
        this.config = {
            segments: 64,
            frame: ReferenceFrame.ECI,
            ...config,
        };
    }

    /**
     * Create the celestial body in the engine
     */
    async create(engine: IEngine): Promise<EntityId> {
        this.engine = engine;
        this.entity = engine.createEntity();

        // Create geometry
        const geometry = this.createGeometry();

        // Create material
        const material = await this.createMaterial();

        // Create mesh
        this.mesh = new THREE.Mesh(geometry, material);

        // Register with rendering service
        const renderingService = engine.getService("rendering");
        if (renderingService && "addObject" in renderingService) {
            (renderingService as any).addObject(this.mesh);
        }

        // Add position component if provided
        if (this.config.position) {
            engine.addComponent(this.entity, {
                type: ComponentType.POSITION,
                x: this.config.position.x,
                y: this.config.position.y,
                z: this.config.position.z,
                frame: this.config.frame!,
            });
        }

        // Set initial rotation if provided
        if (this.config.rotation && this.mesh) {
            this.mesh.rotation.set(this.config.rotation.x, this.config.rotation.y, this.config.rotation.z);
        }

        return this.entity;
    }

    /**
     * Create the geometry for this celestial body
     */
    protected createGeometry(): THREE.BufferGeometry {
        return new THREE.SphereGeometry(this.config.radius, this.config.segments, this.config.segments);
    }

    /**
     * Create the material for this celestial body
     */
    protected async createMaterial(): Promise<THREE.Material> {
        const materialConfig: THREE.MeshPhongMaterialParameters = {
            color: this.config.color ?? 0xffffff,
        };

        if (this.config.emissive !== undefined) {
            materialConfig.emissive = this.config.emissive;
            materialConfig.emissiveIntensity = this.config.emissiveIntensity ?? 1.0;
        }

        if (this.config.textureUrl) {
            const texture = await this.loadTexture(this.config.textureUrl);
            materialConfig.map = texture;
        }

        return new THREE.MeshPhongMaterial(materialConfig);
    }

    /**
     * Load a texture
     */
    protected loadTexture(url: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(
                url,
                (texture) => resolve(texture),
                undefined,
                (error) => reject(error)
            );
        });
    }

    /**
     * Update the celestial body's position
     */
    updatePosition(x: number, y: number, z: number, frame?: ReferenceFrame): void {
        if (!this.entity || !this.engine) return;

        this.engine.addComponent(this.entity, {
            type: ComponentType.POSITION,
            x,
            y,
            z,
            frame: frame ?? this.config.frame!,
        });

        // Update mesh position directly
        if (this.mesh) {
            this.mesh.position.set(x, y, z);
        }
    }

    /**
     * Update the celestial body's rotation
     */
    updateRotation(x: number, y: number, z: number): void {
        if (this.mesh) {
            this.mesh.rotation.set(x, y, z);
        }
    }

    /**
     * Get the entity ID
     */
    getEntity(): EntityId | null {
        return this.entity;
    }

    /**
     * Get the Three.js mesh
     */
    getMesh(): THREE.Mesh | null {
        return this.mesh;
    }

    /**
     * Remove the celestial body from the engine
     */
    destroy(): void {
        if (!this.engine || !this.entity) return;

        // Remove from rendering service
        const renderingService = this.engine.getService("rendering");
        if (renderingService && "removeObject" in renderingService && this.mesh) {
            (renderingService as any).removeObject(this.mesh);
        }

        // Dispose of geometry and material
        if (this.mesh) {
            this.mesh.geometry.dispose();
            if (Array.isArray(this.mesh.material)) {
                this.mesh.material.forEach((mat) => mat.dispose());
            } else {
                this.mesh.material.dispose();
            }
        }

        // Destroy entity
        this.engine.destroyEntity(this.entity);

        this.entity = null;
        this.mesh = null;
        this.engine = null;
    }
}
