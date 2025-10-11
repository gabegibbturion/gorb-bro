// Example usage of celestial objects - these are templates you can copy

import type { IEngine } from "../types";
import { createSolarSystem, createEarth, createSun, createMoon, createRealisticEarth } from "./factories";
import { CelestialBody, type CelestialBodyConfig } from "./CelestialBody";

/**
 * Example 1: Simple solar system with defaults
 */
export async function exampleSimpleSolarSystem(engine: IEngine) {
    const { earth, sun, moon } = await createSolarSystem(engine);

    // Earth rotation update (call this in your animation loop)
    const updateEarthRotation = (deltaTime: number) => {
        earth.object.updateRotation(deltaTime);
    };

    return { earth, sun, moon, updateEarthRotation };
}

/**
 * Example 2: Realistic Earth with textures
 */
export async function exampleRealisticEarth(engine: IEngine) {
    const { entity, object: earth } = await createRealisticEarth(engine, {
        day: "/textures/earth_day.jpg",
        night: "/textures/earth_night.jpg",
        clouds: "/textures/earth_clouds.png",
        bump: "/textures/earth_bump.jpg",
    });

    return { entity, earth };
}

/**
 * Example 3: Custom configuration
 */
export async function exampleCustomConfiguration(engine: IEngine) {
    const { object: earth } = await createEarth(engine, {
        radius: 6371,
        segments: 128, // Higher detail
        position: { x: 0, y: 0, z: 0 },
    });

    const { object: sun } = await createSun(engine, {
        visualDistance: 150000,
        autoPosition: true,
    });

    const { object: moon } = await createMoon(engine, {
        visualDistance: 40000,
        autoPosition: true,
    });

    return { earth, sun, moon };
}

/**
 * Example 4: Custom celestial body (Mars)
 */
export class Mars extends CelestialBody {
    constructor(config: Partial<CelestialBodyConfig> = {}) {
        super({
            radius: 3389.5, // km
            segments: 64,
            color: 0xff4500, // Red-orange
            position: { x: 225000000, y: 0, z: 0 },
            ...config,
        });
    }

    // Override material creation for custom appearance
    protected async createMaterial() {
        const material = await super.createMaterial();
        // Add Mars-specific customizations here
        return material;
    }
}

/**
 * Example 5: Update celestial positions over time
 */
export function examplePositionUpdates(sun: any, moon: any) {
    // Update sun and moon positions based on current time
    const updateCelestialPositions = () => {
        const now = new Date();
        sun.updateSunPosition(now);
        moon.updateMoonPosition(now);
    };

    // Update every minute (they move slowly)
    const interval = setInterval(updateCelestialPositions, 60000);

    // Cleanup function
    const cleanup = () => clearInterval(interval);

    return { updateCelestialPositions, cleanup };
}

/**
 * Example 6: Get sun/moon information
 */
export function exampleCelestialInfo() {
    const now = new Date();
    const latitude = 40.7128; // New York
    const longitude = -74.006;

    // Sun information
    import("./Sun").then(({ Sun }) => {
        const sunPos = Sun.getSunPosition(now, latitude, longitude);
        console.log("Sun position:", sunPos);

        const sunTimes = Sun.getSunTimes(now, latitude, longitude);
        console.log("Sunrise:", sunTimes.sunrise);
        console.log("Sunset:", sunTimes.sunset);
    });

    // Moon information
    import("./Moon").then(({ Moon }) => {
        const moonPos = Moon.getMoonPosition(now, latitude, longitude);
        console.log("Moon position:", moonPos);

        const moonIllumination = Moon.getMoonIllumination(now);
        console.log("Moon phase:", moonIllumination.phase);
        console.log("Moon illumination:", moonIllumination.fraction * 100 + "%");

        const moonTimes = Moon.getMoonTimes(now, latitude, longitude);
        console.log("Moonrise:", moonTimes.rise);
        console.log("Moonset:", moonTimes.set);
    });
}
