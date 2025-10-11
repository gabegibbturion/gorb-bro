// SGP4 Propagator using satellite.js

import * as satellite from "satellite.js";
import type { IPropagator, OrbitalData, PropagationResult, TLE } from "../types";
import { ReferenceFrame } from "../types";

export class SGP4Propagator implements IPropagator {
    private satrec: satellite.SatRec | null = null;

    constructor(tle?: TLE) {
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
        } catch (error) {
            console.error("Failed to initialize SGP4 propagator:", error);
            this.satrec = null;
        }
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
            throw new Error("SGP4Propagator not initialized with TLE data");
        }

        // Convert timestamp to Date
        const date = new Date(time);

        // Propagate using SGP4
        const positionAndVelocity = satellite.propagate(this.satrec, date);

        if (!positionAndVelocity || typeof positionAndVelocity === "boolean") {
            throw new Error("SGP4 propagation failed");
        }

        // Extract position and velocity (in TEME frame)
        const position = positionAndVelocity.position;
        const velocity = positionAndVelocity.velocity;

        if (!position || !velocity || typeof position === "boolean" || typeof velocity === "boolean") {
            throw new Error("SGP4 propagation returned invalid state");
        }

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

        // Mean motion is in revolutions per day
        const meanMotion = this.satrec.no; // radians per minute
        if (meanMotion === 0) return null;

        // Period in minutes
        return (2 * Math.PI) / meanMotion;
    }

    /**
     * Get satellite name from TLE
     */
    static parseTLEName(tleString: string): string {
        const lines = tleString.trim().split("\n");
        if (lines.length >= 3) {
            return lines[0].trim();
        }
        return "Unknown";
    }

    /**
     * Validate TLE lines
     */
    static validateTLE(line1: string, line2: string): boolean {
        try {
            const satrec = satellite.twoline2satrec(line1, line2);
            return satrec.error === 0;
        } catch {
            return false;
        }
    }
}
