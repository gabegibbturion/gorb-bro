// RSO (Resident Space Object) Entity Factory
// Simplifies creation of satellite entities with all necessary components

import type { IEngine, EntityId, TLE } from "../types";
import { ComponentType, OrbitalFormat } from "../types";
import { HybridK2SGP4Propagator } from "../propagators/HybridK2SGP4Propagator";

export interface RSOConfig {
    /**
     * TLE data for the satellite
     */
    tle: TLE;

    /**
     * Billboard color (default: 0x00ff00 - green)
     */
    color?: number;

    /**
     * Billboard size (default: 50)
     */
    size?: number;

    /**
     * SGP4 update interval in milliseconds (default: 60000 - 60 seconds)
     */
    sgp4UpdateInterval?: number;

    /**
     * Stagger offset for distributed propagation updates (default: 0)
     */
    staggerOffset?: number;

    /**
     * Use K2 for intermediate propagation steps (default: true)
     */
    useK2?: boolean;
}

/**
 * Create a satellite (RSO) entity with all necessary components
 */
export function createRSO(engine: IEngine, config: RSOConfig): EntityId {
    const entity = engine.createEntity();

    // Add orbital elements component
    engine.addComponent(entity, {
        type: ComponentType.ORBITAL_ELEMENTS,
        format: OrbitalFormat.TLE,
        data: config.tle,
        epoch: Date.now(),
    });

    // Add propagator component (Hybrid K2/SGP4 by default)
    engine.addComponent(entity, {
        type: ComponentType.PROPAGATOR,
        propagator: new HybridK2SGP4Propagator(config.tle, {
            sgp4UpdateInterval: config.sgp4UpdateInterval ?? 60000,
            staggerOffset: config.staggerOffset ?? 0,
            timeJumpThreshold: 1000,
            useK2: config.useK2 ?? true,
        }),
    });

    // Add billboard component for rendering
    engine.addComponent(entity, {
        type: ComponentType.BILLBOARD,
        size: config.size ?? 50,
        color: config.color ?? 0x00ff00,
        sizeAttenuation: true,
    });

    return entity;
}

/**
 * Create multiple RSO entities from an array of TLEs
 */
export function createRSOBatch(engine: IEngine, tles: TLE[], baseConfig: Omit<RSOConfig, "tle" | "staggerOffset"> = {}): EntityId[] {
    const entities: EntityId[] = [];

    // Calculate stagger offset per satellite for distributed updates
    const baseStaggerInterval = 1000; // 1 second base
    const staggerPerSat = baseStaggerInterval / Math.max(tles.length / 100, 1);

    for (let i = 0; i < tles.length; i++) {
        const entity = createRSO(engine, {
            ...baseConfig,
            tle: tles[i],
            staggerOffset: (i * staggerPerSat) % baseStaggerInterval,
        });

        entities.push(entity);
    }

    return entities;
}
