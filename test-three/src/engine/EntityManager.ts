import * as satellite from "satellite.js";
import * as THREE from "three";
import type { OrbitalElements } from "./OrbitalElements";
import { OrbitalElementsGenerator } from "./OrbitalElements";
import { SatPoints } from "./SatPoints";

export type RenderingSystem = "particle" | "instanced" | "satpoints";

export interface EntityManagerOptions {
    maxSatellites?: number;
    autoCleanup?: boolean;
    updateInterval?: number;
    renderingSystem?: RenderingSystem; // Single parameter to control rendering system
    enableOcclusionCulling?: boolean; // Toggle occlusion culling
    particleSize?: number; // Size of particles
}

// Direct satellite data structure for performance
export interface SatelliteData {
    id: string;
    name: string;
    satrec: any; // satellite.js satrec object
    color: number;
    size: number;
    showTrail: boolean;
    trailLength: number;
    trailColor: number;
    showOrbit: boolean;
    orbitColor: number;
    propagationMethod: "satellite.js" | "k2";
    // K2 state for direct propagation
    k2State: number[]; // [x, y, z, vx, vy, vz] in km
    lastUpdateTime: Date | null;
    isVisible: boolean;
    isSelected: boolean;
}

export class EntityManager {
    private satellites: Map<string, SatelliteData> = new Map();
    private scene: THREE.Scene;
    private options: Required<EntityManagerOptions>;
    private currentTime: Date = new Date();
    private isUpdating: boolean = false;
    private meshUpdatesEnabled: boolean = true; // Control mesh updates
    private defaultPropagationMethod: "satellite.js" | "k2" = "satellite.js"; // Default propagation method for new satellites

    // Direct position and color arrays for maximum performance
    private positions: Float32Array;
    private colors: Float32Array;
    private visibility: Float32Array;
    private sizes: Float32Array;

    // Instanced buffer geometry for all satellites
    private instancedMesh: THREE.InstancedMesh | null = null;
    private satelliteGeometry: THREE.BufferGeometry | null = null;
    private satelliteMaterial: THREE.RawShaderMaterial | null = null;
    private currentSatelliteCount: number = 0;

    // Particle system (legacy)
    private particleSystem: THREE.Points | null = null;
    private particleGeometry: THREE.BufferGeometry | null = null;
    private particleMaterial: THREE.PointsMaterial | null = null;

    // SatPoints system
    private satPoints: SatPoints | null = null;

    // Event callbacks
    private onSatelliteAdded?: (satellite: SatelliteData) => void;
    private onSatelliteRemoved?: (satellite: SatelliteData) => void;
    private onUpdate?: (satellites: SatelliteData[]) => void;

    private lastSatelliteCount: number = 0;
    private tempColor: THREE.Color = new THREE.Color(); // Reuse color object
    private tempPosition: THREE.Vector3 = new THREE.Vector3(); // Reuse position object

    constructor(scene: THREE.Scene, options: EntityManagerOptions = {}) {
        this.scene = scene;
        this.options = {
            maxSatellites: 100000,
            autoCleanup: true,
            updateInterval: 1000, // 1 second
            renderingSystem: "instanced", // Default to instanced mesh
            enableOcclusionCulling: false, // Default to disabled
            particleSize: 0.01, // Default particle size
            ...options,
        };

        // Initialize direct arrays for maximum performance
        this.positions = new Float32Array(this.options.maxSatellites * 3);
        this.colors = new Float32Array(this.options.maxSatellites * 3);
        this.visibility = new Float32Array(this.options.maxSatellites);
        this.sizes = new Float32Array(this.options.maxSatellites);

        // Initialize all arrays to hidden state
        this.initializeArrays();
    }

    private initializeArrays(): void {
        for (let i = 0; i < this.options.maxSatellites; i++) {
            const i3 = i * 3;
            // Hidden position (far away)
            this.positions[i3] = 10000;
            this.positions[i3 + 1] = 10000;
            this.positions[i3 + 2] = 10000;
            // Black color (invisible)
            this.colors[i3] = 0;
            this.colors[i3 + 1] = 0;
            this.colors[i3 + 2] = 0;
            // Hidden
            this.visibility[i] = 0;
            // Default size
            this.sizes[i] = 1;
        }
    }

