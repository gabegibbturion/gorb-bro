# Three.js Globe Engine with Satellite Tracking

A Three.js-based globe visualization engine with satellite tracking capabilities using satellite.js for orbital mechanics.

## Features

- **3D Earth Globe**: High-resolution Earth texture with bump mapping
- **Satellite Tracking**: Real-time satellite position calculation using TLE data
- **Entity Management**: Add, remove, and manage multiple satellites
- **Time Control**: Play, pause, and speed control for time simulation
- **Interactive Controls**: Mouse controls for globe rotation and zoom
- **Satellite Trails**: Visual trails showing satellite paths
- **Real-time Updates**: Automatic position updates based on current time

## Architecture

### Core Components

1. **SatelliteEntity**: Individual satellite with TLE propagation
2. **EntityManager**: Manages satellite lifecycle and updates
3. **GlobeEngine**: Main engine handling rendering, camera, and time
4. **Globe Component**: React wrapper for the Three.js engine

### Key Classes

#### SatelliteEntity
- Handles TLE data parsing and satellite propagation
- Manages 3D visualization (mesh, trails, materials)
- Provides orbital elements and position/velocity data

#### EntityManager
- Manages collection of satellites
- Handles automatic updates and cleanup
- Provides query methods for satellite filtering

#### GlobeEngine
- Main rendering engine
- Camera and scene management
- Time control and animation loop
- Event system for callbacks

## Usage

```tsx
import Globe from './components/Globe';

function App() {
  const handleEngineReady = (engine) => {
    // Add satellites
    engine.addSatellite(tleData, options);
  };

  return (
    <Globe
      onEngineReady={handleEngineReady}
      onSatelliteUpdate={(satellites) => console.log(satellites)}
      onTimeUpdate={(time) => console.log(time)}
    />
  );
}
```

## Controls

- **Mouse Drag**: Rotate globe
- **Mouse Wheel**: Zoom in/out
- **Control Panel**: Add/remove satellites, control time speed

## Satellite Data

The engine uses TLE (Two-Line Element) data for satellite tracking:

```typescript
interface TLEData {
  name: string;
  line1: string;
  line2: string;
}
```

## Time Management

- Real-time updates by default
- Configurable time multiplier (1x, 10x, 100x)
- Manual time setting support
- Automatic satellite position updates

## Textures

The globe uses several texture maps:
- `earth_day.jpg`: Daytime Earth surface
- `Bump.jpg`: Height/bump mapping
- `Clouds.png`: Cloud overlay
- `night_high_res_adjusted.jpg`: Night lights

## Development

```bash
npm install
npm run dev
```

## Dependencies

- **three**: 3D graphics library
- **satellite.js**: Orbital mechanics calculations
- **react**: UI framework

## Future Enhancements

- Orbit visualization
- Satellite selection and info panels
- Multiple time zones
- Advanced camera controls
- Performance optimizations
- WebGL shader effects