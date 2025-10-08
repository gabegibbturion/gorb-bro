import * as satellite from "satellite.js";
import * as THREE from "three";
import type { OrbitalElements } from "./OrbitalElements";
import { OrbitalElementsGenerator } from "./OrbitalElements";
// import { SatPoints } from "./SatPoints"; // Removed - only instanced rendering supported

export type RenderingSystem = "instanced";

export interface EntityManagerOptions {
    maxSatellites?: number;
    autoCleanup?: boolean;
    updateInterval?: number;
    // renderingSystem?: RenderingSystem; // Only instanced rendering supported
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

    // Web worker for propagation with shared memory
    private propagationWorker: Worker | null = null;
    private pendingBatches: Map<number, { resolve: (result: any) => void; reject: (error: any) => void }> = new Map();

    // Shared memory for direct access between main thread and worker
    private sharedArrayBuffer: SharedArrayBuffer | null = null;
    private sharedPositions: Float32Array | null = null;
    private sharedColors: Float32Array | null = null;
    private sharedVisibility: Float32Array | null = null;
    private sharedSizes: Float32Array | null = null;

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

    // Particle system - removed
    // private particleSystem: THREE.Points | null = null;
    // private particleGeometry: THREE.BufferGeometry | null = null;
    // private particleMaterial: THREE.PointsMaterial | null = null;

    // SatPoints system - removed
    // private satPoints: SatPoints | null = null;

    // Event callbacks
    private onSatelliteAdded?: (satellite: SatelliteData) => void;
    private onSatelliteRemoved?: (satellite: SatelliteData) => void;
    private onUpdate?: (satellites: SatelliteData[]) => void;

    private lastSatelliteCount: number = 0;
    private tempColor: THREE.Color = new THREE.Color(); // Reuse color object

