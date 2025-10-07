import * as THREE from "three";
import type { OrbitalElements } from "./OrbitalElements";
import { OrbitalElementsGenerator } from "./OrbitalElements";
import type { SatelliteEntityOptions } from "./SatelliteEntity";
import { SatelliteEntity } from "./SatelliteEntity";
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

export class EntityManager {
    private satellites: Map<string, SatelliteEntity> = new Map();
    private scene: THREE.Scene;
    private options: Required<EntityManagerOptions>;
    private currentTime: Date = new Date();
    private isUpdating: boolean = false;
    private meshUpdatesEnabled: boolean = true; // Control mesh updates
    private globalPropagatorType: "satellitejs" | "k2" = "satellitejs"; // Global propagator type

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
    private onSatelliteAdded?: (satellite: SatelliteEntity) => void;
    private onSatelliteRemoved?: (satellite: SatelliteEntity) => void;
    private onUpdate?: (satellites: SatelliteEntity[]) => void;

    private lastSatelliteCount: number = 0;
    private tempColor: THREE.Color = new THREE.Color(); // Reuse color object

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
    }

    public addSatellite(orbitalElements: OrbitalElements, options?: Partial<SatelliteEntityOptions>): SatelliteEntity | null {
        if (this.satellites.size >= this.options.maxSatellites) {
            return null;
        }

        // Convert orbital elements to satrec
        const satrec = OrbitalElementsGenerator.toSatrec(orbitalElements);

        // Extract name from orbital elements
        const name = "name" in orbitalElements ? orbitalElements.name : `Satellite-${Math.floor(Math.random() * 1000)}`;

        const satelliteOptions: SatelliteEntityOptions = {
            name,
            satrec,
            useK2Propagator: this.globalPropagatorType === "k2",
            ...options,
        };

        const satellite = new SatelliteEntity(satelliteOptions);
        this.satellites.set(satellite.id, satellite);

        // Add trails and orbits to scene (but not individual meshes)
        // const trail = satellite.getTrail();
        // if (trail) {
        //     this.scene.add(trail);
        // }
        // const orbit = satellite.getOrbitVisualization();
        // if (orbit) {
        //     this.scene.add(orbit);
        // }

        // Update instanced mesh
        this.updateInstancedMesh();

        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satellite);
        }

        return satellite;
    }

    /**
     * Add multiple satellites in batch without updating mesh each time
     * Much faster for loading large numbers of satellites
     */
    public addSatellitesBatch(
        satellitesData: Array<{
            orbitalElements: OrbitalElements;
            options?: Partial<SatelliteEntityOptions>;
        }>
    ): SatelliteEntity[] {
        const addedSatellites: SatelliteEntity[] = [];

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

                const satelliteOptions: SatelliteEntityOptions = {
                    name,
                    satrec,
                    ...data.options,
                };

                const satellite = new SatelliteEntity(satelliteOptions);
                this.satellites.set(satellite.id, satellite);
                addedSatellites.push(satellite);

                // Trigger callback
                if (this.onSatelliteAdded) {
                    this.onSatelliteAdded(satellite);
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

        // Remove trails and orbits from scene
        const trail = satellite.getTrail();
        if (trail) {
            this.scene.remove(trail);
        }
        const orbit = satellite.getOrbitVisualization();
        if (orbit) {
            this.scene.remove(orbit);
        }

        // Cleanup
        satellite.dispose();
        this.satellites.delete(id);

        // Update instanced mesh
        this.updateInstancedMesh();

        // Trigger callback
        if (this.onSatelliteRemoved) {
            this.onSatelliteRemoved(satellite);
        }

        return true;
    }

    public getSatellite(id: string): SatelliteEntity | undefined {
        return this.satellites.get(id);
    }

    public getAllSatellites(): SatelliteEntity[] {
        return Array.from(this.satellites.values());
    }

    public getSatelliteCount(): number {
        return this.satellites.size;
    }

    public clearAll(): void {
        const satelliteIds = Array.from(this.satellites.keys());
        satelliteIds.forEach((id) => this.removeSatellite(id));
    }

    public update(time: Date): void {
        if (this.isUpdating || !this.meshUpdatesEnabled) return;

        this.isUpdating = true;
        this.currentTime = time;

        // Update all satellites
        this.satellites.forEach((satellite) => {
            satellite.update(time);
        });

        // Update instanced mesh positions and colors
        this.updateInstancedMesh();

        // Trigger update callback
        if (this.onUpdate) {
            this.onUpdate(this.getAllSatellites());
        }

        this.isUpdating = false;
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

    private updateInstancedMeshSystem(satellites: SatelliteEntity[]): void {
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

    private updateSatPointsSystem(satellites: SatelliteEntity[]): void {
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

    private updateParticleSystem(satellites: SatelliteEntity[]): void {
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

    private updateInstanceData(satellites: SatelliteEntity[]): void {
        if (!this.instancedMesh || !this.satelliteGeometry) return;

        const translateAttribute = this.satelliteGeometry.attributes.translate as THREE.InstancedBufferAttribute;
        const colorAttribute = this.satelliteGeometry.attributes.color as THREE.InstancedBufferAttribute;
        const translateArray = translateAttribute.array as Float32Array;
        const colorArray = colorAttribute.array as Float32Array;

        // Only update positions and colors for active satellites
        satellites.forEach((satellite, index) => {
            const position = satellite.getPositionDirect();
            const i3 = index * 3;

            const distanceFromOrigin = position.length();
            const globeRadius = 1.0;

            if (this.options.enableOcclusionCulling && distanceFromOrigin < globeRadius) {
                translateArray[i3 + 0] = 10000;
                translateArray[i3 + 1] = 10000;
                translateArray[i3 + 2] = 10000;
                colorArray[i3 + 0] = 0;
                colorArray[i3 + 1] = 0;
                colorArray[i3 + 2] = 0;
            } else {
                translateArray[i3 + 0] = position.x;
                translateArray[i3 + 1] = position.y;
                translateArray[i3 + 2] = position.z;

                this.tempColor.setHex(satellite.getColor());
                colorArray[i3 + 0] = this.tempColor.r;
                colorArray[i3 + 1] = this.tempColor.g;
                colorArray[i3 + 2] = this.tempColor.b;
            }
        });

        // Only hide newly unused instances when count decreases
        if (satellites.length < this.lastSatelliteCount) {
            for (let i = satellites.length; i < this.lastSatelliteCount; i++) {
                const i3 = i * 3;
                translateArray[i3 + 0] = 10000;
                translateArray[i3 + 1] = 10000;
                translateArray[i3 + 2] = 10000;
                colorArray[i3 + 0] = 0;
                colorArray[i3 + 1] = 0;
                colorArray[i3 + 2] = 0;
            }
        }

        // Only update the range that changed
        if (satellites.length > 0 || this.lastSatelliteCount > 0) {
            const updateCount = Math.max(satellites.length, this.lastSatelliteCount);

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

        this.lastSatelliteCount = satellites.length;

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

    private updateParticlePositions(satellites: SatelliteEntity[]): void {
        if (!this.particleSystem || !this.particleGeometry) return;

        const positionAttribute = this.particleGeometry.attributes.position as THREE.BufferAttribute;
        const colorAttribute = this.particleGeometry.attributes.color as THREE.BufferAttribute;

        const positions = positionAttribute.array as Float32Array;
        const colors = colorAttribute.array as Float32Array;

        // Update positions and colors for active satellites
        satellites.forEach((satellite, index) => {
            const position = satellite.getPositionDirect();
            const i3 = index * 3;

            positions[i3] = position.x;
            positions[i3 + 1] = position.y;
            positions[i3 + 2] = position.z;

            this.tempColor.setHex(satellite.getColor());
            colors[i3] = this.tempColor.r;
            colors[i3 + 1] = this.tempColor.g;
            colors[i3 + 2] = this.tempColor.b;
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

    private updateSatPointsData(satellites: SatelliteEntity[]): void {
        if (!this.satPoints) return;

        // DIRECT buffer manipulation - no method calls!
        const satArray = this.satPoints.satArray;
        const satColor = this.satPoints.satColor;
        const visibilityArray = this.satPoints.visibilityArray;
        const sizeArray = this.satPoints.sizeArray;

        // Update active satellites - NO FRUSTUM CULLING
        for (let j = 0; j < satellites.length; j++) {
            const satellite = satellites[j];
            const position = satellite.getPositionDirect();

            // Direct array access
            const j3 = j * 3;
            satArray[j3] = position.x;
            satArray[j3 + 1] = position.y;
            satArray[j3 + 2] = position.z;

            // Direct color access - cache the color conversion
            const color = satellite.getColor();
            this.tempColor.setHex(color);

            satColor[j3] = this.tempColor.r;
            satColor[j3 + 1] = this.tempColor.g;
            satColor[j3 + 2] = this.tempColor.b;

            // Direct visibility - always visible
            visibilityArray[j] = 1;

            // Direct size - static, could skip updating this
            sizeArray[j] = 1;
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
    public setTime(time: Date): void {
        this.currentTime = time;
        this.update(time);
    }

    public getCurrentTime(): Date {
        return new Date(this.currentTime);
    }

    // Event handlers
    public onSatelliteAddedCallback(callback: (satellite: SatelliteEntity) => void): void {
        this.onSatelliteAdded = callback;
    }

    public onSatelliteRemovedCallback(callback: (satellite: SatelliteEntity) => void): void {
        this.onSatelliteRemoved = callback;
    }

    public onUpdateCallback(callback: (satellites: SatelliteEntity[]) => void): void {
        this.onUpdate = callback;
    }

    // Utility methods
    public getSatellitesInRange(position: THREE.Vector3, radius: number): SatelliteEntity[] {
        return this.getAllSatellites().filter((satellite) => {
            return satellite.getPosition().distanceTo(position) <= radius;
        });
    }

    public getSatellitesByName(name: string): SatelliteEntity[] {
        return this.getAllSatellites().filter((satellite) => satellite.name.toLowerCase().includes(name.toLowerCase()));
    }

    public getRandomSatellites(count: number): SatelliteEntity[] {
        const allSatellites = this.getAllSatellites();
        const shuffled = allSatellites.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    public addRandomSatellite(name?: string): SatelliteEntity | null {
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
    public addRandomTLEFromCOE(name?: string, altitudeRange: [number, number] = [400, 800]): SatelliteEntity | null {
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
    public addRandomTLEFromCOEBatch(count: number, namePrefix?: string, altitudeRange: [number, number] = [400, 800], colors?: number[]): SatelliteEntity[] {
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
    public addValidSatellite(options?: Partial<SatelliteEntityOptions>): SatelliteEntity | null {
        const validSatrec = OrbitalElementsGenerator.createValidSatellite();

        const satelliteOptions: SatelliteEntityOptions = {
            name: "DROID-001",
            satrec: validSatrec,
            ...options,
        };

        const satellite = new SatelliteEntity(satelliteOptions);
        this.satellites.set(satellite.id, satellite);

        // Add trails and orbits to scene (but not individual meshes)
        const trail = satellite.getTrail();
        if (trail) {
            this.scene.add(trail);
        }
        const orbit = satellite.getOrbitVisualization();
        if (orbit) {
            this.scene.add(orbit);
        }

        // Update instanced mesh
        this.updateInstancedMesh();

        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satellite);
        }

        return satellite;
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

    public setPropagatorType(propagatorType: "satellitejs" | "k2"): void {
        // Update global propagator type
        this.globalPropagatorType = propagatorType;

        // Update all existing satellites to use the new propagator type
        this.satellites.forEach((satellite) => {
            satellite.setPropagatorType(propagatorType === "k2");
        });
    }

    public getPropagatorType(): "satellitejs" | "k2" {
        return this.globalPropagatorType;
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

        this.update(this.currentTime);
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
