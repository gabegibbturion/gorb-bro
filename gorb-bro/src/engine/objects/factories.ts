// Factory functions for creating default celestial objects

import type { IEngine, EntityId } from "../types";
import { Earth, type EarthConfig } from "./Earth";
import { Sun, type SunConfig } from "./Sun";
import { Moon, type MoonConfig } from "./Moon";

/**
 * Create a default Earth with basic configuration
 */
export async function createEarth(engine: IEngine, config?: EarthConfig): Promise<{ entity: EntityId; object: Earth }> {
    const earth = new Earth(config);
    const entity = await earth.create(engine);
    return { entity, object: earth };
}

/**
 * Create a realistic Earth with day/night textures
 */
export async function createRealisticEarth(
    engine: IEngine,
    textures: {
        day?: string;
        night?: string;
        clouds?: string;
        bump?: string;
    }
): Promise<{ entity: EntityId; object: Earth }> {
    const earth = new Earth({
        dayTextureUrl: textures.day,
        nightTextureUrl: textures.night,
        cloudsTextureUrl: textures.clouds,
        bumpMapUrl: textures.bump,
    });

    const entity = await earth.create(engine);
    return { entity, object: earth };
}

/**
 * Create a Sun positioned automatically based on current time
 */
export async function createSun(engine: IEngine, config?: SunConfig): Promise<{ entity: EntityId; object: Sun }> {
    const sun = new Sun(config);
    const entity = await sun.create(engine);
    return { entity, object: sun };
}

/**
 * Create a Moon positioned automatically based on current time
 */
export async function createMoon(engine: IEngine, config?: MoonConfig): Promise<{ entity: EntityId; object: Moon }> {
    const moon = new Moon(config);
    const entity = await moon.create(engine);
    return { entity, object: moon };
}

/**
 * Create a complete Earth-Moon-Sun system
 */
export async function createSolarSystem(
    engine: IEngine,
    config?: {
        earth?: EarthConfig;
        sun?: SunConfig;
        moon?: MoonConfig;
    }
): Promise<{
    earth: { entity: EntityId; object: Earth };
    sun: { entity: EntityId; object: Sun };
    moon: { entity: EntityId; object: Moon };
}> {
    const earth = await createEarth(engine, config?.earth);
    const sun = await createSun(engine, config?.sun);
    const moon = await createMoon(engine, config?.moon);

    return { earth, sun, moon };
}