    constructor(scene: THREE.Scene, options: EntityManagerOptions = {}) {
        this.scene = scene;
        this.options = {
            maxSatellites: 100000,
            autoCleanup: true,
            updateInterval: 1000, // 1 second
            // renderingSystem: "instanced", // Only instanced mesh supported
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

        // Initialize shared memory
        this.initializeSharedMemory();

        // Initialize web worker
        this.initializeWorker();
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

    private initializeSharedMemory(): void {
        try {
            // Calculate total memory needed
            const positionsSize = this.options.maxSatellites * 3 * 4; // 3 floats * 4 bytes
            const colorsSize = this.options.maxSatellites * 3 * 4;
            const visibilitySize = this.options.maxSatellites * 4;
            const sizesSize = this.options.maxSatellites * 4;

            const totalSize = positionsSize + colorsSize + visibilitySize + sizesSize;

            // Create SharedArrayBuffer
            this.sharedArrayBuffer = new SharedArrayBuffer(totalSize);

            // Create views into the shared memory
            let offset = 0;
            this.sharedPositions = new Float32Array(this.sharedArrayBuffer, offset, this.options.maxSatellites * 3);
            offset += positionsSize;

            this.sharedColors = new Float32Array(this.sharedArrayBuffer, offset, this.options.maxSatellites * 3);
            offset += colorsSize;

            this.sharedVisibility = new Float32Array(this.sharedArrayBuffer, offset, this.options.maxSatellites);
            offset += visibilitySize;

            this.sharedSizes = new Float32Array(this.sharedArrayBuffer, offset, this.options.maxSatellites);

            // Initialize shared memory to hidden state
            this.initializeSharedArrays();

            console.log('Shared memory initialized successfully');
        } catch (error) {
            console.error('Failed to initialize shared memory:', error);
            // Fallback to regular arrays
            this.sharedArrayBuffer = null;
        }
    }

    private initializeSharedArrays(): void {
        if (!this.sharedPositions || !this.sharedColors || !this.sharedVisibility || !this.sharedSizes) return;

        for (let i = 0; i < this.options.maxSatellites; i++) {
            const i3 = i * 3;
            // Hidden position (far away)
            this.sharedPositions[i3] = 10000;
            this.sharedPositions[i3 + 1] = 10000;
            this.sharedPositions[i3 + 2] = 10000;
            // Black color (invisible)
            this.sharedColors[i3] = 0;
            this.sharedColors[i3 + 1] = 0;
            this.sharedColors[i3 + 2] = 0;
            // Hidden
            this.sharedVisibility[i] = 0;
            // Default size
            this.sharedSizes[i] = 1;
        }
    }

    private initializeWorker(): void {
        try {
            // Create worker from the worker file
            this.propagationWorker = new Worker(new URL('../workers/satellitePropagationWorker.ts', import.meta.url), {
                type: 'module'
            });

            // Set up worker message handling
            this.propagationWorker.onmessage = (event) => {
                const { type, data } = event.data;

                switch (type) {
                    case 'INITIALIZED':
                        console.log('Propagation worker initialized');
                        // Set up shared memory in worker
                        this.setupWorkerSharedMemory();
                        break;

                    case 'SHARED_MEMORY_SET':
                        console.log('Shared memory set up in worker');
                        break;

                    case 'BATCH_COMPLETE':
                        this.handleBatchComplete(data);
                        break;

                    case 'PROPAGATION_ERROR':
                        console.error('Propagation error:', data.error);
                        this.handlePropagationError(data);
                        break;
                }
            };

            this.propagationWorker.onerror = (error) => {
                console.error('Worker error:', error);
            };

            // Initialize the worker
            this.propagationWorker.postMessage({ type: 'INITIALIZE' });

        } catch (error) {
            console.error('Failed to initialize propagation worker:', error);
            // Fallback to synchronous processing
            this.propagationWorker = null;
        }
    }

    private setupWorkerSharedMemory(): void {
        if (!this.propagationWorker || !this.sharedArrayBuffer) return;

        // Create shared memory layout for worker
        const sharedMemoryLayout = {
            positions: this.sharedPositions!,
            colors: this.sharedColors!,
            visibility: this.sharedVisibility!,
            sizes: this.sharedSizes!,
            satelliteData: this.getAllSatellites(),
            maxSatellites: this.options.maxSatellites
        };

        // Send shared memory to worker
        this.propagationWorker.postMessage({
            type: 'SET_SHARED_MEMORY',
            data: sharedMemoryLayout
        });
    }

    private handleBatchComplete(data: any): void {
        const { batchIndex, successCount } = data;

        // Copy from shared memory to main arrays for rendering
        this.copyFromSharedMemory();

        // Resolve the pending batch
        const pending = this.pendingBatches.get(batchIndex);
        if (pending) {
            pending.resolve({ batchIndex, successCount });
            this.pendingBatches.delete(batchIndex);
        }
    }

    private copyFromSharedMemory(): void {
        if (!this.sharedPositions || !this.sharedColors || !this.sharedVisibility || !this.sharedSizes) return;

        // Direct copy from shared memory to main arrays
        this.positions.set(this.sharedPositions);
        this.colors.set(this.sharedColors);
        this.visibility.set(this.sharedVisibility);
        this.sizes.set(this.sharedSizes);
    }

    private handlePropagationError(error: any): void {
        // Reject all pending batches
        for (const [, pending] of this.pendingBatches) {
            pending.reject(new Error(error.error || 'Propagation failed'));
        }
        this.pendingBatches.clear();
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
    private propagateSatelliteJs(satelliteData: SatelliteData, time: Date, index: number): boolean {
        try {
            const positionAndVelocity = satellite.propagate(satelliteData.satrec, time);

            if (positionAndVelocity?.position && positionAndVelocity?.velocity) {
                const pos = positionAndVelocity.position;

                // Check for NaN values
                if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                    return false;
                }

                // Convert from km to Three.js units (globe radius = 1)
                const earthRadiusKm = 6371;
                const scaleFactor = 1 / earthRadiusKm;

                // Directly update the positions array
                const i3 = index * 3;
                this.positions[i3] = pos.x * scaleFactor;
                this.positions[i3 + 1] = pos.y * scaleFactor;
                this.positions[i3 + 2] = pos.z * scaleFactor;

                return true;
            }
        } catch (error) {
            // Propagation error
        }
        return false;
    }

    private propagateK2(satelliteData: SatelliteData, time: Date, index: number): boolean {
        // Initialize K2 state if needed
        if (satelliteData.k2State[0] === 0 && satelliteData.k2State[1] === 0 && satelliteData.k2State[2] === 0) {
            this.initializeK2State(satelliteData);
        }

        // Calculate time step in seconds
        const timeStep = (time.getTime() - (satelliteData.lastUpdateTime?.getTime() || time.getTime())) / 1000;

        if (Math.abs(timeStep) < 0.001) return false; // Skip very small time steps

        // Apply K2 propagation
        this.applyK2Propagation(satelliteData, timeStep);

        // Convert to Three.js units and directly update positions array
        const earthRadiusKm = 6371;
        const scaleFactor = 1 / earthRadiusKm;

        const i3 = index * 3;
        this.positions[i3] = satelliteData.k2State[0] * scaleFactor;
        this.positions[i3 + 1] = satelliteData.k2State[1] * scaleFactor;
        this.positions[i3 + 2] = satelliteData.k2State[2] * scaleFactor;

        return true;
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

        // Use worker-based propagation for better performance
        this.updateSatellitePositionsWithWorker(time);

        // Update instanced mesh positions and colors
        this.updateInstancedMesh();

        // Trigger update callback
        if (this.onUpdate) {
            this.onUpdate(this.getAllSatellites());
        }

        this.isUpdating = false;
    }

    private updateSatellitePositionsWithWorker(time: Date): void {
        const satellites = this.getAllSatellites();

        if (satellites.length === 0) return;

        // If worker is not available, fall back to synchronous processing
        if (!this.propagationWorker) {
            this.updateSatellitePositionsSync(time);
            return;
        }

        // Process satellites in batches of 1000 using worker
        const batchSize = 1000;

        for (let i = 0; i < satellites.length; i += batchSize) {
            const batch = satellites.slice(i, i + batchSize);
            this.processSatelliteBatchWithWorker(batch, time, i);
        }
    }

    private updateSatellitePositionsSync(time: Date): void {
        const satellites = this.getAllSatellites();

        if (satellites.length === 0) return;

        // Process satellites in batches of 1000 synchronously
        const batchSize = 1000;

        for (let i = 0; i < satellites.length; i += batchSize) {
            const batch = satellites.slice(i, i + batchSize);
            this.processSatelliteBatchSync(batch, time, i);
        }
    }

    private processSatelliteBatchWithWorker(
        satellites: SatelliteData[],
        time: Date,
        startIndex: number
    ): void {
        if (!this.propagationWorker || !this.sharedArrayBuffer) {
            this.processSatelliteBatchSync(satellites, time, startIndex);
            return;
        }

        // Create batch data for worker (no need to send satellite data - it's in shared memory)
        const batchData = {
            batchIndex: Math.floor(startIndex / 1000),
            startIndex: startIndex,
            batchSize: satellites.length,
            time: time.getTime()
        };

        // Send batch to worker
        this.propagationWorker.postMessage({
            type: 'PROPAGATE_BATCH',
            data: batchData
        });
    }

    private processSatelliteBatchSync(
        satellites: SatelliteData[],
        time: Date,
        startIndex: number
    ): void {
        // Process each satellite in the batch synchronously
        for (let i = 0; i < satellites.length; i++) {
            const satelliteData = satellites[i];
            const globalIndex = startIndex + i;

            // Skip update if time hasn't changed significantly
            if (satelliteData.lastUpdateTime && Math.abs(time.getTime() - satelliteData.lastUpdateTime.getTime()) < 50) {
                continue;
            }

            let propagationSuccess = false;

            // Direct propagation based on method - directly modifies positions array
            if (satelliteData.propagationMethod === "k2") {
                propagationSuccess = this.propagateK2(satelliteData, time, globalIndex);
            } else {
                propagationSuccess = this.propagateSatelliteJs(satelliteData, time, globalIndex);
            }

            if (propagationSuccess) {
                // Update color, visibility, and size
                const i3 = globalIndex * 3;

                // Update color
                this.tempColor.setHex(satelliteData.color);
                this.colors[i3] = this.tempColor.r;
                this.colors[i3 + 1] = this.tempColor.g;
                this.colors[i3 + 2] = this.tempColor.b;

                // Update visibility
                this.visibility[globalIndex] = satelliteData.isVisible ? 1 : 0;

                // Update size
                this.sizes[globalIndex] = satelliteData.size;

                // Update last update time
                satelliteData.lastUpdateTime = time;
            }
        }
    }

    // Removed sync fallback method - using async batches only

    private updateInstancedMesh(): void {
        const satellites = this.getAllSatellites();
        // Only instanced rendering supported
        this.updateInstancedMeshSystem(satellites);
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

    // SatPoints system removed

    // Particle system removed

    private updateInstanceData(satellites: SatelliteData[]): void {
        if (!this.instancedMesh || !this.satelliteGeometry) return;

        const translateAttribute = this.satelliteGeometry.attributes.translate as THREE.InstancedBufferAttribute;
        const colorAttribute = this.satelliteGeometry.attributes.color as THREE.InstancedBufferAttribute;
        const translateArray = translateAttribute.array as Float32Array;
        const colorArray = colorAttribute.array as Float32Array;

        // Copy from our direct arrays to the geometry attributes
        const satelliteCount = satellites.length;

        // Direct array copy for maximum performance
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

    // Particle system creation removed

    // Particle system methods removed

    // SatPoints system creation removed

    // SatPoints data update removed
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

    public getCurrentSystem(): THREE.Object3D | null {
        return this.instancedMesh;
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
            isOptimized: this.instancedMesh !== null,
            systemType: "instanced",
        };
    }

    public setRenderingSystem(_system: RenderingSystem): void {
        // Only instanced rendering supported
        console.log("Only instanced rendering is supported");
    }

    // Rendering system cleanup removed - only instanced supported

    // SatPoints size methods removed

    public setOcclusionCulling(enabled: boolean): void {
        this.options.enableOcclusionCulling = enabled;
    }

    public getOcclusionCulling(): boolean {
        return this.options.enableOcclusionCulling;
    }

    public getRenderingSystem(): RenderingSystem {
        return "instanced";
    }

    // Particle size methods removed

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

        // Only instanced rendering supported
        this.updateInstancedMeshSystem(satellites);

        this.update(this.currentTime, 0, 0, 0, 0);
        // Restore the original mesh updates setting
        this.meshUpdatesEnabled = wasMeshUpdatesEnabled;

        console.log(`Mesh updated with ${satellites.length} satellites (mesh updates remain ${wasMeshUpdatesEnabled ? "enabled" : "disabled"})`);
    }

    public dispose(): void {
        this.clearAll();
        this.satellites.clear();

        // Clean up worker
        if (this.propagationWorker) {
            this.propagationWorker.terminate();
            this.propagationWorker = null;
        }
        this.pendingBatches.clear();

        // Clean up shared memory
        this.sharedArrayBuffer = null;
        this.sharedPositions = null;
        this.sharedColors = null;
        this.sharedVisibility = null;
        this.sharedSizes = null;

        // Clean up instanced mesh
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.satelliteGeometry?.dispose();
            this.satelliteMaterial?.dispose();
            this.instancedMesh = null;
            this.satelliteGeometry = null;
            this.satelliteMaterial = null;
        }
    }
}
