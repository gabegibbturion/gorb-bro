import * as THREE from "three";
import type { ClassicalOrbitalElements } from "./OrbitalElements";

export interface OrbitInstance {
    id: string;
    coe: ClassicalOrbitalElements;
    color: number;
    opacity: number;
    visible: boolean;
    segments: number;
}

export interface InstancedOrbitSystemOptions {
    maxOrbits?: number;
    baseSegments?: number;
    enableLOD?: boolean;
    enableFrustumCulling?: boolean;
}

export class InstancedOrbitSystem {
    private scene: THREE.Scene;
    private options: Required<InstancedOrbitSystemOptions>;
    private orbitInstances: Map<string, OrbitInstance> = new Map();
    
    // Instanced geometry for all orbits
    private instancedMesh: THREE.InstancedMesh | null = null;
    private orbitGeometry: THREE.BufferGeometry | null = null;
    private orbitMaterial: THREE.ShaderMaterial | null = null;
    
    // Instance data arrays
    private instanceData: Float32Array;
    private colorData: Float32Array;
    private visibilityData: Float32Array;
    private currentOrbitCount: number = 0;
    
    // LOD and culling
    private camera: THREE.Camera | null = null;
    private lodDistances: number[] = [5, 10, 20, 50]; // Distance thresholds for LOD
    private lodSegments: number[] = [128, 64, 32, 16]; // Segment counts for each LOD level

    constructor(scene: THREE.Scene, options: InstancedOrbitSystemOptions = {}) {
        this.scene = scene;
        this.options = {
            maxOrbits: 1000,
            baseSegments: 64,
            enableLOD: true,
            enableFrustumCulling: true,
            ...options,
        };

        // Initialize instance data arrays
        this.instanceData = new Float32Array(this.options.maxOrbits * 16); // 4x4 matrix per orbit
        this.colorData = new Float32Array(this.options.maxOrbits * 4); // RGBA per orbit
        this.visibilityData = new Float32Array(this.options.maxOrbits); // Visibility per orbit

        this.createOrbitGeometry();
        this.createOrbitMaterial();
        this.createInstancedMesh();
    }

    private createOrbitGeometry(): void {
        // Create a simple quad geometry that will be instanced for each orbit
        this.orbitGeometry = new THREE.BufferGeometry();
        
        // Create a unit circle in the XY plane
        const segments = 64;
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // Center vertex
        positions.push(0, 0, 0);
        uvs.push(0.5, 0.5);

        // Circle vertices
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle);
            const y = Math.sin(angle);
            const z = 0;
            
