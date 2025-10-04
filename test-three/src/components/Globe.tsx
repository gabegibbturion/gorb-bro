import React, { useEffect, useRef, useState } from 'react';
import { GlobeEngine } from '../engine/GlobeEngine';
import type { ClassicalOrbitalElements } from '../engine/OrbitalElements';
import { OrbitalElementsGenerator } from '../engine/OrbitalElements';

interface GlobeProps {
    style?: React.CSSProperties;
    className?: string;
    onEngineReady?: (engine: GlobeEngine) => void;
    onSatelliteUpdate?: (satellites: any[]) => void;
    onTimeUpdate?: (time: Date) => void;
}

// Sample orbital elements for demonstration
const sampleSatellites: ClassicalOrbitalElements[] = [
    OrbitalElementsGenerator.generateRandomCOE("ISS (ZARYA)", [400, 450]),
    OrbitalElementsGenerator.generateRandomCOE("HST", [540, 560]),
    OrbitalElementsGenerator.generateRandomCOE("GPS IIF-12", [20000, 20100]),
    OrbitalElementsGenerator.generateRandomCOE("NOAA-18", [800, 850]),
    OrbitalElementsGenerator.generateRandomCOE("LANDSAT-8", [700, 750])
];

export default function Globe({
    style,
    className,
    onEngineReady,
    onSatelliteUpdate,
    onTimeUpdate
}: GlobeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<GlobeEngine | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [satelliteCount, setSatelliteCount] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [_satelliteLocations, setSatelliteLocations] = useState<{ [key: string]: { latitude: number, longitude: number, altitude: number } }>({});
    const [isPaused, setIsPaused] = useState(false);
    const [timeMultiplier, setTimeMultiplier] = useState(1);
    const [showOrbits, setShowOrbits] = useState(false);
    const [satelliteCountInput, setSatelliteCountInput] = useState(1000);
    const [selectedEntity, setSelectedEntity] = useState<any>(null);
    const [showSidePanel, setShowSidePanel] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize the globe engine
        const engine = new GlobeEngine({
            container: containerRef.current,
            enableControls: true,
            enableStats: true, // Enable stats.js FPS monitor
            autoRotate: false, // Disable auto-rotation
            rotationSpeed: 0.0005,
            maxSatellites: 2000000
        });

        // Set up event handlers
        engine.onEngineReadyCallback(() => {
            setIsReady(true);

            // Add sample satellites
            addSampleSatellites(engine);

            if (onEngineReady) {
                onEngineReady(engine);
            }
        });

        engine.onSatelliteUpdateCallback((satellites) => {
            setSatelliteCount(satellites.length);

            // Update satellite locations
            const locations: { [key: string]: { latitude: number, longitude: number, altitude: number } } = {};
            satellites.forEach(satellite => {
                const location = satellite.getCurrentLocation();
                if (location) {
                    locations[satellite.id] = location;
                }
            });
            setSatelliteLocations(locations);

            if (onSatelliteUpdate) {
                onSatelliteUpdate(satellites);
            }
        });

        engine.onTimeUpdateCallback((time) => {
            setCurrentTime(time);
            if (onTimeUpdate) {
                onTimeUpdate(time);
            }
        });

        engine.onEntitySelectedCallback((entity) => {
            setSelectedEntity(entity);
            setShowSidePanel(entity !== null);
        });


        engineRef.current = engine;
        engine.start();

        // Cleanup
        return () => {
            if (engineRef.current) {
                engineRef.current.stop();
                engineRef.current.dispose();
                engineRef.current = null;
            }
        };
    }, []);

    const addSampleSatellites = (engine: GlobeEngine) => {
        // Add satellites with different colors and properties
        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff];

        sampleSatellites.forEach((orbitalElements, index) => {
            const color = colors[index % colors.length];
            const satellite = engine.addSatellite(orbitalElements, {
                color,
                size: 0.01 + Math.random() * 0.01, // Much smaller for scaled coordinates
                showTrail: false, // Temporarily disabled
                trailLength: 50 + Math.random() * 100,
                trailColor: color
            });
            if (satellite) {
            }
        });
    };

    const addRandomSatellite = () => {
        if (!engineRef.current) return;

        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const satellite = engineRef.current.addRandomSatellite();
        if (satellite) {
            // Update satellite color (particle system will handle the visual update)
            satellite.setColor(color);
        }
    };

    const addMultipleSatellites = () => {
        if (!engineRef.current) return;

        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff, 0x00ff88, 0xff0088];

        for (let i = 0; i < satelliteCountInput; i++) {
            const color = colors[i % colors.length];
            const satellite = engineRef.current.addRandomTLEFromCOE();
            if (satellite) {
                // Update satellite color (particle system will handle the visual update)
                satellite.setColor(color);
            }
        }
    };

    const removeRandomSatellite = () => {
        if (!engineRef.current) return;

        const satellites = engineRef.current.getAllSatellites();
        if (satellites.length > 0) {
            const randomSatellite = satellites[Math.floor(Math.random() * satellites.length)];
            engineRef.current.removeSatellite(randomSatellite.id);
        }
    };

    const clearAllSatellites = () => {
        if (!engineRef.current) return;

        const satellites = engineRef.current.getAllSatellites();
        satellites.forEach(satellite => {
            engineRef.current!.removeSatellite(satellite.id);
        });
    };


    const handleSetTimeMultiplier = (multiplier: number) => {
        if (!engineRef.current) return;
        engineRef.current.setTimeMultiplier(multiplier);
        setTimeMultiplier(multiplier);
    };

    const togglePause = () => {
        if (!engineRef.current) return;
        setIsPaused(!isPaused);
        if (isPaused) {
            engineRef.current.setTimeMultiplier(timeMultiplier);
        } else {
            engineRef.current.setTimeMultiplier(0);
        }
    };

    const resetTime = () => {
        if (!engineRef.current) return;
        const now = new Date();
        engineRef.current.setTime(now);
        setCurrentTime(now);
    };

    const fastForward = () => {
        if (!engineRef.current) return;
        const newMultiplier = timeMultiplier * 2;
        handleSetTimeMultiplier(newMultiplier);
    };

    const rewind = () => {
        if (!engineRef.current) return;
        const newMultiplier = timeMultiplier / 2;
        handleSetTimeMultiplier(newMultiplier);
    };

    const populateGlobe = () => {
        if (!engineRef.current) return;

        // Clear existing satellites
        clearAllSatellites();

        // Create multiple satellites with different orbital parameters
        const satelliteConfigs = [
            { name: "ISS", altitude: [400, 450], color: 0x00ff00 },
            { name: "HST", altitude: [540, 560], color: 0xff0000 },
            { name: "GPS", altitude: [20000, 20100], color: 0x0000ff },
            { name: "NOAA", altitude: [800, 850], color: 0xffff00 },
            { name: "LANDSAT", altitude: [700, 750], color: 0xff00ff },
            { name: "SENTINEL", altitude: [780, 800], color: 0x00ffff },
            { name: "TERRA", altitude: [700, 720], color: 0xff8800 },
            { name: "AQUA", altitude: [700, 720], color: 0x8800ff }
        ];

        satelliteConfigs.forEach((config) => {
            const coe = OrbitalElementsGenerator.generateRandomCOE(config.name, config.altitude as [number, number]);
            const satellite = engineRef.current!.addSatellite(coe, {
                color: config.color,
                size: 0.01 + Math.random() * 0.005,
                showTrail: false, // Temporarily disabled
                trailLength: 100 + Math.random() * 50,
                trailColor: config.color
            });

            if (satellite) {
            }
        });
    };

    const toggleOrbits = () => {
        if (!engineRef.current) return;

        const satellites = engineRef.current.getAllSatellites();
        satellites.forEach(satellite => {
            satellite.toggleOrbitVisibility();
        });

        setShowOrbits(!showOrbits);
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', ...style }} className={className}>
            {/* Globe container */}
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, #000011 0%, #000033 100%)'
                }}
            />

            {/* Control panel */}
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '10px',
                borderRadius: '5px',
                fontFamily: 'monospace',
                fontSize: '12px',
                minWidth: '200px'
            }}>
                <div>Status: {isReady ? 'Ready' : 'Loading...'}</div>
                <div>Satellites: {satelliteCount}</div>
                <div>Time: {currentTime.toLocaleString()}</div>
                <div>Speed: {timeMultiplier}x {isPaused ? '(Paused)' : ''}</div>

                <div style={{ marginTop: '10px' }}>
                    <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Satellite Controls:</div>
                    <div style={{ marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input
                            type="number"
                            value={satelliteCountInput}
                            onChange={(e) => setSatelliteCountInput(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            max="1000"
                            style={{
                                width: '60px',
                                padding: '2px',
                                fontSize: '10px',
                                border: '1px solid #ccc',
                                borderRadius: '3px'
                            }}
                        />
                        <button
                            onClick={addMultipleSatellites}
                            style={{ margin: '2px', padding: '5px', fontSize: '10px', backgroundColor: '#4CAF50' }}
                        >
                            Add {satelliteCountInput} Satellites
                        </button>
                    </div>
                    <button
                        onClick={addRandomSatellite}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        Add Single Satellite
                    </button>
                    <button
                        onClick={() => {
                            if (engineRef.current) {
                                engineRef.current.addValidSatellite();
                            }
                        }}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        Add Valid TLE
                    </button>
                    <button
                        onClick={() => {
                            if (engineRef.current) {
                                for (let i = 0; i < 10; i++) {
                                    engineRef.current.addRandomTLEFromCOE();
                                }
                            }
                        }}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px', backgroundColor: '#2196F3' }}
                    >
                        Add Random TLE
                    </button>
                    <button
                        onClick={populateGlobe}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px', backgroundColor: '#4CAF50' }}
                    >
                        Populate Globe
                    </button>
                    <button
                        onClick={removeRandomSatellite}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        Remove Random
                    </button>
                    <button
                        onClick={clearAllSatellites}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        Clear All
                    </button>
                    <button
                        onClick={toggleOrbits}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px', backgroundColor: showOrbits ? '#4CAF50' : '#666' }}
                    >
                        {showOrbits ? 'Hide Orbits' : 'Show Orbits'}
                    </button>
                </div>

                <div style={{ marginTop: '10px' }}>
                    <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Time Controls:</div>
                    <button
                        onClick={togglePause}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px', backgroundColor: isPaused ? '#4CAF50' : '#f44336' }}
                    >
                        {isPaused ? 'Play' : 'Pause'}
                    </button>
                    <button
                        onClick={rewind}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        ⏪ Rewind
                    </button>
                    <button
                        onClick={fastForward}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        ⏩ Fast Forward
                    </button>
                    <button
                        onClick={resetTime}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        🔄 Reset
                    </button>
                </div>

                <div style={{ marginTop: '10px' }}>
                    <div style={{ marginBottom: '5px', fontWeight: 'bold' }}>Speed:</div>
                    <button
                        onClick={() => handleSetTimeMultiplier(1)}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        1x
                    </button>
                    <button
                        onClick={() => handleSetTimeMultiplier(10)}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        10x
                    </button>
                    <button
                        onClick={() => handleSetTimeMultiplier(100)}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        100x
                    </button>
                    <button
                        onClick={() => handleSetTimeMultiplier(1000)}
                        style={{ margin: '2px', padding: '5px', fontSize: '10px' }}
                    >
                        1000x
                    </button>
                </div>
            </div>

            {/* Satellite Locations Display */}
            {/* {Object.keys(satelliteLocations).length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '5px',
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    maxWidth: '200px',
                    maxHeight: '300px',
                    overflow: 'auto'
                }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '12px' }}>Satellite Locations:</h4>
                    {Object.entries(satelliteLocations).map(([id, location]) => (
                        <div key={id} style={{ marginBottom: '8px', padding: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px' }}>
                            <strong>Sat {id.slice(-4)}:</strong>
                            <br />
                            Lat: {location.latitude.toFixed(2)}°
                            <br />
                            Lon: {location.longitude.toFixed(2)}°
                            <br />
                            Alt: {location.altitude.toFixed(2)} km
                        </div>
                    ))}
                </div>
            )} */}

            {/* Side Panel for Selected Entity */}
            {showSidePanel && selectedEntity && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(0, 0, 0, 0.9)',
                    color: 'white',
                    padding: '15px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    minWidth: '300px',
                    maxWidth: '400px',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    border: '2px solid #4CAF50',
                    zIndex: 1000
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ margin: 0, color: '#4CAF50' }}>Satellite Details</h3>
                        <button
                            onClick={() => {
                                if (engineRef.current) {
                                    engineRef.current.deselectEntity();
                                }
                            }}
                            style={{
                                background: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                padding: '5px 10px',
                                cursor: 'pointer',
                                fontSize: '10px'
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                        <strong>Name:</strong> {selectedEntity.name}
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                        <strong>ID:</strong> {selectedEntity.id}
                    </div>

                    {selectedEntity.getCurrentLocation && (
                        <div style={{ marginBottom: '10px' }}>
                            <strong>Current Position:</strong>
                            {(() => {
                                try {
                                    const location = selectedEntity.getCurrentLocation();
                                    return location && typeof location.latitude === 'number' && typeof location.longitude === 'number' && typeof location.altitude === 'number' ? (
                                        <div style={{ marginLeft: '10px', fontSize: '11px' }}>
                                            <div>Lat: {location.latitude.toFixed(4)}°</div>
                                            <div>Lon: {location.longitude.toFixed(4)}°</div>
                                            <div>Alt: {location.altitude.toFixed(2)} km</div>
                                        </div>
                                    ) : (
                                        <div style={{ marginLeft: '10px', fontSize: '11px', color: '#ff9800' }}>
                                            Position not available
                                        </div>
                                    );
                                } catch (error) {
                                    return (
                                        <div style={{ marginLeft: '10px', fontSize: '11px', color: '#ff9800' }}>
                                            Error getting position
                                        </div>
                                    );
                                }
                            })()}
                        </div>
                    )}

                    {selectedEntity.getOrbitalElements && (
                        <div style={{ marginBottom: '10px' }}>
                            <strong>Orbital Elements:</strong>
                            {(() => {
                                try {
                                    const coe = selectedEntity.getOrbitalElements();
                                    return coe ? (
                                        <div style={{ marginLeft: '10px', fontSize: '11px' }}>
                                            <div>Inclination: {coe.inclination ? (coe.inclination * 180 / Math.PI).toFixed(2) : 'N/A'}°</div>
                                            <div>RAAN: {coe.rightAscension ? (coe.rightAscension * 180 / Math.PI).toFixed(2) : 'N/A'}°</div>
                                            <div>Eccentricity: {coe.eccentricity ? coe.eccentricity.toFixed(6) : 'N/A'}</div>
                                            <div>Argument of perigee: {coe.argumentOfPerigee ? (coe.argumentOfPerigee * 180 / Math.PI).toFixed(2) : 'N/A'}°</div>
                                            <div>Mean anomaly: {coe.meanAnomaly ? (coe.meanAnomaly * 180 / Math.PI).toFixed(2) : 'N/A'}°</div>
                                            <div>Mean motion: {coe.meanMotion ? coe.meanMotion.toFixed(8) : 'N/A'} rev/day</div>
                                        </div>
                                    ) : (
                                        <div style={{ marginLeft: '10px', fontSize: '11px', color: '#ff9800' }}>
                                            Orbital elements not available
                                        </div>
                                    );
                                } catch (error) {
                                    return (
                                        <div style={{ marginLeft: '10px', fontSize: '11px', color: '#ff9800' }}>
                                            Error getting orbital elements
                                        </div>
                                    );
                                }
                            })()}
                        </div>
                    )}

                    <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(76, 175, 80, 0.1)', borderRadius: '5px' }}>
                        <div style={{ fontSize: '11px', color: '#4CAF50' }}>
                            💡 Click anywhere on the screen to deselect
                        </div>
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                background: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '10px',
                borderRadius: '5px',
                fontFamily: 'monospace',
                fontSize: '11px',
                maxWidth: '300px'
            }}>
                <div><strong>Controls:</strong></div>
                <div>• Mouse: Rotate camera around globe</div>
                <div>• Wheel: Zoom in/out</div>
                <div>• Click satellites to view details</div>
                <div>• Click empty space to deselect</div>
                <div>• Sun position updates with time</div>
            </div>
        </div>
    );
}

