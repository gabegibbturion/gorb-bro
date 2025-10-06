import * as THREE from "three";
import type { ClassicalOrbitalElements } from "./OrbitalElements";

export interface OrbitInstance {
    id: string;
    coe: ClassicalOrbitalElements;
    color: number;
    opacity: number;
    visible: boolean;
    lineWidth: number;
}

export interface ShaderOrbitSystemOptions {
    maxOrbits?: number;
    enableLOD?: boolean;
    enableFrustumCulling?: boolean;
    baseLineWidth?: number;
}

export class ShaderOrbitSystem {
    private scene: THREE.Scene;
    private options: Required<ShaderOrbitSystemOptions>;
    private orbitInstances: Map<string, OrbitInstance> = new Map();

    // Shader-based orbit rendering
    private orbitMesh: THREE.Mesh | null = null;
    private orbitGeometry: THREE.BufferGeometry | null = null;
    private orbitMaterial: THREE.ShaderMaterial | null = null;

    // Instance data for GPU
    private orbitData: Float32Array;
    private colorData: Float32Array;
    private visibilityData: Float32Array;
    private currentOrbitCount: number = 0;

    // Camera for LOD calculations
    private camera: THREE.Camera | null = null;

    constructor(scene: THREE.Scene, options: ShaderOrbitSystemOptions = {}) {
        this.scene = scene;
        this.options = {
            maxOrbits: 1000,
            enableLOD: true,
            enableFrustumCulling: true,
            baseLineWidth: 1.0,
            ...options,
        };

        // Initialize data arrays
        // Each orbit needs: semiMajorAxis, eccentricity, inclination, RAAN, argOfPeriapsis, meanAnomaly, color, opacity, visibility
        this.orbitData = new Float32Array(this.options.maxOrbits * 9); // 9 floats per orbit
        this.colorData = new Float32Array(this.options.maxOrbits * 4); // RGBA per orbit
        this.visibilityData = new Float32Array(this.options.maxOrbits); // Visibility per orbit

        this.createOrbitGeometry();
        this.createOrbitMaterial();
        this.createOrbitMesh();
    }

    private createOrbitGeometry(): void {
        // Create a simple quad that will be used to render all orbits
        this.orbitGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);

