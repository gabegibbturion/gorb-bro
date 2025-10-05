import * as THREE from "three";
import type { OrbitalElements } from "./OrbitalElements";
import { OrbitalElementsGenerator } from "./OrbitalElements";
import type { SatelliteEntityOptions } from "./SatelliteEntity";
import { SatelliteEntity } from "./SatelliteEntity";
import { WebGPUSatelliteRenderer, type WebGPUSatelliteRendererOptions } from "./WebGPUSatelliteRenderer";

export interface EntityManagerOptions {
    maxSatellites?: number;
    autoCleanup?: boolean;
    updateInterval?: number;
    useInstancedMesh?: boolean; // Toggle between particle system and instanced mesh
    useWebGPURendering?: boolean; // Toggle WebGPU-based rendering system
    enableOcclusionCulling?: boolean; // Toggle occlusion culling
    particleSize?: number; // Size of particles for WebGPU rendering
}

export class EntityManager {
    private satellites: Map<string, SatelliteEntity> = new Map();
    private scene: THREE.Scene;
    private options: Required<EntityManagerOptions>;
    private currentTime: Date = new Date();
    private isUpdating: boolean = false;
    private meshUpdatesEnabled: boolean = true; // Control mesh updates

    // Instanced buffer geometry for all satellites
    private instancedMesh: THREE.InstancedMesh | null = null;
    private satelliteGeometry: THREE.BufferGeometry | null = null;
    private satelliteMaterial: THREE.RawShaderMaterial | null = null;
    private currentSatelliteCount: number = 0;

    // Particle system (legacy)
    private particleSystem: THREE.Points | null = null;
    private particleGeometry: THREE.BufferGeometry | null = null;
    private particleMaterial: THREE.PointsMaterial | null = null;

    // WebGPU rendering system
    private webgpuRenderer: WebGPUSatelliteRenderer | null = null;
    private renderer: THREE.WebGLRenderer | null = null;

    // Event callbacks
    private onSatelliteAdded?: (satellite: SatelliteEntity) => void;
    private onSatelliteRemoved?: (satellite: SatelliteEntity) => void;
    private onUpdate?: (satellites: SatelliteEntity[]) => void;

