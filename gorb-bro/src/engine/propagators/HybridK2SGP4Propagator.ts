// Hybrid K2/SGP4 Propagator
// Uses SGP4 for periodic high-accuracy updates and K2 for fast intermediate steps

import * as satellite from "satellite.js";
import type { IPropagator, OrbitalData, PropagationResult, TLE } from "../types";
import { ReferenceFrame } from "../types";
import { rk2Step, MU_EARTH } from "../utils/OrbitalMath";

export interface HybridK2SGP4Config {
    /**
     * How often to update with SGP4 (in milliseconds)
     * Default: 60000 (1 minute)
     */
    sgp4UpdateInterval?: number;

    /**
     * Stagger offset for this satellite (in milliseconds)
     * Used to spread SGP4 updates across frames
     * Default: 0
     */
    staggerOffset?: number;

    /**
     * Time jump threshold (in seconds)
     * If time jump exceeds this, force SGP4 update
     * Default: 1000
     */
    timeJumpThreshold?: number;

    /**
     * Use RK2 for intermediate propagation
     * If false, always uses SGP4
     * Default: true
     */
    useK2?: boolean;
}

export class HybridK2SGP4Propagator implements IPropagator {
    private satrec: satellite.SatRec | null = null;
    private config: Required<HybridK2SGP4Config>;

    // State tracking
    private lastSGP4UpdateTime: number = 0;
    private lastPropagationTime: number = 0;
    private cachedState: number[] | null = null; // [x, y, z, vx, vy, vz] in km and km/s

    constructor(tle?: TLE, config: HybridK2SGP4Config = {}) {
        this.config = {
            sgp4UpdateInterval: config.sgp4UpdateInterval ?? 60000, // 1 minute
            staggerOffset: config.staggerOffset ?? 0,
            timeJumpThreshold: config.timeJumpThreshold ?? 1000, // seconds
            useK2: config.useK2 ?? true,
        };

        if (tle) {
            this.initializeFromTLE(tle);
        }
    }

    /**
     * Initialize the propagator from TLE data
     */
    initializeFromTLE(tle: TLE): void {
        try {
            this.satrec = satellite.twoline2satrec(tle.line1, tle.line2);
            // Reset state
            this.lastSGP4UpdateTime = 0;
            this.lastPropagationTime = 0;
            this.cachedState = null;
        } catch (error) {
            console.error("Failed to initialize HybridK2SGP4 propagator:", error);
            this.satrec = null;
        }
    }

    /**
     * Check if SGP4 update is needed
     */
    private needsSGP4Update(time: number): boolean {
        if (!this.lastSGP4UpdateTime) return true;

        // Check staggered update interval
        const timeSinceLastUpdate = time - this.lastSGP4UpdateTime;
        const effectiveInterval = this.config.sgp4UpdateInterval + this.config.staggerOffset;

        if (timeSinceLastUpdate >= effectiveInterval) {
            return true;
        }

        // Check for time jumps
        if (this.lastPropagationTime > 0) {
            const timeDelta = Math.abs(time - this.lastPropagationTime) / 1000; // Convert to seconds
            if (timeDelta > this.config.timeJumpThreshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * Propagate using SGP4
     */
    private propagateSGP4(time: number): PropagationResult {
        if (!this.satrec) {
            throw new Error("HybridK2SGP4Propagator not initialized with TLE data");
        }

        const date = new Date(time);
        const positionAndVelocity = satellite.propagate(this.satrec, date);

        if (!positionAndVelocity || typeof positionAndVelocity === "boolean") {
            throw new Error("SGP4 propagation failed");
        }

        const position = positionAndVelocity.position;
        const velocity = positionAndVelocity.velocity;

        if (!position || !velocity || typeof position === "boolean" || typeof velocity === "boolean") {
            throw new Error("SGP4 propagation returned invalid state");
        }

        // Cache state for K2 propagation
        this.cachedState = [position.x, position.y, position.z, velocity.x, velocity.y, velocity.z];

        this.lastSGP4UpdateTime = time;

        return {
            position: {
                x: position.x,
                y: position.y,
                z: position.z,
            },
            velocity: {
                vx: velocity.x,
                vy: velocity.y,
                vz: velocity.z,
            },
            frame: ReferenceFrame.TEME,
        };
    }

    /**
     * Propagate using K2 from cached state
     */
    private propagateK2(deltaTime: number): PropagationResult {
        if (!this.cachedState) {
            throw new Error("No cached state for K2 propagation");
        }

        // Clone cached state
        const state = [...this.cachedState];

        // Propagate using RK2
        rk2Step(deltaTime, state, MU_EARTH);

        // Update cached state
        this.cachedState = state;

        return {
            position: {
                x: state[0],
                y: state[1],
                z: state[2],
            },
            velocity: {
                vx: state[3],
                vy: state[4],
                vz: state[5],
            },
            frame: ReferenceFrame.TEME,
        };
    }

    /**
     * Propagate to a specific time
     */
    propagate(elements: OrbitalData, time: number): PropagationResult {
        // If elements is TLE, initialize satrec
        if ("line1" in elements && "line2" in elements) {
            if (!this.satrec) {
                this.initializeFromTLE(elements as TLE);
            }
        }

        if (!this.satrec) {
            throw new Error("HybridK2SGP4Propagator not initialized with TLE data");
        }

        // Determine if we need SGP4 update
        const useSGP4 = !this.config.useK2 || this.needsSGP4Update(time);

        let result: PropagationResult;

        if (useSGP4) {
            // Use SGP4 for high-accuracy update
            result = this.propagateSGP4(time);
        } else {
            // Use K2 for fast intermediate step
            const deltaTime = (time - this.lastPropagationTime) / 1000; // Convert to seconds
            result = this.propagateK2(deltaTime);
        }

        this.lastPropagationTime = time;
        return result;
    }

    /**
     * Check if propagator is initialized
     */
    isInitialized(): boolean {
        return this.satrec !== null;
    }

    /**
     * Get orbital period in minutes
     */
    getOrbitalPeriod(): number | null {
        if (!this.satrec) return null;

        const meanMotion = this.satrec.no; // radians per minute
        if (meanMotion === 0) return null;

        return (2 * Math.PI) / meanMotion;
    }

    /**
     * Set stagger offset for this satellite
     */
    setStaggerOffset(offset: number): void {
        this.config.staggerOffset = offset;
    }

    /**
     * Force SGP4 update on next propagation
     */
    forceSGP4Update(): void {
        this.lastSGP4UpdateTime = 0;
    }

    /**
     * Get statistics about propagation method usage
     */
    getStats(): {
        lastSGP4Update: number;
        lastPropagation: number;
        hasCachedState: boolean;
        staggerOffset: number;
    } {
        return {
            lastSGP4Update: this.lastSGP4UpdateTime,
            lastPropagation: this.lastPropagationTime,
            hasCachedState: this.cachedState !== null,
            staggerOffset: this.config.staggerOffset,
        };
    }
}
