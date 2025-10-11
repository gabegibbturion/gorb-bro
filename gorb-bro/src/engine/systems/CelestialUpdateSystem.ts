// System to update celestial bodies (Earth rotation, Sun/Moon positions)

import type { System, EntityId, IEngine } from "../types";
import type { Earth } from "../objects/Earth";
import type { Sun } from "../objects/Sun";
import type { Moon } from "../objects/Moon";

export interface CelestialBodies {
    earth?: Earth;
    sun?: Sun;
    moon?: Moon;
}

export class CelestialUpdateSystem implements System {
    name = "celestialUpdate";
    priority = 50; // Run before propagation
    requiredComponents = [];

    private celestialBodies: CelestialBodies = {};
    private lastSunMoonUpdate: number = 0;
    private sunMoonUpdateInterval: number = 60000; // Update every minute

    init(_engine: IEngine): void {
        // No initialization needed
    }

    /**
     * Register celestial bodies to be updated
     */
    registerCelestialBodies(bodies: CelestialBodies): void {
        this.celestialBodies = bodies;
    }

    /**
     * Set how often sun/moon positions update (in milliseconds)
     */
    setSunMoonUpdateInterval(interval: number): void {
        this.sunMoonUpdateInterval = interval;
    }

    update(deltaTime: number, _entities: EntityId[]): void {
        const now = Date.now();

        // Update Earth rotation
        if (this.celestialBodies.earth) {
            this.celestialBodies.earth.updateRotation(deltaTime);
        }

        // Update Sun and Moon positions periodically
        if (now - this.lastSunMoonUpdate >= this.sunMoonUpdateInterval) {
            if (this.celestialBodies.sun) {
                this.celestialBodies.sun.updateSunPosition(new Date(now));
            }

            if (this.celestialBodies.moon) {
                this.celestialBodies.moon.updateMoonPosition(new Date(now));
            }

            this.lastSunMoonUpdate = now;
        }
    }

    cleanup(): void {
        this.celestialBodies = {};
    }
}
