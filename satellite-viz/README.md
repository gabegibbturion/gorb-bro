# Satellite Visualization

A Three.js-based satellite visualization application that renders thousands of satellites in real-time.

## Features

- Real-time satellite rendering using Three.js
- Orbital mechanics simulation with RK2 propagation
- Interactive camera controls
- Custom shader materials for satellite points
- Responsive design

## Getting Started

### Prerequisites

- Node.js (v20.19.0 or higher recommended)
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

## Project Structure

- `src/main.ts` - Main application entry point
- `src/SatPoints.ts` - Custom satellite points class with shader support
- `src/DynOrbits.ts` - Dynamic orbit visualization class
- `index.html` - HTML template with loading screen

## Technical Details

### Satellite Data
The application currently uses mock satellite data generated with random orbital parameters. Each satellite has:
- Position (x, y, z coordinates)
- Velocity (vx, vy, vz components)
- Orbital period
- Color information

### Orbital Mechanics
Satellites are propagated using a Runge-Kutta 2nd order (RK2) method with Earth's gravitational constant:
- `MU_EARTH = 0.000001536328985` (G*MassOfEarth in units of earth radius)

### Rendering
- Uses Three.js PointsMaterial with custom shaders
- Supports visibility culling and size scaling
- Real-time position updates with smooth animation

## Controls

- **Mouse**: Orbit around the satellite cloud
- **Scroll**: Zoom in/out
- **Pan**: Disabled for better orbital viewing

## Development

The project uses:
- Vite for fast development and building
- TypeScript for type safety
- Three.js for 3D graphics
- Custom shaders for satellite rendering

## Future Enhancements

- Real satellite data integration (TLE files)
- Earth globe visualization
- Satellite selection and information display
- Orbit trails visualization
- Performance optimizations for larger datasets