    constructor(scene: THREE.Scene, options: EntityManagerOptions = {}) {
        this.scene = scene;
        this.options = {
            maxSatellites: 100000,
            autoCleanup: true,
            updateInterval: 1000, // 1 second
            useInstancedMesh: true, // Default to instanced mesh
            useWebGPURendering: false, // Default to false, enable for high performance
            enableOcclusionCulling: false, // Default to enabled
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
    public addSatellitesBatch(satellitesData: Array<{
        orbitalElements: OrbitalElements;
        options?: Partial<SatelliteEntityOptions>;
    }>): SatelliteEntity[] {
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
        if (this.isUpdating) return;

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
        // Skip mesh updates if disabled
        if (!this.meshUpdatesEnabled) {
            return;
        }

        const satellites = this.getAllSatellites();

        if (this.options.useWebGPURendering && this.webgpuRenderer) {
            // Use WebGPU rendering system
            this.webgpuRenderer.updateSatellites(satellites, this.currentTime);
        } else if (this.options.useInstancedMesh) {
            // Use instanced mesh system
            this.updateInstancedMeshSystem(satellites);
        } else {
            // Use particle system
            this.updateParticleSystem(satellites);
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

        // Update positions and colors for active satellites
        satellites.forEach((satellite, index) => {
            const position = satellite.getPositionDirect();
            const satelliteColor = satellite.getColor();
            const color = new THREE.Color(satelliteColor);

            const i3 = index * 3;

            // Check if satellite is behind the globe (occlusion culling)
            const distanceFromOrigin = position.length();
            const globeRadius = 1.0; // Globe radius in our coordinate system

            if (this.options.enableOcclusionCulling && distanceFromOrigin < globeRadius) {
                // Satellite is behind/inside the globe, hide it
                translateArray[i3 + 0] = 10000;
                translateArray[i3 + 1] = 10000;
                translateArray[i3 + 2] = 10000;

                // Set color to transparent
                colorArray[i3 + 0] = 0;
                colorArray[i3 + 1] = 0;
                colorArray[i3 + 2] = 0;
            } else {
                // Satellite is visible, update position and color
                translateArray[i3 + 0] = position.x;
                translateArray[i3 + 1] = position.y;
                translateArray[i3 + 2] = position.z;

                colorArray[i3 + 0] = color.r;
                colorArray[i3 + 1] = color.g;
                colorArray[i3 + 2] = color.b;
            }
        });

        // Hide unused instances by moving them far away
        for (let i = satellites.length; i < this.options.maxSatellites; i++) {
            const i3 = i * 3;
            translateArray[i3 + 0] = 10000;
            translateArray[i3 + 1] = 10000;
            translateArray[i3 + 2] = 10000;

            // Set unused colors to black
            colorArray[i3 + 0] = 0;
            colorArray[i3 + 1] = 0;
            colorArray[i3 + 2] = 0;
        }

        // Mark attributes as needing update
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
            -0.5, -0.5, 0,  // bottom left
            0.5, -0.5, 0,  // bottom right
            0.5, 0.5, 0,  // top right
            -0.5, 0.5, 0   // top left
        ]);

        const uvs = new Float32Array([
            0, 0,  // bottom left
            1, 0,  // bottom right
            1, 1,  // top right
            0, 1   // top left
        ]);

        const indices = new Uint16Array([
            0, 1, 2,  // first triangle
            0, 2, 3   // second triangle
        ]);

        this.satelliteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.satelliteGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.satelliteGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Create translate array for instance positions
        const translateArray = new Float32Array(this.options.maxSatellites * 3);
        this.satelliteGeometry.setAttribute('translate', new THREE.InstancedBufferAttribute(translateArray, 3));

        // Create color array for instance colors
        const colorArray = new Float32Array(this.options.maxSatellites * 3);
        this.satelliteGeometry.setAttribute('color', new THREE.InstancedBufferAttribute(colorArray, 3));

        // Create raw shader material for billboard behavior
        this.satelliteMaterial = new THREE.RawShaderMaterial({
            uniforms: {
                time: { value: 0.0 }
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
            depthWrite: true
        });

        // Create mesh instead of instanced mesh for raw shader
        this.instancedMesh = new THREE.Mesh(this.satelliteGeometry, this.satelliteMaterial) as any;

        if (this.instancedMesh) {
            console.log("Adding instanced mesh");
            this.scene.add(this.instancedMesh);
        }

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

        // Create geometry with a larger buffer to accommodate dynamic satellite counts
        // Use maxSatellites as the buffer size to avoid frequent recreations
        const maxParticles = this.options.maxSatellites;
        this.particleGeometry = new THREE.BufferGeometry();

        // Initialize with maximum possible particles (all zeros initially)
        const positions = new Float32Array(maxParticles * 3);
        const colors = new Float32Array(maxParticles * 3);

        this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        this.particleGeometry.computeBoundingSphere();

        // Create material exactly like ParticleEngine
        this.particleMaterial = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: true,
            // transparent: true,
            // opacity: 0.8
        });

        // Create particle system
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.scene.add(this.particleSystem);

        // Update positions for current satellites
        this.updateParticlePositions(satellites);
    }