            positions.push(x, y, z);
            uvs.push((x + 1) / 2, (y + 1) / 2);
        }

        // Create triangle indices for the circle
        for (let i = 1; i <= segments; i++) {
            indices.push(0, i, i + 1);
        }
        // Close the circle
        indices.push(0, segments + 1, 1);

        this.orbitGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        this.orbitGeometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
        this.orbitGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));

        // Set instance attributes
        this.orbitGeometry.setAttribute("instanceMatrix", new THREE.InstancedBufferAttribute(this.instanceData, 16));
        this.orbitGeometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(this.colorData, 4));
        this.orbitGeometry.setAttribute("instanceVisibility", new THREE.InstancedBufferAttribute(this.visibilityData, 1));
    }

    private createOrbitMaterial(): void {
        this.orbitMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                cameraPosition: { value: new THREE.Vector3() },
            },
            vertexShader: `
                precision highp float;
                
                uniform mat4 modelViewMatrix;
                uniform mat4 projectionMatrix;
                uniform mat3 normalMatrix;
                uniform vec3 cameraPosition;
                uniform float time;
                
                attribute vec3 position;
                attribute vec2 uv;
                attribute mat4 instanceMatrix;
                attribute vec4 instanceColor;
                attribute float instanceVisibility;
                
                varying vec2 vUv;
                varying vec4 vColor;
                varying float vVisibility;
                
                void main() {
                    if (instanceVisibility < 0.5) {
                        gl_Position = vec4(0.0, 0.0, -1000.0, 1.0);
                        return;
                    }
                    
                    // Transform position by instance matrix (orbit parameters)
                    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
                    
                    // Apply camera-relative positioning for better performance
                    vec4 mvPosition = modelViewMatrix * worldPosition;
                    
                    vUv = uv;
                    vColor = instanceColor;
                    vVisibility = instanceVisibility;
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                
                varying vec2 vUv;
                varying vec4 vColor;
                varying float vVisibility;
                
                void main() {
                    if (vVisibility < 0.5) discard;
                    
                    // Create smooth circle/ellipse shape
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    
                    // Create smooth falloff for anti-aliasing
                    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                    
                    if (alpha < 0.01) discard;
                    
                    gl_FragColor = vec4(vColor.rgb, alpha * vColor.a);
                }
            `,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
    }

    private createInstancedMesh(): void {
        if (!this.orbitGeometry || !this.orbitMaterial) return;

        this.instancedMesh = new THREE.InstancedMesh(
            this.orbitGeometry,
            this.orbitMaterial,
            this.options.maxOrbits
        );

        this.instancedMesh.frustumCulled = this.options.enableFrustumCulling;
        this.scene.add(this.instancedMesh);
    }

    public addOrbit(id: string, coe: ClassicalOrbitalElements, color: number = 0x00ff00, opacity: number = 0.6): void {
        if (this.orbitInstances.has(id)) {
            this.updateOrbit(id, coe, color, opacity);
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
            segments: this.options.baseSegments,
        };

        this.orbitInstances.set(id, instance);
        this.updateInstanceData();
    }

    public removeOrbit(id: string): void {
        if (!this.orbitInstances.has(id)) return;

        this.orbitInstances.delete(id);
        this.updateInstanceData();
    }

    public updateOrbit(id: string, coe: ClassicalOrbitalElements, color?: number, opacity?: number): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.coe = coe;
        if (color !== undefined) instance.color = color;
        if (opacity !== undefined) instance.opacity = opacity;

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
        this.orbitInstances.forEach(instance => {
            instance.visible = visible;
        });
        this.updateInstanceData();
    }

    private updateInstanceData(): void {
        if (!this.instancedMesh || !this.orbitGeometry) return;

        let instanceIndex = 0;
        const instances = Array.from(this.orbitInstances.values());

        // Clear all instances first
        for (let i = 0; i < this.options.maxOrbits; i++) {
            const i16 = i * 16;
            const i4 = i * 4;
            
            // Set identity matrix
            this.instanceData[i16 + 0] = 1; this.instanceData[i16 + 1] = 0; this.instanceData[i16 + 2] = 0; this.instanceData[i16 + 3] = 0;
            this.instanceData[i16 + 4] = 0; this.instanceData[i16 + 5] = 1; this.instanceData[i16 + 6] = 0; this.instanceData[i16 + 7] = 0;
            this.instanceData[i16 + 8] = 0; this.instanceData[i16 + 9] = 0; this.instanceData[i16 + 10] = 1; this.instanceData[i16 + 11] = 0;
            this.instanceData[i16 + 12] = 0; this.instanceData[i16 + 13] = 0; this.instanceData[i16 + 14] = 0; this.instanceData[i16 + 15] = 1;
            
            this.colorData[i4 + 0] = 0; this.colorData[i4 + 1] = 0; this.colorData[i4 + 2] = 0; this.colorData[i4 + 3] = 0;
            this.visibilityData[i] = 0;
        }

        // Update active instances
        instances.forEach(instance => {
            if (!instance.visible) return;

            const matrix = this.calculateOrbitMatrix(instance.coe);
            const color = new THREE.Color(instance.color);
            
            const i16 = instanceIndex * 16;
            const i4 = instanceIndex * 4;

            // Set transformation matrix
            for (let i = 0; i < 16; i++) {
                this.instanceData[i16 + i] = matrix.elements[i];
            }

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
        const instanceMatrixAttribute = this.orbitGeometry.attributes.instanceMatrix as THREE.InstancedBufferAttribute;
        const instanceColorAttribute = this.orbitGeometry.attributes.instanceColor as THREE.InstancedBufferAttribute;
        const instanceVisibilityAttribute = this.orbitGeometry.attributes.instanceVisibility as THREE.InstancedBufferAttribute;

        instanceMatrixAttribute.needsUpdate = true;
        instanceColorAttribute.needsUpdate = true;
        instanceVisibilityAttribute.needsUpdate = true;

        // Update instance count
        this.instancedMesh.count = this.currentOrbitCount;
    }

    private calculateOrbitMatrix(coe: ClassicalOrbitalElements): THREE.Matrix4 {
        const matrix = new THREE.Matrix4();
        
        // Extract orbital elements
        const a = coe.semiMajorAxis / 6371; // Convert km to Earth radii
        const e = coe.eccentricity;
        const i = (coe.inclination * Math.PI) / 180;
        const Ω = (coe.rightAscensionOfAscendingNode * Math.PI) / 180;
        const ω = (coe.argumentOfPeriapsis * Math.PI) / 180;

        // Create transformation matrix for the orbit
        // This is a simplified approach - in a full implementation, you'd want to
        // generate the actual orbit points and create a proper transformation
        
        // Scale based on semi-major axis
        const scale = Math.min(a, 10); // Cap at 10 Earth radii for visibility
        matrix.makeScale(scale, scale, scale);

        // Apply orbital plane rotation
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.makeRotationFromEuler(new THREE.Euler(i, Ω, ω, 'ZYX'));
        matrix.multiply(rotationMatrix);

        return matrix;
    }

    public setCamera(camera: THREE.Camera): void {
        this.camera = camera;
    }

    public update(): void {
        if (!this.orbitMaterial || !this.camera) return;

        // Update shader uniforms
        this.orbitMaterial.uniforms.cameraPosition.value.copy(this.camera.position);
        this.orbitMaterial.uniforms.time.value = performance.now() * 0.001;
    }

    public getOrbitCount(): number {
        return this.orbitInstances.size;
    }

    public getVisibleOrbitCount(): number {
        return Array.from(this.orbitInstances.values()).filter(instance => instance.visible).length;
    }

    public clear(): void {
        this.orbitInstances.clear();
        this.currentOrbitCount = 0;
        this.updateInstanceData();
    }

    public dispose(): void {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
        }
        
        if (this.orbitGeometry) {
            this.orbitGeometry.dispose();
        }
        
        if (this.orbitMaterial) {
            this.orbitMaterial.dispose();
        }
    }
}
