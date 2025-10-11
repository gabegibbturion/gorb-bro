// Common orbital mechanics math utilities

/**
 * Earth's gravitational parameter in km^3/s^2
 */
export const MU_EARTH = 398600.4418;

/**
 * Earth's radius in km
 */
export const EARTH_RADIUS = 6371.0;

/**
 * Convert degrees to radians
 */
export function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

/**
 * Normalize an angle to [0, 2*PI)
 */
export function normalizeAngle(angle: number): number {
    const twoPi = 2 * Math.PI;
    let normalized = angle % twoPi;
    if (normalized < 0) {
        normalized += twoPi;
    }
    return normalized;
}

/**
 * Calculate the magnitude of a 3D vector
 */
export function vectorMagnitude(x: number, y: number, z: number): number {
    return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Normalize a 3D vector
 */
export function normalizeVector(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const mag = vectorMagnitude(x, y, z);
    if (mag === 0) return { x: 0, y: 0, z: 0 };
    return { x: x / mag, y: y / mag, z: z / mag };
}

/**
 * Dot product of two 3D vectors
 */
export function dotProduct(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
): number {
    return x1 * x2 + y1 * y2 + z1 * z2;
}

/**
 * Cross product of two 3D vectors
 */
export function crossProduct(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
): { x: number; y: number; z: number } {
    return {
        x: y1 * z2 - z1 * y2,
        y: z1 * x2 - x1 * z2,
        z: x1 * y2 - y1 * x2,
    };
}

/**
 * Calculate orbital period from semi-major axis
 * @param a Semi-major axis in km
 * @returns Period in seconds
 */
export function orbitalPeriod(a: number): number {
    return 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
}

/**
 * Calculate semi-major axis from mean motion
 * @param meanMotion Mean motion in radians per minute
 * @returns Semi-major axis in km
 */
export function semiMajorAxisFromMeanMotion(meanMotion: number): number {
    // Convert mean motion to radians per second
    const n = meanMotion / 60;
    return Math.pow(MU_EARTH / (n * n), 1 / 3);
}

/**
 * RK2 (Runge-Kutta 2nd order) propagation step
 * Uses two-body dynamics (only gravitational force)
 * 
 * @param dt Time step in seconds
 * @param state State vector [x, y, z, vx, vy, vz] in km and km/s
 * @param mu Gravitational parameter (default: Earth)
 */
export function rk2Step(
    dt: number,
    state: number[],
    mu: number = MU_EARTH
): void {
    const halfDT = dt * 0.5;

    // Position
    const rx = state[0];
    const ry = state[1];
    const rz = state[2];

    // Velocity
    const vx = state[3];
    const vy = state[4];
    const vz = state[5];

    // Calculate k1 (acceleration at current position)
    const r1Mag = vectorMagnitude(rx, ry, rz);
    const r1Cubed = r1Mag * r1Mag * r1Mag;
    const k1x = -mu * rx / r1Cubed;
    const k1y = -mu * ry / r1Cubed;
    const k1z = -mu * rz / r1Cubed;

    // Calculate k2 (acceleration at predicted midpoint)
    const r2x = rx + halfDT * vx;
    const r2y = ry + halfDT * vy;
    const r2z = rz + halfDT * vz;
    const r2Mag = vectorMagnitude(r2x, r2y, r2z);
    const r2Cubed = r2Mag * r2Mag * r2Mag;
    const k2x = -mu * r2x / r2Cubed;
    const k2y = -mu * r2y / r2Cubed;
    const k2z = -mu * r2z / r2Cubed;

    // Update velocity using RK2
    state[3] = vx + halfDT * (k1x + k2x);
    state[4] = vy + halfDT * (k1y + k2y);
    state[5] = vz + halfDT * (k1z + k2z);

    // Update position
    state[0] = rx + dt * state[3];
    state[1] = ry + dt * state[4];
    state[2] = rz + dt * state[5];
}

/**
 * RK4 (Runge-Kutta 4th order) propagation step
 * More accurate than RK2, but more computationally expensive
 * 
 * @param dt Time step in seconds
 * @param state State vector [x, y, z, vx, vy, vz] in km and km/s
 * @param mu Gravitational parameter (default: Earth)
 */
export function rk4Step(
    dt: number,
    state: number[],
    mu: number = MU_EARTH
): void {
    const halfDT = dt * 0.5;
    const sixthDT = dt / 6.0;

    const rx = state[0];
    const ry = state[1];
    const rz = state[2];
    const vx = state[3];
    const vy = state[4];
    const vz = state[5];

    // k1
    const r1Mag = vectorMagnitude(rx, ry, rz);
    const r1Cubed = r1Mag * r1Mag * r1Mag;
    const k1vx = vx;
    const k1vy = vy;
    const k1vz = vz;
    const k1ax = -mu * rx / r1Cubed;
    const k1ay = -mu * ry / r1Cubed;
    const k1az = -mu * rz / r1Cubed;

    // k2
    const r2x = rx + halfDT * k1vx;
    const r2y = ry + halfDT * k1vy;
    const r2z = rz + halfDT * k1vz;
    const v2x = vx + halfDT * k1ax;
    const v2y = vy + halfDT * k1ay;
    const v2z = vz + halfDT * k1az;
    const r2Mag = vectorMagnitude(r2x, r2y, r2z);
    const r2Cubed = r2Mag * r2Mag * r2Mag;
    const k2vx = v2x;
    const k2vy = v2y;
    const k2vz = v2z;
    const k2ax = -mu * r2x / r2Cubed;
    const k2ay = -mu * r2y / r2Cubed;
    const k2az = -mu * r2z / r2Cubed;

    // k3
    const r3x = rx + halfDT * k2vx;
    const r3y = ry + halfDT * k2vy;
    const r3z = rz + halfDT * k2vz;
    const v3x = vx + halfDT * k2ax;
    const v3y = vy + halfDT * k2ay;
    const v3z = vz + halfDT * k2az;
    const r3Mag = vectorMagnitude(r3x, r3y, r3z);
    const r3Cubed = r3Mag * r3Mag * r3Mag;
    const k3vx = v3x;
    const k3vy = v3y;
    const k3vz = v3z;
    const k3ax = -mu * r3x / r3Cubed;
    const k3ay = -mu * r3y / r3Cubed;
    const k3az = -mu * r3z / r3Cubed;

    // k4
    const r4x = rx + dt * k3vx;
    const r4y = ry + dt * k3vy;
    const r4z = rz + dt * k3vz;
    const v4x = vx + dt * k3ax;
    const v4y = vy + dt * k3ay;
    const v4z = vz + dt * k3az;
    const r4Mag = vectorMagnitude(r4x, r4y, r4z);
    const r4Cubed = r4Mag * r4Mag * r4Mag;
    const k4vx = v4x;
    const k4vy = v4y;
    const k4vz = v4z;
    const k4ax = -mu * r4x / r4Cubed;
    const k4ay = -mu * r4y / r4Cubed;
    const k4az = -mu * r4z / r4Cubed;

    // Update state
    state[0] = rx + sixthDT * (k1vx + 2 * k2vx + 2 * k3vx + k4vx);
    state[1] = ry + sixthDT * (k1vy + 2 * k2vy + 2 * k3vy + k4vy);
    state[2] = rz + sixthDT * (k1vz + 2 * k2vz + 2 * k3vz + k4vz);
    state[3] = vx + sixthDT * (k1ax + 2 * k2ax + 2 * k3ax + k4ax);
    state[4] = vy + sixthDT * (k1ay + 2 * k2ay + 2 * k3ay + k4ay);
    state[5] = vz + sixthDT * (k1az + 2 * k2az + 2 * k3az + k4az);
}

