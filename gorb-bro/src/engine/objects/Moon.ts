// Moon celestial body

import * as SunCalc from "suncalc";
import { CelestialBody, type CelestialBodyConfig } from "./CelestialBody";
import { ReferenceFrame } from "../types";

export interface MoonConfig extends Partial<CelestialBodyConfig> {
    autoPosition?: boolean; // Automatically position based on current time
    useRealDistance?: boolean; // Use actual moon distance (384400 km)
    visualDistance?: number; // Distance for visualization
}

export class Moon extends CelestialBody {
    private autoPosition: boolean;
    private visualDistance: number;

    constructor(config: MoonConfig = {}) {
        super({
            radius: 1737, // km (actual moon radius)
            segments: 32,
            color: 0xaaaaaa,
            frame: ReferenceFrame.ECI,
            ...config,
        });

        this.autoPosition = config.autoPosition ?? true;
        this.visualDistance = config.useRealDistance ? 384400 : config.visualDistance ?? 50000;
    }

    async create(engine: any): Promise<number> {
        const entity = await super.create(engine);

        // Position moon if auto-positioning is enabled
        if (this.autoPosition) {
            this.updateMoonPosition();
        }

        return entity;
    }

    /**
     * Update moon position based on current time
     */
    updateMoonPosition(time?: Date): void {
        if (!this.engine) return;

        const date = time ?? new Date();

        // Get moon position using SunCalc
        const moonPosition = SunCalc.getMoonPosition(date, 0, 0);

        // Convert to Cartesian coordinates similar to sun
        const azimuth = moonPosition.azimuth;
        const altitude = moonPosition.altitude;

        const x = this.visualDistance * Math.cos(altitude) * Math.sin(azimuth);
        const y = this.visualDistance * Math.sin(altitude);
        const z = this.visualDistance * Math.cos(altitude) * Math.cos(azimuth);

        this.updatePosition(x, y, z);
    }

    /**
     * Get moon position for a specific time and location
     */
    static getMoonPosition(date: Date, latitude: number, longitude: number) {
        return SunCalc.getMoonPosition(date, latitude, longitude);
    }

    /**
     * Get moon illumination (phase, angle, fraction)
     */
    static getMoonIllumination(date: Date) {
        return SunCalc.getMoonIllumination(date);
    }

    /**
     * Get moon rise and set times
     */
    static getMoonTimes(date: Date, latitude: number, longitude: number) {
        return SunCalc.getMoonTimes(date, latitude, longitude);
    }
}
