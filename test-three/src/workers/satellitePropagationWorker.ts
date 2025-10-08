import * as satellite from "satellite.js";

// Worker message types
export interface WorkerMessage {
    type: 'INITIALIZE' | 'PROPAGATE_BATCH' | 'SET_SHARED_MEMORY';
    data?: any;
}

export interface PropagationBatch {
    batchIndex: number;
    startIndex: number;
    batchSize: number;
    time: number; // timestamp
}

export interface SatelliteData {
    id: string;
    name: string;
    satrec: any;
    color: number;
    size: number;
    showTrail: boolean;
    trailLength: number;
    trailColor: number;
    showOrbit: boolean;
    orbitColor: number;
    propagationMethod: "satellite.js" | "k2";
    k2State: number[];
    lastUpdateTime: number | null; // timestamp
    isVisible: boolean;
    isSelected: boolean;
}

// Shared memory structure
export interface SharedMemoryLayout {
    positions: Float32Array;
    colors: Float32Array;
    visibility: Float32Array;
    sizes: Float32Array;
    satelliteData: SatelliteData[];
    maxSatellites: number;
}

// Worker state
let isInitialized = false;
let sharedMemory: SharedMemoryLayout | null = null;

// Initialize worker
function initializeWorker(): void {
    isInitialized = true;
    console.log('Satellite propagation worker initialized');
}

// Set up shared memory
function setSharedMemory(memory: SharedMemoryLayout): void {
    sharedMemory = memory;
    console.log('Shared memory set up in worker');
}

// Direct propagation methods for maximum performance with shared memory
function propagateSatelliteJsShared(satelliteData: SatelliteData, time: Date, index: number): boolean {
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

            // Directly update the shared memory positions array
            const i3 = index * 3;
            sharedMemory!.positions[i3] = pos.x * scaleFactor;
            sharedMemory!.positions[i3 + 1] = pos.y * scaleFactor;
            sharedMemory!.positions[i3 + 2] = pos.z * scaleFactor;

            return true;
        }
    } catch (error) {
        // Propagation error
    }
    return false;
}

function propagateK2Shared(satelliteData: SatelliteData, time: Date, index: number): boolean {
    // Initialize K2 state if needed
    if (satelliteData.k2State[0] === 0 && satelliteData.k2State[1] === 0 && satelliteData.k2State[2] === 0) {
        initializeK2State(satelliteData);
    }

    // Calculate time step in seconds
    const timeStep = (time.getTime() - (satelliteData.lastUpdateTime || time.getTime())) / 1000;

    if (Math.abs(timeStep) < 0.001) return false; // Skip very small time steps

    // Apply K2 propagation
    applyK2Propagation(satelliteData, timeStep);

    // Convert to Three.js units and directly update shared memory positions array
    const earthRadiusKm = 6371;
    const scaleFactor = 1 / earthRadiusKm;

    const i3 = index * 3;
    sharedMemory!.positions[i3] = satelliteData.k2State[0] * scaleFactor;
    sharedMemory!.positions[i3 + 1] = satelliteData.k2State[1] * scaleFactor;
    sharedMemory!.positions[i3 + 2] = satelliteData.k2State[2] * scaleFactor;

    return true;
}

// Legacy methods removed - using shared memory approach only

function initializeK2State(satelliteData: SatelliteData): void {
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

function applyK2Propagation(satelliteData: SatelliteData, dt: number): void {
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

// Process a batch of satellites with direct shared memory access
function processBatch(batch: PropagationBatch): void {
    if (!sharedMemory) {
        console.error('Shared memory not initialized');
        return;
    }

    const { batchIndex, startIndex, batchSize, time } = batch;
    const timeDate = new Date(time);

    let successCount = 0;

    // Process each satellite in the batch with direct memory access
    for (let i = 0; i < batchSize; i++) {
        const globalIndex = startIndex + i;
        const satelliteData = sharedMemory.satelliteData[globalIndex];

        if (!satelliteData) continue;

        // Skip update if time hasn't changed significantly
        if (satelliteData.lastUpdateTime && Math.abs(time - satelliteData.lastUpdateTime) < 50) {
            continue;
        }

        let propagationSuccess = false;

        // Direct propagation based on method - directly modifies shared memory
        if (satelliteData.propagationMethod === "k2") {
            propagationSuccess = propagateK2Shared(satelliteData, timeDate, globalIndex);
        } else {
            propagationSuccess = propagateSatelliteJsShared(satelliteData, timeDate, globalIndex);
        }

        if (propagationSuccess) {
            // Update color, visibility, and size directly in shared memory
            const i3 = globalIndex * 3;

            // Update color
            const tempColor = new THREE.Color(satelliteData.color);
            sharedMemory.colors[i3] = tempColor.r;
            sharedMemory.colors[i3 + 1] = tempColor.g;
            sharedMemory.colors[i3 + 2] = tempColor.b;

            // Update visibility
            sharedMemory.visibility[globalIndex] = satelliteData.isVisible ? 1 : 0;

            // Update size
            sharedMemory.sizes[globalIndex] = satelliteData.size;

            // Update last update time
            satelliteData.lastUpdateTime = time;

            successCount++;
        }
    }

    // Notify completion
    self.postMessage({
        type: 'BATCH_COMPLETE',
        data: { batchIndex, successCount }
    });
}

// Handle messages from main thread
self.onmessage = function (event: MessageEvent<WorkerMessage>) {
    const { type, data } = event.data;

    switch (type) {
        case 'INITIALIZE':
            initializeWorker();
            self.postMessage({ type: 'INITIALIZED' });
            break;

        case 'SET_SHARED_MEMORY':
            setSharedMemory(data as SharedMemoryLayout);
            self.postMessage({ type: 'SHARED_MEMORY_SET' });
            break;

        case 'PROPAGATE_BATCH':
            if (!isInitialized) {
                console.error('Worker not initialized');
                return;
            }

            if (!sharedMemory) {
                console.error('Shared memory not set');
                return;
            }

            try {
                processBatch(data as PropagationBatch);
            } catch (error) {
                console.error('Error processing batch:', error);
                self.postMessage({
                    type: 'PROPAGATION_ERROR',
                    data: { error: error instanceof Error ? error.message : 'Unknown error' }
                });
            }
            break;

        default:
            console.warn('Unknown message type:', type);
    }
};

// Import THREE.js for color handling
import * as THREE from "three";