        const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.orbitGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.orbitGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        this.orbitGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Set up instanced attributes for orbit data
        this.orbitGeometry.setAttribute("orbitData", new THREE.InstancedBufferAttribute(this.orbitData, 9));
        this.orbitGeometry.setAttribute("orbitColor", new THREE.InstancedBufferAttribute(this.colorData, 4));
        this.orbitGeometry.setAttribute("orbitVisibility", new THREE.InstancedBufferAttribute(this.visibilityData, 1));
    }

    private createOrbitMaterial(): void {
        this.orbitMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                cameraPosition: { value: new THREE.Vector3() },
                resolution: { value: new THREE.Vector2() },
                maxOrbits: { value: this.options.maxOrbits },
            },
            vertexShader: `
                precision highp float;
                
                uniform float time;
                uniform vec2 resolution;
                uniform float maxOrbits;
                
                attribute vec3 position;
                attribute vec2 uv;
                attribute vec3 orbitData;
                attribute vec4 orbitColor;
                attribute float orbitVisibility;
                
                varying vec2 vUv;
                varying vec3 vOrbitData;
                varying vec4 vOrbitColor;
                varying float vOrbitVisibility;
                varying vec3 vWorldPosition;
                
                void main() {
                    if (orbitVisibility < 0.5) {
                        gl_Position = vec4(0.0, 0.0, -1000.0, 1.0);
                        return;
                    }
                    
                    vUv = uv;
                    vOrbitData = orbitData;
                    vOrbitColor = orbitColor;
                    vOrbitVisibility = orbitVisibility;
                    
                    // Simple position transformation
                    vec4 worldPosition = modelViewMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    
                    gl_Position = projectionMatrix * worldPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                
                uniform float time;
                uniform vec2 resolution;
                uniform float maxOrbits;
                
                varying vec2 vUv;
                varying vec3 vOrbitData;
                varying vec4 vOrbitColor;
                varying float vOrbitVisibility;
                varying vec3 vWorldPosition;
                
                // Simple orbit rendering - no complex calculations
                
                void main() {
                    if (vOrbitVisibility < 0.5) discard;
                    
                    // Simple orbit rendering - just use the color
                    vec4 color = vOrbitColor;
                    color.a *= vOrbitVisibility;
                    
                    gl_FragColor = color;
                }
            `,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
    }

    private createOrbitMesh(): void {
        if (!this.orbitGeometry || !this.orbitMaterial) return;

        this.orbitMesh = new THREE.Mesh(this.orbitGeometry, this.orbitMaterial);
        this.orbitMesh.frustumCulled = this.options.enableFrustumCulling;
        this.scene.add(this.orbitMesh);
    }

    public addOrbit(id: string, coe: ClassicalOrbitalElements, color: number = 0x00ff00, opacity: number = 0.6, lineWidth: number = 1.0): void {
        if (this.orbitInstances.has(id)) {
            this.updateOrbit(id, coe, color, opacity, lineWidth);
            return;
        }

        if (this.currentOrbitCount >= this.options.maxOrbits) {
            console.warn(`Maximum orbit count (${this.options.maxOrbits}) reached`);
            return;
        }

        const instance: OrbitInstance = {
            id,
            coe,
            color,
            opacity,
            visible: true,
            lineWidth,
        };

        this.orbitInstances.set(id, instance);
        this.updateInstanceData();
    }

    public removeOrbit(id: string): void {
        if (!this.orbitInstances.has(id)) return;

        this.orbitInstances.delete(id);
        this.updateInstanceData();
    }

    public updateOrbit(id: string, coe: ClassicalOrbitalElements, color?: number, opacity?: number, lineWidth?: number): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.coe = coe;
        if (color !== undefined) instance.color = color;
        if (opacity !== undefined) instance.opacity = opacity;
        if (lineWidth !== undefined) instance.lineWidth = lineWidth;

        this.updateInstanceData();
    }

    public setOrbitVisible(id: string, visible: boolean): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.visible = visible;
        this.updateInstanceData();
    }

    public toggleOrbitVisibility(id: string): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.visible = !instance.visible;
        this.updateInstanceData();
    }

    public setAllOrbitsVisible(visible: boolean): void {
        this.orbitInstances.forEach((instance) => {
            instance.visible = visible;
        });
        this.updateInstanceData();
    }

    private updateInstanceData(): void {
        if (!this.orbitGeometry) return;

        let instanceIndex = 0;
        const instances = Array.from(this.orbitInstances.values());

        // Clear all instances first
        for (let i = 0; i < this.options.maxOrbits; i++) {
            const i9 = i * 9;
            const i4 = i * 4;

            // Clear orbit data
            for (let j = 0; j < 9; j++) {
                this.orbitData[i9 + j] = 0;
            }

            this.colorData[i4 + 0] = 0;
            this.colorData[i4 + 1] = 0;
            this.colorData[i4 + 2] = 0;
            this.colorData[i4 + 3] = 0;
            this.visibilityData[i] = 0;
        }

        // Update active instances
        instances.forEach((instance) => {
            if (!instance.visible) return;

            const coe = instance.coe;
            const color = new THREE.Color(instance.color);

            const i9 = instanceIndex * 9;
            const i4 = instanceIndex * 4;

            // Pack orbital elements into orbit data
            this.orbitData[i9 + 0] = coe.semiMajorAxis / 6371; // Semi-major axis (Earth radii)
            this.orbitData[i9 + 1] = coe.eccentricity; // Eccentricity
            this.orbitData[i9 + 2] = (coe.inclination * Math.PI) / 180; // Inclination (radians)
            this.orbitData[i9 + 3] = (coe.rightAscensionOfAscendingNode * Math.PI) / 180; // RAAN (radians)
            this.orbitData[i9 + 4] = (coe.argumentOfPeriapsis * Math.PI) / 180; // Arg of periapsis (radians)
            this.orbitData[i9 + 5] = (coe.meanAnomaly * Math.PI) / 180; // Mean anomaly (radians)
            this.orbitData[i9 + 6] = instance.lineWidth; // Line width
            this.orbitData[i9 + 7] = 0; // Unused
            this.orbitData[i9 + 8] = 0; // Unused

            // Set color
            this.colorData[i4 + 0] = color.r;
            this.colorData[i4 + 1] = color.g;
            this.colorData[i4 + 2] = color.b;
            this.colorData[i4 + 3] = instance.opacity;

            // Set visibility
            this.visibilityData[instanceIndex] = 1;

            instanceIndex++;
        });

        this.currentOrbitCount = instanceIndex;

        // Update geometry attributes
        const orbitDataAttribute = this.orbitGeometry.attributes.orbitData as THREE.InstancedBufferAttribute;
        const orbitColorAttribute = this.orbitGeometry.attributes.orbitColor as THREE.InstancedBufferAttribute;
        const orbitVisibilityAttribute = this.orbitGeometry.attributes.orbitVisibility as THREE.InstancedBufferAttribute;

        orbitDataAttribute.needsUpdate = true;
        orbitColorAttribute.needsUpdate = true;
        orbitVisibilityAttribute.needsUpdate = true;
    }

    public setCamera(camera: THREE.Camera): void {
        this.camera = camera;
    }

    public update(): void {
        if (!this.orbitMaterial || !this.camera) return;

        // Update shader uniforms
        this.orbitMaterial.uniforms.cameraPosition.value.copy(this.camera.position);
        this.orbitMaterial.uniforms.time.value = performance.now() * 0.001;

        // Update resolution
        if (this.camera instanceof THREE.PerspectiveCamera) {
            const canvas = document.querySelector("canvas");
            if (canvas) {
                this.orbitMaterial.uniforms.resolution.value.set(canvas.width, canvas.height);
            }
        }
    }

    public getOrbitCount(): number {
        return this.orbitInstances.size;
    }

    public getVisibleOrbitCount(): number {
        return Array.from(this.orbitInstances.values()).filter((instance) => instance.visible).length;
    }

    public clear(): void {
        this.orbitInstances.clear();
        this.currentOrbitCount = 0;
        this.updateInstanceData();
    }

    public dispose(): void {
        if (this.orbitMesh) {
            this.scene.remove(this.orbitMesh);
        }

        if (this.orbitGeometry) {
            this.orbitGeometry.dispose();
        }

        if (this.orbitMaterial) {
            this.orbitMaterial.dispose();
        }
    }
}
