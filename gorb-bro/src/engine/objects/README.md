# Default Celestial Objects

Pre-built, configurable celestial bodies (Earth, Sun, Moon) with automatic positioning using real astronomical data.

## Features

-   🌍 **Earth** - Configurable with day/night textures, clouds, and rotation
-   ☀️ **Sun** - Self-illuminating with automatic positioning via SunCalc
-   🌙 **Moon** - Automatic positioning with phase calculations
-   🔧 **Extensible** - Base class for creating custom celestial bodies
-   📐 **Automatic Positioning** - Uses SunCalc for realistic sun/moon positions
-   🎨 **Customizable** - Full control over materials, textures, and appearance

## Quick Start

### Simple Earth-Moon-Sun System

```typescript
import { Engine } from "./engine";
import { createSolarSystem } from "./engine/objects";

const engine = new Engine(/* ... */);

// Create complete solar system with defaults
const { earth, sun, moon } = await createSolarSystem(engine);

// Earth rotates automatically!
engine.start();
```

### Individual Objects

```typescript
import { createEarth, createSun, createMoon } from "./engine/objects";

// Create Earth
const { entity: earthEntity, object: earth } = await createEarth(engine);

// Create Sun (auto-positioned based on current time)
const { entity: sunEntity, object: sun } = await createSun(engine);

// Create Moon (auto-positioned based on current time)
const { entity: moonEntity, object: moon } = await createMoon(engine);
```

### Custom Configuration

```typescript
import { createEarth, createSun } from "./engine/objects";

// Custom Earth
const { object: earth } = await createEarth(engine, {
    radius: 6371,
    segments: 128, // Higher detail
    rotationSpeed: (2 * Math.PI) / 86400000, // One rotation per day
    dayTextureUrl: "/textures/earth_day.jpg",
    nightTextureUrl: "/textures/earth_night.jpg",
    cloudsTextureUrl: "/textures/earth_clouds.png",
    bumpMapUrl: "/textures/earth_bump.jpg",
});

// Custom Sun
const { object: sun } = await createSun(engine, {
    radius: 695700,
    visualDistance: 150000, // Distance from Earth (for visualization)
    autoPosition: true, // Update position based on time
    useRealDistance: false, // Use visual distance instead of real distance
});
```

## Earth

### Basic Earth

```typescript
const { entity, object: earth } = await createEarth(engine);

// Update rotation manually
earth.updateRotation(deltaTime);

// Or let rotation happen automatically in your update loop
```

### Realistic Earth with Textures

```typescript
const { entity, object: earth } = await createRealisticEarth(engine, {
    day: "/textures/earth_day.jpg",
    night: "/textures/earth_night.jpg",
    clouds: "/textures/earth_clouds.png",
    bump: "/textures/earth_bump.jpg",
});
```

### Earth Configuration

```typescript
interface EarthConfig {
    radius?: number; // Default: 6371 km
    segments?: number; // Default: 64
    color?: number; // Fallback color if no texture
    dayTextureUrl?: string; // Day side texture
    nightTextureUrl?: string; // Night side (emissive)
    cloudsTextureUrl?: string; // Cloud layer
    bumpMapUrl?: string; // Bump/height map
    rotationSpeed?: number; // Radians per millisecond
    position?: { x: number; y: number; z: number };
    frame?: ReferenceFrame;
}
```

## Sun

### Auto-Positioned Sun

```typescript
const { entity, object: sun } = await createSun(engine);

// Update position based on new time
sun.updateSunPosition(new Date("2024-12-25T12:00:00Z"));
```

### Sun Position Utilities

```typescript
import { Sun } from "./engine/objects";

// Get sun position for specific time and location
const position = Sun.getSunPosition(new Date(), 40.7128, -74.006); // NYC
console.log(position.azimuth, position.altitude);

// Get sunrise/sunset times
const times = Sun.getSunTimes(new Date(), 40.7128, -74.006);
console.log(times.sunrise, times.sunset);
```

### Sun Configuration

```typescript
interface SunConfig {
    radius?: number; // Default: 695700 km
    segments?: number; // Default: 32
    color?: number; // Default: 0xffff00
    textureUrl?: string; // Sun surface texture
    autoPosition?: boolean; // Auto-position based on time (default: true)
    useRealDistance?: boolean; // Use actual sun distance (149.6M km)
    visualDistance?: number; // Custom distance for visualization (default: 200000 km)
    position?: { x: number; y: number; z: number };
    frame?: ReferenceFrame;
}
```

## Moon

### Auto-Positioned Moon

