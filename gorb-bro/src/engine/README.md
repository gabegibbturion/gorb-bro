# Gorb Bro ECS Engine

A high-performance Entity Component System architecture for space visualization applications.

## Architecture Overview

The Gorb Bro ECS follows a hybrid architecture that separates:

-   **Data (Components)**: Pure data containers with no logic
-   **Logic (Systems)**: Processes entities with specific component combinations
-   **Orchestration (Engine)**: Coordinates entities, components, and systems

## Core Concepts

### Entity

A unique identifier (number) representing an object in the system. Entities are lightweight and have no data or behavior themselves.

### Component

Pure data containers attached to entities. Components are highly granular to support maximum flexibility.

### System

Contains the logic that operates on entities with specific component combinations. Systems run in priority order each frame.

### Service

Singleton utilities providing cross-cutting functionality (time management, rendering context, querying).

## Quick Start

### Automatic Mode (Recommended)

The engine handles animation loop and resizing automatically:

```typescript
import { Engine, RenderingService, TimeService, PropagationSystem, TransformSystem, RenderSystem, createRSO } from "./engine";

// Create services (auto-resize enabled by default)
const renderingService = new RenderingService(canvasElement);
const timeService = new TimeService(Date.now());

// Initialize engine
const engine = new Engine({
    services: {
        rendering: renderingService,
        time: timeService,
    },
    maxEntities: 100000,
});

// Add systems
engine.addSystem(new PropagationSystem());
engine.addSystem(new TransformSystem());
engine.addSystem(new RenderSystem());

// Create entities
const satellite = createRSO(engine, {
    line1: "1 25544U 98067A   21001.00000000  .00016717  00000-0  10270-3 0  9005",
    line2: "2 25544  51.6442 339.8364 0002571  31.2677 328.8693 15.48919393123456",
    name: "ISS (ZARYA)",
});

// Start the engine - handles everything automatically!
engine.start();

// Control the simulation
engine.pause(); // Pause
engine.resume(); // Resume
engine.stop(); // Stop completely
```

### Manual Mode (Advanced)

For custom control, disable automatic features:

```typescript
// Disable auto-resize
const renderingService = new RenderingService(canvasElement, { autoResize: false });

// Don't call engine.start(), use manual loop instead
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = 16;
    engine.update(deltaTime);
    renderingService.render();
}
animate();
```

## Component Types

All component types use enums instead of strings:

### ComponentType Enum

```typescript
enum ComponentType {
    POSITION = "position",
    VELOCITY = "velocity",
    ORBITAL_ELEMENTS = "orbitalElements",
    PROPAGATOR = "propagator",
    BILLBOARD = "billboard",
    MESH = "mesh",
    LABEL = "label",
    TIME_VISIBILITY = "timeVisibility",
    LOD = "lod",
    TRANSFORM = "transform",
}
```

### Available Components

-   **PositionComponent**: 3D position with reference frame
-   **VelocityComponent**: 3D velocity vector
-   **OrbitalElementsComponent**: Orbital parameters (Keplerian, TLE, Cartesian)
-   **PropagatorComponent**: Orbital propagation algorithm
-   **BillboardComponent**: Sprite-based rendering
-   **MeshComponent**: 3D mesh rendering
-   **LabelComponent**: Text labels with styling
-   **TimeVisibilityComponent**: Time-based visibility control
-   **LODComponent**: Level-of-detail management
-   **TransformComponent**: Transform matrix for rendering

## Core Systems

### PropagationSystem (Priority: 100)

Updates entity positions based on orbital elements using propagators.

**Required Components**: `ORBITAL_ELEMENTS`, `PROPAGATOR`  
**Optional Components**: `POSITION`, `VELOCITY`

### TransformSystem (Priority: 200)

Converts positions to render coordinates and manages transform matrices.

**Required Components**: `POSITION`  
**Optional Components**: `TRANSFORM`

### RenderSystem (Priority: 1000)

Manages visual representation of entities using Three.js.

**Required Components**: `POSITION`  
**Optional Components**: `BILLBOARD`, `MESH`, `LABEL`, `LOD`

## Services

### TimeService

Manages simulation time, time rates, and time system conversions.

```typescript
const timeService = engine.getService<TimeService>("time");
timeService.play();
timeService.pause();
timeService.setRate(2.0); // 2x speed
timeService.setTime(Date.now());
```

