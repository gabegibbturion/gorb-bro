// Entity Factory Functions - create common entity types

import type {
    EntityId,
    IEngine,
    TLE,
    OrbitalElementsComponent,
    PropagatorComponent,
    BillboardComponent,
    LabelComponent,
    PositionComponent,
    MeshComponent,
    IPropagator,
} from "../types";
import { ComponentType, OrbitalFormat, ReferenceFrame } from "../types";

// ============================================================================
// Simple Mock Propagator for demonstration
// ============================================================================

class MockSGP4Propagator implements IPropagator {
    propagate(_elements: any, time: number) {
        // Simple circular orbit for demonstration
        const angle = (time / 10000) % (2 * Math.PI);
        const radius = 7000; // km from Earth center

        return {
            position: {
                x: radius * Math.cos(angle),
                y: radius * Math.sin(angle),
                z: 0,
            },
            velocity: {
                vx: -radius * Math.sin(angle) * 0.001,
                vy: radius * Math.cos(angle) * 0.001,
                vz: 0,
            },
            frame: ReferenceFrame.ECI,
        };
    }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a Resident Space Object (RSO) entity from TLE data
 */
export function createRSO(engine: IEngine, tle: TLE): EntityId {
    const entity = engine.createEntity();

    // Add orbital elements component
    const orbitalElements: OrbitalElementsComponent = {
        type: ComponentType.ORBITAL_ELEMENTS,
        format: OrbitalFormat.TLE,
        data: tle,
        epoch: Date.now(),
    };
    engine.addComponent(entity, orbitalElements);

    // Add propagator component (propagator knows its own algorithm)
    const propagator: PropagatorComponent = {
        type: ComponentType.PROPAGATOR,
        propagator: new MockSGP4Propagator(),
    };
    engine.addComponent(entity, propagator);

    // Add billboard component for rendering
    const billboard: BillboardComponent = {
        type: ComponentType.BILLBOARD,
        size: 50,
        color: 0xffffff,
        sizeAttenuation: true,
    };
    engine.addComponent(entity, billboard);

    // Add label component
    const label: LabelComponent = {
        type: ComponentType.LABEL,
        text: tle.name || "Unknown Satellite",
        offset: [0, 20],
        style: {
            fontSize: 12,
            color: "#FFFFFF",
        },
    };
    engine.addComponent(entity, label);

    return entity;
}

/**
 * Creates a ground station entity
 */
export function createGroundStation(engine: IEngine, lat: number, lon: number, alt: number, name?: string): EntityId {
    const entity = engine.createEntity();

    // Convert LLA to ECEF (simplified conversion for demo)
    const ecef = llaToECEF(lat, lon, alt);

    // Add position component
    const position: PositionComponent = {
        type: ComponentType.POSITION,
        x: ecef.x,
        y: ecef.y,
        z: ecef.z,
        frame: ReferenceFrame.ECEF,
    };
    engine.addComponent(entity, position);

    // Add mesh component
    const mesh: MeshComponent = {
        type: ComponentType.MESH,
        geometry: "ground-station",
        material: "ground-station",
        scale: [100, 100, 100],
    };
    engine.addComponent(entity, mesh);

    // Add label if name provided
    if (name) {
        const label: LabelComponent = {
            type: ComponentType.LABEL,
            text: name,
            offset: [0, 30],
            style: {
                fontSize: 14,
                color: "#00FF00",
            },
        };
        engine.addComponent(entity, label);
    }

    return entity;
}

/**
 * Creates a simple point entity at a specific position
 */
export function createPoint(
    engine: IEngine,
    x: number,
    y: number,
    z: number,
    frame: ReferenceFrame = ReferenceFrame.ECI,
    options?: {
        color?: number;
        size?: number;
        label?: string;
    }
): EntityId {
    const entity = engine.createEntity();

    // Add position component
    const position: PositionComponent = {
        type: ComponentType.POSITION,
        x,
        y,
        z,
        frame,
    };
    engine.addComponent(entity, position);

    // Add billboard component
    const billboard: BillboardComponent = {
        type: ComponentType.BILLBOARD,
        size: options?.size || 30,
        color: options?.color || 0xffffff,
        sizeAttenuation: true,
    };
    engine.addComponent(entity, billboard);

    // Add label if provided
    if (options?.label) {
        const label: LabelComponent = {
            type: ComponentType.LABEL,
            text: options.label,
            offset: [0, 15],
            style: {
                fontSize: 12,
                color: "#FFFFFF",
            },
        };
        engine.addComponent(entity, label);
    }

    return entity;
}

/**
 * Creates a custom mesh entity
 */
export function createMeshEntity(
    engine: IEngine,
    x: number,
    y: number,
    z: number,
    geometry: string,
    material: string,
    scale: [number, number, number] = [1, 1, 1],
    frame: ReferenceFrame = ReferenceFrame.ECI
): EntityId {
    const entity = engine.createEntity();

    // Add position component
    const position: PositionComponent = {
        type: ComponentType.POSITION,
        x,
        y,
        z,
        frame,
    };
    engine.addComponent(entity, position);

    // Add mesh component
    const mesh: MeshComponent = {
        type: ComponentType.MESH,
        geometry,
        material,
        scale,
    };
    engine.addComponent(entity, mesh);

    return entity;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts Latitude, Longitude, Altitude to ECEF coordinates
 * Simplified version for demonstration
 */
function llaToECEF(lat: number, lon: number, alt: number): { x: number; y: number; z: number } {
    // WGS84 constants
    const a = 6378137.0; // Earth semi-major axis in meters
    const f = 1 / 298.257223563; // Flattening
    const e2 = 2 * f - f * f; // Square of eccentricity

    // Convert to radians
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;

    // Calculate radius of curvature
    const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));

    // Calculate ECEF coordinates
    const x = (N + alt) * Math.cos(latRad) * Math.cos(lonRad);
    const y = (N + alt) * Math.cos(latRad) * Math.sin(lonRad);
    const z = (N * (1 - e2) + alt) * Math.sin(latRad);

    return { x, y, z };
}

/**
 * Parses a TLE string into a TLE object
 */
export function parseTLEString(tleString: string): TLE {
    const lines = tleString.trim().split("\n");

    if (lines.length < 2) {
        throw new Error("Invalid TLE format: expected at least 2 lines");
    }

    const tle: TLE = {
        line1: lines[lines.length - 2].trim(),
        line2: lines[lines.length - 1].trim(),
    };

    // If there are 3 lines, the first is the name
    if (lines.length >= 3) {
        tle.name = lines[0].trim();
    }

    return tle;
}