    public addSatellite(orbitalElements: OrbitalElements, options?: Partial<SatelliteData>): SatelliteData | null {
        if (this.satellites.size >= this.options.maxSatellites) {
            return null;
        }

        // Convert orbital elements to satrec
        const satrec = OrbitalElementsGenerator.toSatrec(orbitalElements);

        // Extract name from orbital elements
        const name = "name" in orbitalElements ? orbitalElements.name : `Satellite-${Math.floor(Math.random() * 1000)}`;

        const satelliteData: SatelliteData = {
            id: Math.random().toString(36).substr(2, 9),
            name,
            satrec,
            color: 0xffff00,
            size: 0.01,
            showTrail: false,
            trailLength: 100,
            trailColor: 0xffff00,
            showOrbit: false,
            orbitColor: 0x00ff00,
            propagationMethod: this.defaultPropagationMethod,
            k2State: [0, 0, 0, 0, 0, 0],
            lastUpdateTime: null,
            isVisible: true,
            isSelected: false,
            ...options,
        };

        this.satellites.set(satelliteData.id, satelliteData);

        // Update instanced mesh
        this.updateInstancedMesh();

        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satelliteData);
        }

        return satelliteData;
    }

    /**
     * Add multiple satellites in batch without updating mesh each time
     * Much faster for loading large numbers of satellites
     */
    public addSatellitesBatch(
        satellitesData: Array<{
            orbitalElements: OrbitalElements;
            options?: Partial<SatelliteData>;
        }>
    ): SatelliteData[] {
        const addedSatellites: SatelliteData[] = [];

        console.log(`Starting batch add of ${satellitesData.length} satellites...`);
        const startTime = performance.now();

        // Add all satellites without updating mesh
        for (const data of satellitesData) {
            if (this.satellites.size >= this.options.maxSatellites) {
                console.warn(`Reached max satellites limit: ${this.options.maxSatellites}`);
                break;
            }

            try {
                // Convert orbital elements to satrec
                const satrec = OrbitalElementsGenerator.toSatrec(data.orbitalElements);

                // Extract name from orbital elements
                const name = "name" in data.orbitalElements ? data.orbitalElements.name : `Satellite-${Math.floor(Math.random() * 1000)}`;

                const satelliteData: SatelliteData = {
                    id: Math.random().toString(36).substr(2, 9),
                    name,
                    satrec,
                    color: 0xffff00,
                    size: 0.01,
                    showTrail: false,
                    trailLength: 100,
                    trailColor: 0xffff00,
                    showOrbit: false,
                    orbitColor: 0x00ff00,
                    propagationMethod: this.defaultPropagationMethod,
                    k2State: [0, 0, 0, 0, 0, 0],
                    lastUpdateTime: null,
                    isVisible: true,
                    isSelected: false,
                    ...data.options,
                };

                this.satellites.set(satelliteData.id, satelliteData);
                addedSatellites.push(satelliteData);

                // Trigger callback
                if (this.onSatelliteAdded) {
                    this.onSatelliteAdded(satelliteData);
                }
            } catch (error) {
                console.warn(`Failed to add satellite:`, error);
            }
        }

        // Update mesh once for all satellites
        this.updateInstancedMesh();

        const endTime = performance.now();
        console.log(`Batch add complete: ${addedSatellites.length} satellites added in ${(endTime - startTime).toFixed(2)}ms`);

        return addedSatellites;
    }

    public removeSatellite(id: string): boolean {
        const satellite = this.satellites.get(id);
        if (!satellite) {
            return false;
        }

        this.satellites.delete(id);

        // Update instanced mesh
        this.updateInstancedMesh();

        // Trigger callback
        if (this.onSatelliteRemoved) {
            this.onSatelliteRemoved(satellite);
        }

        return true;
    }

    public getSatellite(id: string): SatelliteData | undefined {
        return this.satellites.get(id);
    }

    public getAllSatellites(): SatelliteData[] {
        return Array.from(this.satellites.values());
    }

    public getSatelliteCount(): number {
        return this.satellites.size;
    }

    public clearAll(): void {
        const satelliteIds = Array.from(this.satellites.keys());
        satelliteIds.forEach((id) => this.removeSatellite(id));
    }

    // Direct propagation methods for maximum performance
    private propagateSatelliteJs(satelliteData: SatelliteData, time: Date): THREE.Vector3 | null {
        try {
            const positionAndVelocity = satellite.propagate(satelliteData.satrec, time);

            if (positionAndVelocity?.position && positionAndVelocity?.velocity) {
                const pos = positionAndVelocity.position;

                // Check for NaN values
                if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                    return null;
                }

                // Convert from km to Three.js units (globe radius = 1)
                const earthRadiusKm = 6371;
                const scaleFactor = 1 / earthRadiusKm;

                this.tempPosition.set(
                    pos.x * scaleFactor,
                    pos.y * scaleFactor,
                    pos.z * scaleFactor
                );

                return this.tempPosition;
            }
        } catch (error) {
            // Propagation error
        }
        return null;
    }

    private propagateK2(satelliteData: SatelliteData, time: Date): THREE.Vector3 | null {
        // Initialize K2 state if needed
        if (satelliteData.k2State[0] === 0 && satelliteData.k2State[1] === 0 && satelliteData.k2State[2] === 0) {
            this.initializeK2State(satelliteData);
        }

        // Calculate time step in seconds
        const timeStep = (time.getTime() - (satelliteData.lastUpdateTime?.getTime() || time.getTime())) / 1000;

        if (Math.abs(timeStep) < 0.001) return null; // Skip very small time steps

        // Apply K2 propagation
        this.applyK2Propagation(satelliteData, timeStep);

        // Convert to Three.js units
        const earthRadiusKm = 6371;
        const scaleFactor = 1 / earthRadiusKm;

        this.tempPosition.set(
            satelliteData.k2State[0] * scaleFactor,
            satelliteData.k2State[1] * scaleFactor,
            satelliteData.k2State[2] * scaleFactor
        );

        return this.tempPosition;
    }

    private initializeK2State(satelliteData: SatelliteData): void {
        try {
            const now = new Date();
            const positionAndVelocity = satellite.propagate(satelliteData.satrec, now);

            if (positionAndVelocity?.position && positionAndVelocity?.velocity) {
                const pos = positionAndVelocity.position;
                const vel = positionAndVelocity.velocity;

                // Store in km units for K2 propagation
                satelliteData.k2State[0] = pos.x;
                satelliteData.k2State[1] = pos.y;
                satelliteData.k2State[2] = pos.z;
                satelliteData.k2State[3] = vel.x;
                satelliteData.k2State[4] = vel.y;
                satelliteData.k2State[5] = vel.z;
            }
        } catch (error) {
            // Fallback to default state
            satelliteData.k2State = [7000, 0, 0, 0, 7.5, 0]; // Default LEO orbit
        }
    }

    private applyK2Propagation(satelliteData: SatelliteData, dt: number): void {
        const MU_EARTH = 3.986004418e5; // Earth's gravitational parameter in km³/s²
        const halfDT = dt * 0.5;

        // K1 calculation
        const k1 = [satelliteData.k2State[0], satelliteData.k2State[1], satelliteData.k2State[2]];
        const mag1 = -MU_EARTH / Math.pow(k1[0] * k1[0] + k1[1] * k1[1] + k1[2] * k1[2], 1.5);
        k1[0] *= mag1;
        k1[1] *= mag1;
        k1[2] *= mag1;

        // K2 calculation
        const k2 = [satelliteData.k2State[0] + dt * k1[0], satelliteData.k2State[1] + dt * k1[1], satelliteData.k2State[2] + dt * k1[2]];
        const mag2 = -MU_EARTH / Math.pow(k2[0] * k2[0] + k2[1] * k2[1] + k2[2] * k2[2], 1.5);
        k2[0] *= mag2;
        k2[1] *= mag2;
        k2[2] *= mag2;

        // Update velocities
        satelliteData.k2State[3] += halfDT * (k1[0] + k2[0]);
        satelliteData.k2State[4] += halfDT * (k1[1] + k2[1]);
        satelliteData.k2State[5] += halfDT * (k1[2] + k2[2]);

        // Update positions
        satelliteData.k2State[0] += dt * satelliteData.k2State[3];
        satelliteData.k2State[1] += dt * satelliteData.k2State[4];
        satelliteData.k2State[2] += dt * satelliteData.k2State[5];
    }

    public update(
        time: Date,
        _satelliteUpdateStartTime: number,
        _satelliteUpdateEndTime: number,
        _instancedMeshUpdateStartTime: number,
        _instancedMeshUpdateEndTime: number
    ): void {
        if (this.isUpdating || !this.meshUpdatesEnabled) return;

        this.isUpdating = true;
        this.currentTime = time;

        // Direct propagation and array updates for maximum performance
        this.updateSatellitePositions(time);

        // Update instanced mesh positions and colors
        this.updateInstancedMesh();

        // Trigger update callback
        if (this.onUpdate) {
            this.onUpdate(this.getAllSatellites());
        }

        this.isUpdating = false;
    }

    private updateSatellitePositions(time: Date): void {
        const satellites = this.getAllSatellites();

        satellites.forEach((satelliteData, index) => {
            // Skip update if time hasn't changed significantly
            if (satelliteData.lastUpdateTime && Math.abs(time.getTime() - satelliteData.lastUpdateTime.getTime()) < 50) {
                return;
            }

            let position: THREE.Vector3 | null = null;

            // Direct propagation based on method
            if (satelliteData.propagationMethod === "k2") {
                position = this.propagateK2(satelliteData, time);
            } else {
                position = this.propagateSatelliteJs(satelliteData, time);
            }

            if (position) {
                // Direct array manipulation for maximum performance
                const i3 = index * 3;

                // Update position
                this.positions[i3] = position.x;
                this.positions[i3 + 1] = position.y;
                this.positions[i3 + 2] = position.z;

                // Update color
                this.tempColor.setHex(satelliteData.color);
                this.colors[i3] = this.tempColor.r;
                this.colors[i3 + 1] = this.tempColor.g;
                this.colors[i3 + 2] = this.tempColor.b;

                // Update visibility
                this.visibility[index] = satelliteData.isVisible ? 1 : 0;

                // Update size
                this.sizes[index] = satelliteData.size;

                // Update last update time
                satelliteData.lastUpdateTime = time;
            }
        });
    }

    private updateInstancedMesh(): void {
        const satellites = this.getAllSatellites();

        switch (this.options.renderingSystem) {
            case "satpoints":
                this.updateSatPointsSystem(satellites);
                break;
            case "instanced":
                this.updateInstancedMeshSystem(satellites);
                break;
            case "particle":
            default:
                this.updateParticleSystem(satellites);
                break;
        }
    }

    private updateInstancedMeshSystem(satellites: SatelliteData[]): void {
        // Remove existing instanced mesh if no satellites
        if (satellites.length === 0) {
            if (this.instancedMesh) {
                this.scene.remove(this.instancedMesh);
                this.satelliteGeometry?.dispose();
                this.satelliteMaterial?.dispose();
                this.instancedMesh = null;
                this.satelliteGeometry = null;
                this.satelliteMaterial = null;
                this.currentSatelliteCount = 0;
            }
            return;
        }

        // Only create instanced mesh if it doesn't exist
        if (!this.instancedMesh) {
            this.createInstancedMesh();
        }

        // Update current satellite count
        this.currentSatelliteCount = satellites.length;

        // Update positions and colors efficiently
        this.updateInstanceData(satellites);
    }

    private updateSatPointsSystem(satellites: SatelliteData[]): void {
        // Remove existing SatPoints if no satellites
        if (satellites.length === 0) {
            if (this.satPoints) {
                this.scene.remove(this.satPoints);
                this.satPoints = null;
                this.currentSatelliteCount = 0;
            }
            return;
        }

        // Only create SatPoints if it doesn't exist
        if (!this.satPoints) {
            this.createSatPointsSystem();
        }

        // Update current satellite count
        this.currentSatelliteCount = satellites.length;

        // Update positions and colors efficiently
        this.updateSatPointsData(satellites);
    }

    private updateParticleSystem(satellites: SatelliteData[]): void {
        // Remove existing particle system if no satellites
        if (satellites.length === 0) {
            if (this.particleSystem) {
                this.scene.remove(this.particleSystem);
                this.particleGeometry?.dispose();
                this.particleMaterial?.dispose();
                this.particleSystem = null;
                this.particleGeometry = null;
                this.particleMaterial = null;
                this.currentSatelliteCount = 0;
            }
            return;
        }

        // Only create particle system if it doesn't exist
        if (!this.particleSystem) {
            this.createParticleSystem();
        }

        // Update current satellite count
        this.currentSatelliteCount = satellites.length;

        // Update positions and colors efficiently
        this.updateParticlePositions(satellites);
    }

    private updateInstanceData(satellites: SatelliteData[]): void {
        if (!this.instancedMesh || !this.satelliteGeometry) return;

        const translateAttribute = this.satelliteGeometry.attributes.translate as THREE.InstancedBufferAttribute;
        const colorAttribute = this.satelliteGeometry.attributes.color as THREE.InstancedBufferAttribute;
        const translateArray = translateAttribute.array as Float32Array;
        const colorArray = colorAttribute.array as Float32Array;

        // Copy from our direct arrays to the geometry attributes
        const satelliteCount = satellites.length;

        for (let i = 0; i < satelliteCount; i++) {
            const i3 = i * 3;

            // Copy position from our direct array
            translateArray[i3] = this.positions[i3];
            translateArray[i3 + 1] = this.positions[i3 + 1];
            translateArray[i3 + 2] = this.positions[i3 + 2];

            // Copy color from our direct array
            colorArray[i3] = this.colors[i3];
            colorArray[i3 + 1] = this.colors[i3 + 1];
            colorArray[i3 + 2] = this.colors[i3 + 2];
        }

        // Hide unused instances when count decreases
        if (satelliteCount < this.lastSatelliteCount) {
            for (let i = satelliteCount; i < this.lastSatelliteCount; i++) {
                const i3 = i * 3;
                translateArray[i3] = 10000;
                translateArray[i3 + 1] = 10000;
                translateArray[i3 + 2] = 10000;
                colorArray[i3] = 0;
                colorArray[i3 + 1] = 0;
                colorArray[i3 + 2] = 0;
            }
        }

        // Only update the range that changed
        if (satelliteCount > 0 || this.lastSatelliteCount > 0) {
            const updateCount = Math.max(satelliteCount, this.lastSatelliteCount);

            translateAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount * 3,
                },
            ];
            colorAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount * 3,
                },
            ];
        }

        this.lastSatelliteCount = satelliteCount;

        translateAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
    }
    private createInstancedMesh(): void {
        const satellites = this.getAllSatellites();
        if (satellites.length === 0) return;

        // Remove existing instanced mesh
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.satelliteGeometry?.dispose();
            this.satelliteMaterial?.dispose();
        }

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

        // Create translate array for instance positions - initialize ALL to hidden
        const translateArray = new Float32Array(this.options.maxSatellites * 3);
        const colorArray = new Float32Array(this.options.maxSatellites * 3);

        // Initialize all instances to hidden position (do this ONCE)
        for (let i = 0; i < this.options.maxSatellites; i++) {
            const i3 = i * 3;
            translateArray[i3 + 0] = 10000;
            translateArray[i3 + 1] = 10000;
            translateArray[i3 + 2] = 10000;
            colorArray[i3 + 0] = 0;
            colorArray[i3 + 1] = 0;
            colorArray[i3 + 2] = 0;
        }

        this.satelliteGeometry.setAttribute("translate", new THREE.InstancedBufferAttribute(translateArray, 3));
        this.satelliteGeometry.setAttribute("color", new THREE.InstancedBufferAttribute(colorArray, 3));

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

                varying vec2 vUv;
                varying vec3 vColor;

                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(translate, 1.0);
                    mvPosition.xyz += position * 0.02; // Fixed size for satellites
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
            depthTest: true,
            depthWrite: true,
        });

        // Create mesh instead of instanced mesh for raw shader
        this.instancedMesh = new THREE.Mesh(this.satelliteGeometry, this.satelliteMaterial) as any;

        if (this.instancedMesh) {
            this.scene.add(this.instancedMesh);
        }

        // Reset lastSatelliteCount to ensure proper update
        this.lastSatelliteCount = 0;

        // Update instance data for current satellites
        this.updateInstanceData(satellites);
    }

    private createParticleSystem(): void {
        const satellites = this.getAllSatellites();
        if (satellites.length === 0) return;

        // Remove existing particle system
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleGeometry?.dispose();
            this.particleMaterial?.dispose();
        }

        const maxParticles = this.options.maxSatellites;
        this.particleGeometry = new THREE.BufferGeometry();

        // Initialize with maximum possible particles - all hidden
        const positions = new Float32Array(maxParticles * 3);
        const colors = new Float32Array(maxParticles * 3);

        // Initialize all particles to hidden position (do this ONCE)
        for (let i = 0; i < maxParticles; i++) {
            const i3 = i * 3;
            positions[i3] = 10000;
            positions[i3 + 1] = 10000;
            positions[i3 + 2] = 10000;
            colors[i3] = 0;
            colors[i3 + 1] = 0;
            colors[i3 + 2] = 0;
        }

        this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        // Set a large bounding sphere to encompass all possible satellite positions
        // This prevents frustum culling issues
        this.particleGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10);

        this.particleMaterial = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: true,
        });

        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.scene.add(this.particleSystem);

        // Reset lastSatelliteCount to ensure proper update
        this.lastSatelliteCount = 0;

        // Update positions for current satellites
        this.updateParticlePositions(satellites);
    }

    private updateParticlePositions(satellites: SatelliteData[]): void {
        if (!this.particleSystem || !this.particleGeometry) return;

        const positionAttribute = this.particleGeometry.attributes.position as THREE.BufferAttribute;
        const colorAttribute = this.particleGeometry.attributes.color as THREE.BufferAttribute;

        const positions = positionAttribute.array as Float32Array;
        const colors = colorAttribute.array as Float32Array;

        // Update positions and colors for active satellites
        satellites.forEach((_, index) => {
            const i3 = index * 3;

            // Use direct position from our arrays
            positions[i3] = this.positions[i3];
            positions[i3 + 1] = this.positions[i3 + 1];
            positions[i3 + 2] = this.positions[i3 + 2];

            // Use direct color from our arrays
            colors[i3] = this.colors[i3];
            colors[i3 + 1] = this.colors[i3 + 1];
            colors[i3 + 2] = this.colors[i3 + 2];
        });

        // Only hide newly unused particles when count decreases
        if (satellites.length < this.lastSatelliteCount) {
            for (let i = satellites.length; i < this.lastSatelliteCount; i++) {
                const i3 = i * 3;
                positions[i3] = 10000;
                positions[i3 + 1] = 10000;
                positions[i3 + 2] = 10000;
                colors[i3] = 0;
                colors[i3 + 1] = 0;
                colors[i3 + 2] = 0;
            }
        }

        this.lastSatelliteCount = satellites.length;

        // Only update the range that changed
        if (satellites.length > 0) {
            const updateCount = Math.max(satellites.length, this.lastSatelliteCount);

            positionAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount,
                },
            ];
            colorAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount,
                },
            ];

            positionAttribute.needsUpdate = true;
            colorAttribute.needsUpdate = true;
        }

        // DO NOT call computeBoundingSphere() here - it's too expensive!
        // The bounding sphere is already set to encompass all possible positions
    }

    private createSatPointsSystem(): void {
        const satellites = this.getAllSatellites();
        if (satellites.length === 0) return;

        // Remove existing SatPoints
        if (this.satPoints) {
            this.scene.remove(this.satPoints);
        }

        // Create SatPoints with maximum capacity
        this.satPoints = new SatPoints(this.options.maxSatellites);

        // Initialize ALL satellites to hidden position (do this ONCE)
        const satArray = this.satPoints.satArray;
        const satColor = this.satPoints.satColor;
        const visibilityArray = this.satPoints.visibilityArray;
        const sizeArray = this.satPoints.sizeArray;

        for (let i = 0; i < this.options.maxSatellites; i++) {
            const i3 = i * 3;
            satArray[i3] = 10000;
            satArray[i3 + 1] = 10000;
            satArray[i3 + 2] = 10000;
            satColor[i3] = 0;
            satColor[i3 + 1] = 0;
            satColor[i3 + 2] = 0;
            visibilityArray[i] = 0;
            sizeArray[i] = 1;
        }

        if (this.satPoints) {
            this.scene.add(this.satPoints);
        }

        // Reset lastSatelliteCount to ensure proper update
        this.lastSatelliteCount = 0;

        // Update data for current satellites
        this.updateSatPointsData(satellites);
    }

    private updateSatPointsData(satellites: SatelliteData[]): void {
        if (!this.satPoints) return;

        // DIRECT buffer manipulation - no method calls!
        const satArray = this.satPoints.satArray;
        const satColor = this.satPoints.satColor;
        const visibilityArray = this.satPoints.visibilityArray;
        const sizeArray = this.satPoints.sizeArray;

        // Update active satellites - NO FRUSTUM CULLING
        for (let j = 0; j < satellites.length; j++) {
            // Direct array access using our pre-computed arrays
            const j3 = j * 3;
            satArray[j3] = this.positions[j3];
            satArray[j3 + 1] = this.positions[j3 + 1];
            satArray[j3 + 2] = this.positions[j3 + 2];

            // Direct color access from our arrays
            satColor[j3] = this.colors[j3];
            satColor[j3 + 1] = this.colors[j3 + 1];
            satColor[j3 + 2] = this.colors[j3 + 2];

            // Direct visibility from our arrays
            visibilityArray[j] = this.visibility[j];

            // Direct size from our arrays
            sizeArray[j] = this.sizes[j];
        }

        // Hide unused satellites
        for (let j = satellites.length; j < this.options.maxSatellites; j++) {
            const j3 = j * 3;
            satArray[j3] = 10000;
            satArray[j3 + 1] = 10000;
            satArray[j3 + 2] = 10000;
            satColor[j3] = 0;
            satColor[j3 + 1] = 0;
            satColor[j3 + 2] = 0;
            visibilityArray[j] = 0;
        }

        // Use update ranges like instanced mesh
        const updateCount = Math.max(satellites.length, this.lastSatelliteCount);

        if (updateCount > 0) {
            this.satPoints.satPositionAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount,
                },
            ];
            this.satPoints.satColorAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount,
                },
            ];
            // Only update visibility if satellites were added/removed
            if (satellites.length !== this.lastSatelliteCount) {
                this.satPoints.satVisibilityAttribute.updateRanges = [
                    {
                        start: 0,
                        count: updateCount,
                    },
                ];
            }
        }

        // Mark attributes for update
        this.satPoints.satPositionAttribute.needsUpdate = true;
        this.satPoints.satColorAttribute.needsUpdate = true;

        // Only update visibility when count changes
        if (satellites.length !== this.lastSatelliteCount) {
            this.satPoints.satVisibilityAttribute.needsUpdate = true;
        }

        // Skip size updates if static (remove this line entirely if sizes never change)
        // this.satPoints.satSizeAttribute.needsUpdate = true;

        this.lastSatelliteCount = satellites.length;
    }
    public setTime(time: Date, satelliteUpdateStartTime: number, satelliteUpdateEndTime: number, instancedMeshUpdateStartTime: number, instancedMeshUpdateEndTime: number): void {
        this.currentTime = time;
        this.update(time, satelliteUpdateStartTime, satelliteUpdateEndTime, instancedMeshUpdateStartTime, instancedMeshUpdateEndTime);
    }

    public getCurrentTime(): Date {
        return new Date(this.currentTime);
    }

    // Event handlers
    public onSatelliteAddedCallback(callback: (satellite: SatelliteData) => void): void {
        this.onSatelliteAdded = callback;
    }

    public onSatelliteRemovedCallback(callback: (satellite: SatelliteData) => void): void {
        this.onSatelliteRemoved = callback;
    }

    public onUpdateCallback(callback: (satellites: SatelliteData[]) => void): void {
        this.onUpdate = callback;
    }

    // Utility methods
    public getSatellitesInRange(position: THREE.Vector3, radius: number): SatelliteData[] {
        return this.getAllSatellites().filter((_, index) => {
            const i3 = index * 3;
            const satPosition = new THREE.Vector3(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);
            return satPosition.distanceTo(position) <= radius;
        });
    }

    public getSatellitesByName(name: string): SatelliteData[] {
        return this.getAllSatellites().filter((satellite) => satellite.name.toLowerCase().includes(name.toLowerCase()));
    }

    public getRandomSatellites(count: number): SatelliteData[] {
        const allSatellites = this.getAllSatellites();
        const shuffled = allSatellites.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    public addRandomSatellite(name?: string): SatelliteData | null {
        const satelliteName = name || `Random-Sat-${Math.floor(Math.random() * 1000)}`;
        const coe = OrbitalElementsGenerator.generateRandomCOE(satelliteName);

        // Add some styling options
        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return this.addSatellite(coe, {
            color,
            size: 0.01 + Math.random() * 0.005,
            showTrail: true,
            trailLength: 50 + Math.random() * 100,
            trailColor: color,
            showOrbit: false,
            orbitColor: color,
        });
    }

    // Add a random satellite using TLE generation from COE
    public addRandomTLEFromCOE(name?: string, altitudeRange: [number, number] = [400, 800]): SatelliteData | null {
        const satelliteName = name || `Random-TLE-${Math.floor(Math.random() * 1000)}`;
        const tle = OrbitalElementsGenerator.generateRandomTLEFromCOE(satelliteName, altitudeRange);

        // Add some styling options
        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return this.addSatellite(tle, {
            color,
            size: 0.01 + Math.random() * 0.005,
            showTrail: true,
            trailLength: 50 + Math.random() * 100,
            trailColor: color,
            showOrbit: false,
            orbitColor: color,
        });
    }

    /**
     * Add multiple random satellites in batch (much faster)
     */
    public addRandomTLEFromCOEBatch(count: number, namePrefix?: string, altitudeRange: [number, number] = [400, 800], colors?: number[]): SatelliteData[] {
        console.log(`Generating ${count} random satellites...`);
        const startTime = performance.now();

        const defaultColors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff, 0x00ff88, 0xff0088];
        const colorPalette = colors || defaultColors;

        // Prepare all satellite data first
        const satellitesData = [];
        for (let i = 0; i < count; i++) {
            const satelliteName = namePrefix ? `${namePrefix}-${i}` : `Random-TLE-${Math.floor(Math.random() * 100000)}`;
            const tle = OrbitalElementsGenerator.generateRandomTLEFromCOE(satelliteName, altitudeRange);
            const color = colorPalette[i % colorPalette.length];

            satellitesData.push({
                orbitalElements: tle,
                options: {
                    color,
                    size: 0.01 + Math.random() * 0.005,
                    showTrail: false, // Disable trails for performance with large batches
                    trailLength: 50 + Math.random() * 100,
                    trailColor: color,
                    showOrbit: false,
                    orbitColor: color,
                },
            });
        }

        const genTime = performance.now();
        console.log(`Generated ${count} TLEs in ${(genTime - startTime).toFixed(2)}ms`);

        // Batch add all satellites
        const result = this.addSatellitesBatch(satellitesData);

        const totalTime = performance.now();
        console.log(`Total time: ${(totalTime - startTime).toFixed(2)}ms (${((totalTime - startTime) / count).toFixed(2)}ms per satellite)`);

        return result;
    }

    // Add a satellite using the exact valid TLE (for testing)
    public addValidSatellite(options?: Partial<SatelliteData>): SatelliteData | null {
        const validSatrec = OrbitalElementsGenerator.createValidSatellite();

        const satelliteData: SatelliteData = {
            id: Math.random().toString(36).substr(2, 9),
            name: "DROID-001",
            satrec: validSatrec,
            color: 0xffff00,
            size: 0.01,
            showTrail: false,
            trailLength: 100,
            trailColor: 0xffff00,
            showOrbit: false,
            orbitColor: 0x00ff00,
            propagationMethod: "satellite.js",
            k2State: [0, 0, 0, 0, 0, 0],
            lastUpdateTime: null,
            isVisible: true,
            isSelected: false,
            ...options,
        };

        this.satellites.set(satelliteData.id, satelliteData);

        // Update instanced mesh
        this.updateInstancedMesh();

        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satelliteData);
        }

        return satelliteData;
    }

    public getInstancedMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh;
    }

    public getParticleSystem(): THREE.Points | null {
        return this.particleSystem;
    }

    public getCurrentSystem(): THREE.Object3D | null {
        switch (this.options.renderingSystem) {
            case "satpoints":
                return this.satPoints;
            case "instanced":
                return this.instancedMesh;
            case "particle":
            default:
                return this.particleSystem;
        }
    }

    public getSystemInfo(): {
        satelliteCount: number;
        maxSatellites: number;
        isOptimized: boolean;
        systemType: RenderingSystem;
    } {
        return {
            satelliteCount: this.currentSatelliteCount,
            maxSatellites: this.options.maxSatellites,
            isOptimized:
                this.options.renderingSystem === "satpoints"
                    ? this.satPoints !== null
                    : this.options.renderingSystem === "instanced"
                        ? this.instancedMesh !== null
                        : this.particleSystem !== null,
            systemType: this.options.renderingSystem,
        };
    }

    public setRenderingSystem(system: RenderingSystem): void {
        if (this.options.renderingSystem !== system) {
            const oldSystem = this.options.renderingSystem;
            this.options.renderingSystem = system;

            // Clean up old system
            this.cleanupRenderingSystem(oldSystem);

            // Recreate the system
            this.updateInstancedMesh();
        }
    }

    private cleanupRenderingSystem(system: RenderingSystem): void {
        switch (system) {
            case "particle":
                if (this.particleSystem) {
                    this.scene.remove(this.particleSystem);
                    this.particleGeometry?.dispose();
                    this.particleMaterial?.dispose();
                    this.particleSystem = null;
                    this.particleGeometry = null;
                    this.particleMaterial = null;
                }
                break;
            case "instanced":
                if (this.instancedMesh) {
                    this.scene.remove(this.instancedMesh);
                    this.satelliteGeometry?.dispose();
                    this.satelliteMaterial?.dispose();
                    this.instancedMesh = null;
                    this.satelliteGeometry = null;
                    this.satelliteMaterial = null;
                }
                break;
            case "satpoints":
                if (this.satPoints) {
                    this.scene.remove(this.satPoints);
                    this.satPoints = null;
                }
                break;
        }
    }

    /**
     * Set the base size for SatPoints circles
     */
    public setSatPointsSize(size: number): void {
        if (this.satPoints) {
            this.satPoints.setBaseSize(size);
        }
    }

    /**
     * Get the current SatPoints size
     */
    public getSatPointsSize(): number {
        if (this.satPoints) {
            return this.satPoints.getBaseSize();
        }
        return 0.2; // Default size
    }

    public setOcclusionCulling(enabled: boolean): void {
        this.options.enableOcclusionCulling = enabled;
    }

    public getOcclusionCulling(): boolean {
        return this.options.enableOcclusionCulling;
    }

    public getRenderingSystem(): RenderingSystem {
        return this.options.renderingSystem;
    }

    public setParticleSize(size: number): void {
        this.options.particleSize = size;
    }

    public getParticleSize(): number {
        return this.options.particleSize;
    }

    public setMaxSatellites(max: number): void {
        this.options.maxSatellites = max;
        console.log(`Max satellites limit set to: ${max}`);
    }

    public getMaxSatellites(): number {
        return this.options.maxSatellites;
    }

    public getPositionsArray(): Float32Array {
        return this.positions;
    }

    /**
     * Set propagation method for all satellites
     */
    public setPropagationMethodForAll(method: "satellite.js" | "k2"): void {
        const satellites = this.getAllSatellites();
        satellites.forEach((satellite) => {
            satellite.propagationMethod = method;
            // Reset K2 state when switching to K2
            if (method === "k2") {
                satellite.k2State = [0, 0, 0, 0, 0, 0];
            }
        });
        console.log(`Set propagation method to ${method} for ${satellites.length} satellites`);
    }

    /**
     * Set default propagation method for new satellites
     */
    public setDefaultPropagationMethod(method: "satellite.js" | "k2"): void {
        this.defaultPropagationMethod = method;
        console.log(`Set default propagation method to ${method} for new satellites`);
    }

    /**
     * Enable or disable automatic mesh updates
     * Useful for adding many satellites without updating the mesh each time
     */
    public setMeshUpdatesEnabled(enabled: boolean): void {
        this.meshUpdatesEnabled = enabled;
        console.log(`Mesh updates ${enabled ? "enabled" : "disabled"}`);
    }

    /**
     * Check if mesh updates are enabled
     */
    public getMeshUpdatesEnabled(): boolean {
        return this.meshUpdatesEnabled;
    }

    /**
     * Manually trigger a mesh update
     * Useful after adding many satellites with mesh updates disabled
     * This performs a one-time update without enabling automatic updates
     */
    public forceUpdateMesh(): void {
        console.log("Forcing mesh update...");
        const satellites = this.getAllSatellites();

        // Temporarily enable mesh updates for this single update
        const wasMeshUpdatesEnabled = this.meshUpdatesEnabled;
        this.meshUpdatesEnabled = true;

        if (this.options.renderingSystem === "instanced") {
            this.updateInstancedMeshSystem(satellites);
        } else if (this.options.renderingSystem === "satpoints") {
            this.updateSatPointsSystem(satellites);
        } else {
            this.updateParticleSystem(satellites);
        }

        this.update(this.currentTime, 0, 0, 0, 0);
        // Restore the original mesh updates setting
        this.meshUpdatesEnabled = wasMeshUpdatesEnabled;

        console.log(`Mesh updated with ${satellites.length} satellites (mesh updates remain ${wasMeshUpdatesEnabled ? "enabled" : "disabled"})`);
    }

    public dispose(): void {
        this.clearAll();
        this.satellites.clear();

        // Clean up instanced mesh
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.satelliteGeometry?.dispose();
            this.satelliteMaterial?.dispose();
            this.instancedMesh = null;
            this.satelliteGeometry = null;
            this.satelliteMaterial = null;
        }

        // Clean up SatPoints system
        if (this.satPoints) {
            this.scene.remove(this.satPoints);
            this.satPoints = null;
        }

        // Clean up particle system
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleGeometry?.dispose();
            this.particleMaterial?.dispose();
            this.particleSystem = null;
            this.particleGeometry = null;
            this.particleMaterial = null;
        }
    }
}