### RenderingService

Manages Three.js rendering context, scene, camera, and resource caching.

```typescript
const renderingService = engine.getService<RenderingService>("rendering");
renderingService.registerGeometry("sphere", geometry);
renderingService.registerMaterial("red", material);
renderingService.render();
```

### QueryService

Provides advanced entity querying capabilities.

```typescript
const queryService = engine.getQueryService();

// Find entities by components
const entities = queryService.findByComponents(ComponentType.POSITION, ComponentType.BILLBOARD);

// Spatial queries
const nearby = queryService.findInRadius(center, radius, ReferenceFrame.ECI);

// Time-based queries
const visible = queryService.findVisibleAt(timestamp);
```

## Entity Factories

Pre-built factory functions for common entity types:

### createRSO

Creates a Resident Space Object from TLE data.

```typescript
const satellite = createRSO(engine, {
    line1: "...",
    line2: "...",
    name: "ISS",
});
```

### createPoint

Creates a simple point entity.

```typescript
const point = createPoint(engine, x, y, z, ReferenceFrame.ECI, {
    color: 0xff0000,
    size: 100,
    label: "Point A",
});
```

### createGroundStation

Creates a ground station from lat/lon/alt.

```typescript
const station = createGroundStation(engine, 40.7128, -74.006, 0, "New York");
```

### createMeshEntity

Creates a custom 3D mesh entity.

```typescript
const mesh = createMeshEntity(
    engine,
    x,
    y,
    z,
    "sphere", // geometry name
    "red", // material name
    [1, 1, 1], // scale
    ReferenceFrame.ECI
);
```

## Custom Systems

Create your own systems by implementing the `System` interface:

```typescript
class CustomSystem implements System {
    name = "custom";
    priority = 500;
    requiredComponents = [ComponentType.POSITION];
    optionalComponents = [ComponentType.VELOCITY];

    init(engine: IEngine): void {
        // Initialize system
    }

    update(deltaTime: number, entities: EntityId[]): void {
        // Process entities
        for (const entity of entities) {
            const position = engine.getComponent(entity, ComponentType.POSITION);
            // ... custom logic
        }
    }

    cleanup(): void {
        // Cleanup resources
    }
}

engine.addSystem(new CustomSystem());
```

## Custom Components

Define custom components by extending the base component interface:

```typescript
interface CustomComponent extends BaseComponent {
    type: ComponentType; // Use existing or add new enum value
    customProperty: number;
    // ... other properties
}

// Add to entity
engine.addComponent(entity, {
    type: ComponentType.CUSTOM,
    customProperty: 42,
});
```

## Performance Considerations

1. **Component Pooling**: Reuses component instances to reduce GC pressure
2. **Dirty Flagging**: Only updates changed entities
3. **System Priority**: Controls execution order for optimal performance
4. **LOD System**: Reduces complexity for distant objects
5. **Frustum Culling**: Skips entities outside camera view

## Reference Frames

All position and velocity components include a reference frame:

```typescript
enum ReferenceFrame {
    ECI = "eci", // Earth-Centered Inertial
    ECEF = "ecef", // Earth-Centered Earth-Fixed
    J2000 = "j2000", // J2000 Inertial
    TEME = "teme", // True Equator Mean Equinox
    RENDER = "render", // Render coordinate system
}
```

## Time Systems

Multiple time systems are supported:

```typescript
enum TimeSystem {
    UTC = "utc",
    TAI = "tai",
    GPS = "gps",
    UNIX = "unix",
    JULIAN = "julian",
}
```

## Best Practices

1. **Use Enums**: Always use provided enums instead of string literals
2. **System Priority**: Lower numbers run first (100 for propagation, 1000 for rendering)
3. **Component Granularity**: Keep components small and focused
4. **Resource Registration**: Pre-register geometries and materials for reuse
5. **Query Optimization**: Use specific component queries instead of broad searches
6. **Memory Management**: Call `engine.cleanup()` when done

## Extension Points

-   **Custom Propagators**: Implement `IPropagator` interface
-   **Custom Systems**: Implement `System` interface
-   **Custom Components**: Add new component types
-   **Custom Queries**: Extend `QueryService`
-   **Frame Converters**: Implement `IFrameConverter` for coordinate transformations

## License

Part of the Gorb Bro space visualization framework.