    private updateParticlePositions(satellites: SatelliteEntity[]): void {
        if (!this.particleSystem || !this.particleGeometry) return;

        const positionAttribute = this.particleGeometry.attributes.position as THREE.BufferAttribute;
        const colorAttribute = this.particleGeometry.attributes.color as THREE.BufferAttribute;

        // Get the underlying arrays for direct manipulation
        const positions = positionAttribute.array as Float32Array;
        const colors = colorAttribute.array as Float32Array;

        // Update positions and colors for active satellites
        satellites.forEach((satellite, index) => {
            // Use direct position reference for better performance
            const position = satellite.getPositionDirect();
            const color = new THREE.Color(satellite.getColor());

            // Update positions directly in the buffer
            positions[index * 3] = position.x;
            positions[index * 3 + 1] = position.y;
            positions[index * 3 + 2] = position.z;

            // Update colors directly in the buffer
            colors[index * 3] = color.r;
            colors[index * 3 + 1] = color.g;
            colors[index * 3 + 2] = color.b;
        });

        // Hide unused particles by setting them to a far position
        for (let i = satellites.length; i < this.options.maxSatellites; i++) {
            // Move unused particles far away (they won't be visible)
            positions[i * 3] = 10000;
            positions[i * 3 + 1] = 10000;
            positions[i * 3 + 2] = 10000;

            // Set unused particles to transparent (black with zero alpha would be better, but we'll use black)
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        }

        // Mark attributes as needing update
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
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
    public addRandomTLEFromCOEBatch(
        count: number,
        namePrefix?: string,
        altitudeRange: [number, number] = [400, 800],
        colors?: number[]
    ): SatelliteEntity[] {
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
                }
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
        if (this.options.useInstancedMesh) {
            return this.instancedMesh;
        } else {
            return this.particleSystem;
        }
    }

    public getSystemInfo(): {
        satelliteCount: number;
        maxSatellites: number;
        isOptimized: boolean;
        systemType: "instanced" | "particle" | "webgpu";
        webgpuReady: boolean;
    } {
        return {
            satelliteCount: this.currentSatelliteCount,
            maxSatellites: this.options.maxSatellites,
            isOptimized: this.options.useWebGPURendering ?
                (this.webgpuRenderer !== null && this.webgpuRenderer.isReady()) :
                (this.options.useInstancedMesh ? this.instancedMesh !== null : this.particleSystem !== null),
            systemType: this.options.useWebGPURendering ? "webgpu" :
                (this.options.useInstancedMesh ? "instanced" : "particle"),
            webgpuReady: this.webgpuRenderer ? this.webgpuRenderer.isReady() : false,
        };
    }

    public setUseInstancedMesh(useInstanced: boolean): void {
        if (this.options.useInstancedMesh !== useInstanced) {
            this.options.useInstancedMesh = useInstanced;

            // Clean up current system
            if (useInstanced) {
                // Switching to instanced mesh, clean up particle system
                if (this.particleSystem) {
                    this.scene.remove(this.particleSystem);
                    this.particleGeometry?.dispose();
                    this.particleMaterial?.dispose();
                    this.particleSystem = null;
                    this.particleGeometry = null;
                    this.particleMaterial = null;
                }
            } else {
                // Switching to particle system, clean up instanced mesh
                if (this.instancedMesh) {
                    this.scene.remove(this.instancedMesh);
                    this.satelliteGeometry?.dispose();
                    this.satelliteMaterial?.dispose();
                    this.instancedMesh = null;
                    this.satelliteGeometry = null;
                    this.satelliteMaterial = null;
                }
            }

            // Recreate the system
            this.updateInstancedMesh();
        }
    }

    public setOcclusionCulling(enabled: boolean): void {
        this.options.enableOcclusionCulling = enabled;
        if (this.webgpuRenderer) {
            this.webgpuRenderer.setOcclusionCulling(enabled);
        }
    }

    public getOcclusionCulling(): boolean {
        return this.options.enableOcclusionCulling;
    }

    public setRenderer(renderer: THREE.WebGLRenderer): void {
        this.renderer = renderer;
        this.initializeWebGPUSystem();
    }

