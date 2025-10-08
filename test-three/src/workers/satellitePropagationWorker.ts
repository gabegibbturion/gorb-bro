import * as satellite from "satellite.js";

// Worker message types
export interface WorkerMessage {
    type: 'INITIALIZE' | 'SET_SHARED_BUFFER' | 'PROCESS_SATELLITES';
    data?: any;
}

export interface PropagationBatch {
    batchIndex: number;
    startIndex: number;
    batchSize: number;
    time: number;
    satellites: SatelliteData[];
}

export interface SatelliteData {
    satrec: satellite.SatRec | null;
    propagationMethod: "satellite.js" | "k2";
    lastUpdateTime: number | null;
    isVisible: boolean;
    color: number;
    size: number;
    tle?: {
        line1: string;
        line2: string;
        epoch: string;
    };
    k2State?: Float64Array;
}

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
let sharedBuffer: SharedArrayBuffer | null = null;
let positionsBuffer: Float32Array | null = null;
let colorsBuffer: Float32Array | null = null;
let visibilityBuffer: Float32Array | null = null;
let sizesBuffer: Float32Array | null = null;
let controlBuffer: Int32Array | null = null;
let maxSatellites: number = 0;

// Initialize worker
function initializeWorker(): void {
    isInitialized = true;
    console.log('Satellite propagation worker initialized (using ring buffer)');
}

// Set up shared buffer
function setSharedBuffer(buffer: SharedArrayBuffer, maxSats: number): void {
    sharedBuffer = buffer;
    maxSatellites = maxSats;

    // Create views into the shared buffer
    let offset = 0;
    const positionsSize = maxSatellites * 3 * 4;
    const colorsSize = maxSatellites * 3 * 4;
    const visibilitySize = maxSatellites * 4;
    const sizesSize = maxSatellites * 4;

    positionsBuffer = new Float32Array(sharedBuffer, offset, maxSatellites * 3);
    offset += positionsSize;

    colorsBuffer = new Float32Array(sharedBuffer, offset, maxSatellites * 3);
    offset += colorsSize;

    visibilityBuffer = new Float32Array(sharedBuffer, offset, maxSatellites);
    offset += visibilitySize;

    sizesBuffer = new Float32Array(sharedBuffer, offset, maxSatellites);
    offset += sizesSize;

    controlBuffer = new Int32Array(sharedBuffer, offset, 8);

    console.log('Ring buffer set up in worker');
}


// Ring buffer propagation methods
function propagateSatelliteJsRingBuffer(satelliteData: any, time: Date, index: number): boolean {
    if (!positionsBuffer) return false;

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

            // Directly update the positions buffer
            const i3 = index * 3;
            positionsBuffer[i3] = pos.x * scaleFactor;
            positionsBuffer[i3 + 1] = pos.y * scaleFactor;
            positionsBuffer[i3 + 2] = pos.z * scaleFactor;

            return true;
        }
    } catch (error) {
        // Propagation error
        console.warn('Satellite.js propagation failed:', error);
    }
    return false;
}

function propagateK2RingBuffer(satelliteData: any, time: Date, index: number): boolean {
    if (!positionsBuffer) return false;

    try {
        // Initialize K2 state if needed
        if (satelliteData.k2State[0] === 0 && satelliteData.k2State[1] === 0 && satelliteData.k2State[2] === 0) {
            initializeK2State(satelliteData, time);
        }

        // Calculate time step in seconds
        const timeStep = (time.getTime() - (satelliteData.lastUpdateTime || time.getTime())) / 1000;

        if (Math.abs(timeStep) < 0.001) return false; // Skip very small time steps

        // Apply K2 propagation
        applyK2Propagation(satelliteData, timeStep);

        // Convert to Three.js units and directly update positions buffer
        const earthRadiusKm = 6371;
        const scaleFactor = 1 / earthRadiusKm;

        const i3 = index * 3;
        positionsBuffer[i3] = satelliteData.k2State[0] * scaleFactor;
        positionsBuffer[i3 + 1] = satelliteData.k2State[1] * scaleFactor;
        positionsBuffer[i3 + 2] = satelliteData.k2State[2] * scaleFactor;

        return true;
    } catch (error) {
        console.warn('K2 propagation failed:', error);
    }
    return false;
}

// Helper functions for K2 propagation
function initializeK2State(satelliteData: any, time: Date): void {
    const positionAndVelocity = satellite.propagate(satelliteData.satrec, time);

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

}

function applyK2Propagation(satelliteData: any, dt: number): void {
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

// Handle messages from main thread
self.onmessage = function (event: MessageEvent<WorkerMessage>) {
    const { type, data } = event.data;

    switch (type) {
        case 'INITIALIZE':
            initializeWorker();
            self.postMessage({ type: 'INITIALIZED' });
            break;

        case 'SET_SHARED_BUFFER':
            if (!isInitialized) {
                console.error('Worker not initialized');
                return;
            }

            try {
                const { sharedBuffer, maxSatellites } = data;
                setSharedBuffer(sharedBuffer, maxSatellites);
                self.postMessage({ type: 'RING_BUFFER_READY' });
            } catch (error) {
                console.error('Error setting up shared buffer:', error);
                self.postMessage({
                    type: 'PROPAGATION_ERROR',
                    data: { error: error instanceof Error ? error.message : 'Unknown error' }
                });
            }
            break;

        case 'PROCESS_SATELLITES':
            if (!isInitialized || !controlBuffer) {
                console.error('Worker not properly initialized for satellite processing');
                return;
            }

            try {
                const { satellites, startIndex, time } = data;
                processSatellitesWithRingBuffer(satellites, startIndex, time);
            } catch (error) {
                console.error('Error processing satellites:', error);
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

// Process satellites with ring buffer (hybrid approach)
function processSatellitesWithRingBuffer(satellites: any[], startIndex: number, time: number): void {
    if (!controlBuffer || !positionsBuffer || !colorsBuffer || !visibilityBuffer || !sizesBuffer) return;

    console.log(`Processing ${satellites.length} satellites with ring buffer`);

    try {
        let successCount = 0;
        const timeDate = new Date(time);

        // Process each satellite
        for (let i = 0; i < satellites.length; i++) {
            const globalIndex = startIndex + i;
            const satelliteData = satellites[i];

            if (globalIndex >= maxSatellites) break;

            // Skip update if time hasn't changed significantly
            if (satelliteData.lastUpdateTime && Math.abs(time - satelliteData.lastUpdateTime) < 50) {
                continue;
            }

            let propagationSuccess = false;

            // Direct propagation based on method
            if (satelliteData.propagationMethod === "k2") {
                propagationSuccess = propagateK2RingBuffer(satelliteData, timeDate, globalIndex);
            } else {
                propagationSuccess = propagateSatelliteJsRingBuffer(satelliteData, timeDate, globalIndex);
            }

            if (propagationSuccess) {
                // Update last update time
                satelliteData.lastUpdateTime = time;
                successCount++;
            }
        }

        // Update success count atomically
        Atomics.store(controlBuffer, 7, successCount);

        // Mark as complete
        Atomics.store(controlBuffer, 3, 2); // Worker status = complete

        console.log(`Ring buffer processing complete: ${successCount} satellites updated`);

    } catch (error) {
        console.error('Error in ring buffer satellite processing:', error);
        Atomics.store(controlBuffer, 4, 1); // Error flag = 1
        Atomics.store(controlBuffer, 3, -1); // Worker status = error
    }
}

// Ring buffer approach - no transferable objects needed