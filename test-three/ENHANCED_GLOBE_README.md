# Enhanced Globe Feature

## Overview

The Enhanced Globe is a high-quality Earth visualization system built with Three.js that provides realistic rendering with multiple texture layers, atmospheric effects, cloud shadows, and dynamic day/night lighting.

## Features

### 🌍 High-Resolution Textures
- **Day Texture**: Detailed Earth surface texture (`earth_day.jpg`)
- **Bump Map**: Surface elevation details (`Bump.jpg`)
- **Ocean Map**: Water vs. land differentiation with metalness and roughness (`Ocean.png`)
- **Night Lights**: City lights visible on the dark side (`night_high_res_adjusted.jpg`)
- **Cloud Layer**: Animated cloud coverage (`Clouds.png`)

### ✨ Visual Effects
1. **Atmospheric Scattering**: Blue atmospheric glow around the Earth using custom shaders
2. **Cloud Shadows**: Clouds cast realistic shadows on the Earth's surface
3. **Night Lights**: City lights automatically appear only on the dark side of the Earth
4. **Ocean Reflections**: Realistic ocean metalness and roughness
5. **Day/Night Transition**: Smooth transitions between day and night sides

### 🎮 Interactive Controls
- Toggle clouds visibility on/off
- Toggle atmosphere visibility on/off
- Adjust atmospheric parameters (opacity, power factor, multiplier)
- Toggle globe visibility
- Dynamic sun lighting based on real-time calculations

## Usage

### Basic Setup

```typescript
import { EnhancedGlobe } from './engine/EnhancedGlobe';
import * as THREE from 'three';

// Create the enhanced globe
const globe = new EnhancedGlobe({
    radius: 1.0,
    enableClouds: true,
    enableAtmosphere: true,
    enableNightLights: true,
    enableCloudShadows: true,
    speedFactor: 2.0,
});

// Initialize with textures
await globe.init();

// Add to your scene
const scene = new THREE.Scene();
scene.add(globe.getGroup());

// In your animation loop
function animate() {
    const deltaTime = clock.getDelta();
    globe.update(deltaTime * 1000);
    renderer.render(scene, camera);
}
```

### Integration with GlobeEngine

The Enhanced Globe is automatically integrated into the `GlobeEngine` when `useEnhancedGlobe: true` is set:

```typescript
const engine = new GlobeEngine({
    container: containerElement,
    useEnhancedGlobe: true, // Enable enhanced globe (default)
    maxSatellites: 2000000,
});
```

### Available Methods

```typescript
// Visibility controls
globe.setVisible(true);
globe.setCloudsVisible(true);
globe.setAtmosphereVisible(true);

// Parameter adjustments
globe.setParameters({
    atmOpacity: 0.7,
    atmPowFactor: 4.1,
    atmMultiplier: 9.5,
    metalness: 0.1,
    speedFactor: 2.0,
});

// Access individual components
const earthMesh = globe.getEarth();
const cloudsMesh = globe.getClouds();
const atmosphereMesh = globe.getAtmosphere();
const group = globe.getGroup();

// Cleanup
globe.dispose();
```

## Technical Details

### Shader Features

#### Earth Surface Shader
- **Cloud Shadows**: Calculates cloud coverage above each point and darkens the surface accordingly
- **Night Lights**: Uses dot product with sun direction to determine day/night regions
- **Ocean Rendering**: Reverses roughness map values for realistic water/land distinction
- **Atmospheric Edge Glow**: Adds subtle atmospheric coloring around the edges

#### Atmosphere Shader
- **Vertex Shader**: Calculates view-space normals and eye vectors
- **Fragment Shader**: Creates blue atmospheric glow using dot products and power functions
- **Additive Blending**: Renders atmosphere with additive blending for realistic transparency
- **Back-Side Rendering**: Renders on the back side to avoid overlaying on Earth

### Performance

- **Optimized Textures**: High-resolution textures with proper color space management
- **Efficient Updates**: Delta-time based animations with minimal overhead
- **GPU Shaders**: Custom GLSL shaders for complex visual effects
- **Lazy Loading**: Textures load asynchronously without blocking the main thread

### Texture Requirements

Place these textures in your `/public/assets/` directory:
- `earth_day.jpg` - Day-time Earth texture (recommended: 8K resolution)
- `Bump.jpg` - Elevation/bump map
- `Ocean.png` - Ocean/land mask (white=water, black=land)
- `night_high_res_adjusted.jpg` - Night lights texture
- `Clouds.png` - Cloud layer (alpha channel for transparency)

## Configuration Options

```typescript
interface EnhancedGlobeOptions {
    radius?: number;              // Globe radius (default: 1.0)
    sunIntensity?: number;        // Sun light intensity (default: 1.3)
    speedFactor?: number;         // Rotation speed multiplier (default: 2.0)
    metalness?: number;           // Ocean metalness (default: 0.1)
    atmOpacity?: number;          // Atmosphere opacity (default: 0.7)
    atmPowFactor?: number;        // Atmosphere power factor (default: 4.1)
    atmMultiplier?: number;       // Atmosphere intensity (default: 9.5)
    enableClouds?: boolean;       // Enable cloud layer (default: true)
    enableAtmosphere?: boolean;   // Enable atmosphere (default: true)
    enableNightLights?: boolean;  // Enable night lights (default: true)
    enableCloudShadows?: boolean; // Enable cloud shadows (default: true)
}
```

## UI Controls

The Globe component provides buttons to control:
- **Hide/Show Clouds**: Toggle cloud layer visibility
- **Hide/Show Atmosphere**: Toggle atmospheric glow
- **Hide/Show Globe**: Toggle entire globe visibility
- Real-time status indicators for all features

## Credits

This implementation is inspired by and adapted from Three.js Earth visualization examples, incorporating:
- Advanced shader techniques for realistic rendering
- Multi-layer texture composition
- Dynamic lighting calculations
- Performance optimizations for large-scale visualizations

## Future Enhancements

Potential improvements:
- [ ] Add seasonal variations
- [ ] Implement real-time weather data integration
- [ ] Add aurora borealis effects near poles
- [ ] Implement city lights based on population density data
- [ ] Add moon and sun position indicators
- [ ] Implement eclipse shadows