    public setUseWebGPURendering(useWebGPU: boolean): void {
        this.options.useWebGPURendering = useWebGPU;
        if (useWebGPU && this.renderer) {
            this.initializeWebGPUSystem();
        } else if (!useWebGPU && this.webgpuRenderer) {
            this.cleanupWebGPUSystem();
        }
    }

    public getUseWebGPURendering(): boolean {
        return this.options.useWebGPURendering;
    }

    public setParticleSize(size: number): void {
        this.options.particleSize = size;
        if (this.webgpuRenderer) {
            this.webgpuRenderer.setParticleSize(size);
        }
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
        console.log(`Mesh updates ${enabled ? 'enabled' : 'disabled'}`);
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
     */
    public forceUpdateMesh(): void {
        console.log('Forcing mesh update...');
        const satellites = this.getAllSatellites();

        if (this.options.useWebGPURendering && this.webgpuRenderer) {
            this.webgpuRenderer.updateSatellites(satellites, this.currentTime);
        } else if (this.options.useInstancedMesh) {
            this.updateInstancedMeshSystem(satellites);
        } else {
            this.updateParticleSystem(satellites);
        }
        console.log(`Mesh updated with ${satellites.length} satellites`);
    }

    public static isWebGPUSupported(): boolean {
        return typeof navigator !== 'undefined' && 'gpu' in navigator;
    }

    public getWebGPUSupportInfo(): {
        supported: boolean;
        reason?: string;
        fallbackSystem: 'instanced' | 'particle';
    } {
        if (!EntityManager.isWebGPUSupported()) {
            return {
                supported: false,
                reason: 'WebGPU not supported in this browser',
                fallbackSystem: this.options.useInstancedMesh ? 'instanced' : 'particle'
            };
        }

        if (this.webgpuRenderer && this.webgpuRenderer.isReady()) {
            return {
                supported: true,
                fallbackSystem: this.options.useInstancedMesh ? 'instanced' : 'particle'
            };
        }

        return {
            supported: false,
            reason: 'WebGPU adapter not available (try enabling experimental features)',
            fallbackSystem: this.options.useInstancedMesh ? 'instanced' : 'particle'
        };
    }

    private initializeWebGPUSystem(): void {
        if (!this.renderer || !this.options.useWebGPURendering) return;

        this.cleanupWebGPUSystem();

        try {
            const webgpuOptions: WebGPUSatelliteRendererOptions = {
                maxSatellites: this.options.maxSatellites,
                enableOcclusionCulling: this.options.enableOcclusionCulling,
                particleSize: this.options.particleSize,
                useInstancedRendering: true
            };

            this.webgpuRenderer = new WebGPUSatelliteRenderer(this.renderer, this.scene, webgpuOptions);

            // Check if WebGPU system initialized properly
            if (!this.webgpuRenderer || !this.webgpuRenderer.isReady()) {
                console.warn('WebGPU system failed to initialize, falling back to instanced mesh rendering');
                this.options.useWebGPURendering = false;
                this.options.useInstancedMesh = true; // Fallback to instanced mesh
                this.webgpuRenderer = null;
            } else {
                console.log('WebGPU system initialized successfully');
            }
        } catch (error) {
            console.error('Failed to initialize WebGPU system:', error);
            console.log('Falling back to instanced mesh rendering');
            this.options.useWebGPURendering = false;
            this.options.useInstancedMesh = true; // Fallback to instanced mesh
            this.webgpuRenderer = null;
        }
    }

    private cleanupWebGPUSystem(): void {
        if (this.webgpuRenderer) {
            this.webgpuRenderer.dispose();
            this.webgpuRenderer = null;
        }
    }

    public dispose(): void {
        this.clearAll();
        this.satellites.clear();

        // Clean up WebGPU system
        this.cleanupWebGPUSystem();

        // Clean up instanced mesh
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.satelliteGeometry?.dispose();
            this.satelliteMaterial?.dispose();
            this.instancedMesh = null;
            this.satelliteGeometry = null;
            this.satelliteMaterial = null;
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