```typescript
const { entity, object: moon } = await createMoon(engine);

// Update position based on new time
moon.updateMoonPosition(new Date("2024-12-25T12:00:00Z"));
```

### Moon Utilities

```typescript
import { Moon } from "./engine/objects";

// Get moon position for specific time and location
const position = Moon.getMoonPosition(new Date(), 40.7128, -74.006);
console.log(position.azimuth, position.altitude);

// Get moon phase and illumination
const illumination = Moon.getMoonIllumination(new Date());
console.log(illumination.phase, illumination.fraction);

// Get moonrise/moonset times
const times = Moon.getMoonTimes(new Date(), 40.7128, -74.006);
console.log(times.rise, times.set);
```

### Moon Configuration

```typescript
interface MoonConfig {
    radius?: number; // Default: 1737 km
    segments?: number; // Default: 32
    color?: number; // Default: 0xaaaaaa
    textureUrl?: string; // Moon surface texture
    autoPosition?: boolean; // Auto-position based on time (default: true)
    useRealDistance?: boolean; // Use actual moon distance (384400 km)
    visualDistance?: number; // Custom distance for visualization (default: 50000 km)
    position?: { x: number; y: number; z: number };
    frame?: ReferenceFrame;
}
```

## Creating Custom Celestial Bodies

Extend the `CelestialBody` base class to create your own objects:

```typescript
import { CelestialBody, type CelestialBodyConfig } from "./engine/objects";

export class Mars extends CelestialBody {
    constructor(config: Partial<CelestialBodyConfig> = {}) {
        super({
            radius: 3389.5, // km
            segments: 64,
            color: 0xff4500, // Red-orange
            ...config,
        });
    }

    protected async createMaterial() {
        // Custom material for Mars
        const material = await super.createMaterial();
        // Add custom properties...
        return material;
    }
}

// Use it
const mars = new Mars({ textureUrl: "/textures/mars.jpg" });
await mars.create(engine);
```

## Integration with Engine Systems

The celestial objects work seamlessly with the ECS:

```typescript
// Create Earth
const { entity: earthEntity, object: earth } = await createEarth(engine);

// Earth now has a Position component that systems can query
const query = engine.getQueryService();
const earthPosition = engine.getComponent(earthEntity, ComponentType.POSITION);

// Update Earth rotation in a custom system
class EarthRotationSystem implements System {
    name = "earthRotation";
    priority = 150;
    requiredComponents = [ComponentType.POSITION];

    update(deltaTime: number, entities: EntityId[]) {
        // Update Earth rotation
        earth.updateRotation(deltaTime);
    }
}
```

## Complete Example

```typescript
import { Engine, RenderingService, TimeService } from "./engine";
import { createSolarSystem } from "./engine/objects";

async function main() {
    const canvas = document.querySelector("canvas")!;
    const engine = new Engine({
        services: {
            rendering: new RenderingService(canvas),
            time: new TimeService(Date.now()),
        },
    });

    // Add systems
    engine.addSystem(/* your systems */);

    // Create solar system
    const { earth, sun, moon } = await createSolarSystem(engine, {
        earth: {
            dayTextureUrl: "/textures/earth_day.jpg",
            nightTextureUrl: "/textures/earth_night.jpg",
            cloudsTextureUrl: "/textures/earth_clouds.png",
        },
        sun: {
            visualDistance: 200000,
            autoPosition: true,
        },
        moon: {
            visualDistance: 50000,
            autoPosition: true,
        },
    });

    // Update Earth rotation in animation loop
    setInterval(() => {
        earth.object.updateRotation(16); // ~60 FPS
    }, 16);

    // Update sun and moon positions every minute
    setInterval(() => {
        sun.object.updateSunPosition();
        moon.object.updateMoonPosition();
    }, 60000);

    // Start engine
    engine.start();
}

main();
```

## Notes

-   🌍 Earth rotation is **not** automatic by default - call `earth.updateRotation(deltaTime)` in your update loop
-   ☀️ Sun and Moon positions **are** updated automatically when created with `autoPosition: true`
-   📐 All objects use real-world sizes and distances (configurable with `visualDistance`)
-   🎨 Textures are optional - objects work with solid colors if no textures provided
-   🔧 All objects are fully compatible with the ECS architecture
-   ♻️ Call `.destroy()` on objects to properly clean up resources

## Performance Tips

-   Use lower `segments` values for distant objects
-   Disable clouds layer if not needed
-   Update sun/moon positions less frequently (they move slowly)
-   Use `visualDistance` instead of `useRealDistance` for better scale
