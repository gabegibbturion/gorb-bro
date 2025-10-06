import React, { useEffect, useRef, useState } from "react";
import { GlobeEngine, GlobeType } from "../engine/GlobeEngine";
import type { ClassicalOrbitalElements } from "../engine/OrbitalElements";
import { OrbitalElementsGenerator } from "../engine/OrbitalElements";
import type { RenderingSystem } from "../engine/EntityManager";

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
    OrbitalElementsGenerator.generateRandomCOE("LANDSAT-8", [700, 750]),
];

export default function Globe({ style, className, onEngineReady, onSatelliteUpdate, onTimeUpdate }: GlobeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<GlobeEngine | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [satelliteCount, setSatelliteCount] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [_satelliteLocations, setSatelliteLocations] = useState<{ [key: string]: { latitude: number; longitude: number; altitude: number } }>({});
    const [isPaused, setIsPaused] = useState(false);
    const [timeMultiplier, setTimeMultiplier] = useState(1);
    const [showOrbits, setShowOrbits] = useState(false);
    const [satelliteCountInput, setSatelliteCountInput] = useState<any>(100);
    const [selectedEntity, setSelectedEntity] = useState<any>(null);
    const [showSidePanel, setShowSidePanel] = useState(false);
    const [renderingSystem, setRenderingSystem] = useState<RenderingSystem>("instanced");
    const [satPointsSize, setSatPointsSize] = useState(0.5);
    const [tleLoading, setTleLoading] = useState(false);
    const [occlusionCulling, setOcclusionCulling] = useState(true);
    const [globeVisible, setGlobeVisible] = useState(true);
    const [cloudsVisible, setCloudsVisible] = useState(true);
    const [atmosphereVisible, setAtmosphereVisible] = useState(true);
    const [meshUpdatesEnabled, setMeshUpdatesEnabled] = useState(true);
    const [globeType, setGlobeType] = useState<GlobeType>(GlobeType.BASIC);
    const [timelineOffset, setTimelineOffset] = useState(0); // Offset from center in hours
    const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize the globe engine
        const engine = new GlobeEngine({
            container: containerRef.current,
            enableControls: true,
            enableStats: true, // Enable stats.js FPS monitor
            autoRotate: false, // Disable auto-rotation
            rotationSpeed: 0.0005,
            maxSatellites: 2000000,
            renderingSystem: renderingSystem,
            globeType: globeType,
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
            const locations: { [key: string]: { latitude: number; longitude: number; altitude: number } } = {};
            satellites.forEach((satellite) => {
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

            // Update timeline offset if not dragging
            if (!isDraggingTimeline && engineRef.current) {
                const now = new Date();
                const timeDiff = time.getTime() - now.getTime();
                const hoursOffset = timeDiff / (1000 * 60 * 60); // Convert to hours
                setTimelineOffset(hoursOffset);
            }

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
                trailColor: color,
            });
            if (satellite) {
            }
        });
    };

    const addMultipleSatellites = () => {
        if (!engineRef.current) return;

        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff, 0x00ff88, 0xff0088];

        // Use batch loading for much better performance
        engineRef.current.addRandomTLEFromCOEBatch(satelliteCountInput, "Random-Sat", [400, 800], colors);
    };

    const clearAllSatellites = () => {
        if (!engineRef.current) return;

        const satellites = engineRef.current.getAllSatellites();
        satellites.forEach((satellite) => {
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

    const toggleOrbits = () => {
        if (!engineRef.current) return;

        const satellites = engineRef.current.getAllSatellites();
        satellites.forEach((satellite) => {
            satellite.toggleOrbitVisibility();
        });

        setShowOrbits(!showOrbits);
    };

    const loadTLEFile = async (maxCount: number = 0) => {
        if (!engineRef.current) return;

        setTleLoading(true);
        try {
            // Load the TLE file from assets - try multiple possible paths
            let response;
            try {
                response = await fetch("/src/assets/gp.txt");
            } catch {
                try {
                    response = await fetch("/assets/gp.txt");
                } catch {
                    response = await fetch("./src/assets/gp.txt");
                }
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch TLE file: ${response.status}`);
            }

            const content = await response.text();

            // Clear existing satellites first
            clearAllSatellites();

            // Load TLEs into the globe
            const satellites = engineRef.current.loadTLEFromFile(content, maxCount);
            console.log(`Loaded ${satellites.length} satellites from TLE file`);
        } catch (error) {
            console.error("Failed to load TLE file:", error);
            alert("Failed to load TLE file. Please check that gp.txt exists in the assets folder.");
        } finally {
            setTleLoading(false);
        }
    };

    const loadFirst1000TLEs = () => {
        loadTLEFile(1000);
    };

    const loadAllTLEs = () => {
        loadTLEFile(0); // 0 means load all
    };

    const toggleOcclusionCulling = () => {
        if (!engineRef.current) return;
        const newValue = !occlusionCulling;
        setOcclusionCulling(newValue);
        engineRef.current.setOcclusionCulling(newValue);
    };

    const toggleGlobeVisibility = () => {
        if (!engineRef.current) return;
        const newValue = !globeVisible;
        setGlobeVisible(newValue);
        engineRef.current.setGlobeVisible(newValue);
    };

    const toggleClouds = () => {
        if (!engineRef.current) return;
        const enhancedGlobe = engineRef.current.getEnhancedGlobe();
        if (enhancedGlobe) {
            const newValue = !cloudsVisible;
            setCloudsVisible(newValue);
            enhancedGlobe.setCloudsVisible(newValue);
        }
    };

    const toggleAtmosphere = () => {
        if (!engineRef.current) return;
        const enhancedGlobe = engineRef.current.getEnhancedGlobe();
        if (enhancedGlobe) {
            const newValue = !atmosphereVisible;
            setAtmosphereVisible(newValue);
            enhancedGlobe.setAtmosphereVisible(newValue);
        }
    };

    const toggleMeshUpdates = () => {
        if (!engineRef.current) return;
        const newValue = !meshUpdatesEnabled;
        setMeshUpdatesEnabled(newValue);
        engineRef.current.setMeshUpdatesEnabled(newValue);
    };

    const forceUpdateMesh = () => {
        if (!engineRef.current) return;
        engineRef.current.forceUpdateMesh();
    };

    const handleGlobeTypeChange = (newGlobeType: GlobeType) => {
        if (!engineRef.current) return;
        setGlobeType(newGlobeType);
        engineRef.current.setGlobeType(newGlobeType);
    };

    const handleTimelineChange = (value: number) => {
        if (!engineRef.current) return;

        // Convert slider value (-1 to 1) to hours offset (-24 to +24)
        const hoursOffset = value * 24;
        setTimelineOffset(hoursOffset);

        // Calculate new time based on offset from now
        const now = new Date();
        const newTime = new Date(now.getTime() + hoursOffset * 60 * 60 * 1000);

        engineRef.current.setTimeFromTimeline(newTime);
    };

    const resetTimelineToNow = () => {
        if (!engineRef.current) return;

        setTimelineOffset(0); // Reset to center (current time)
        engineRef.current.resetToCurrentTime();
    };

    const handleTimelineMouseDown = () => {
        setIsDraggingTimeline(true);
    };

    const handleTimelineMouseUp = () => {
        setIsDraggingTimeline(false);
    };

    return (
        <div style={{ position: "relative", width: "100%", height: "100%", ...style }} className={className}>
            {/* Globe container */}
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(135deg, #000011 0%, #000033 100%)",
                }}
            />

            {/* Control panel */}
            <div
                style={{
                    position: "absolute",
                    top: "10px",
                    left: "10px",
                    background: "rgba(0, 0, 0, 0.7)",
                    color: "white",
                    padding: "10px",
                    borderRadius: "5px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    minWidth: "200px",
                }}
            >
                <div>Status: {isReady ? "Ready" : "Loading..."}</div>
                <div>Satellites: {satelliteCount}</div>
                <div>Time: {currentTime.toLocaleString()}</div>
                <div>
                    Speed: {timeMultiplier}x {isPaused ? "(Paused)" : ""}
                </div>
                <div>System: {renderingSystem === "satpoints" ? "SatPoints" : renderingSystem === "instanced" ? "Instanced Mesh" : "Particle System"}</div>
                <div>Globe Type: {globeType === GlobeType.ENHANCED ? "Enhanced" : "Basic"}</div>
                <div>Occlusion: {occlusionCulling ? "Enabled" : "Disabled"}</div>
                <div>Globe: {globeVisible ? "Visible" : "Hidden"}</div>
                <div>Clouds: {cloudsVisible ? "Visible" : "Hidden"}</div>
                <div>Atmosphere: {atmosphereVisible ? "Visible" : "Hidden"}</div>

                <div style={{ marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px", fontWeight: "bold" }}>TLE File Controls:</div>
                    <button
                        onClick={loadFirst1000TLEs}
                        disabled={tleLoading}
                        style={{
                            margin: "2px",
                            padding: "5px",
                            fontSize: "10px",
                            backgroundColor: tleLoading ? "#666" : "#FF9800",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: tleLoading ? "not-allowed" : "pointer",
                        }}
                    >
                        {tleLoading ? "Loading..." : "Load First 1000 TLEs"}
                    </button>
                    <button
                        onClick={loadAllTLEs}
                        disabled={tleLoading}
                        style={{
                            margin: "2px",
                            padding: "5px",
                            fontSize: "10px",
                            backgroundColor: tleLoading ? "#666" : "#F44336",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: tleLoading ? "not-allowed" : "pointer",
                        }}
                    >
                        {tleLoading ? "Loading..." : "Load All TLEs"}
                    </button>
                </div>

                <div style={{ marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Satellite Controls:</div>
                    <div style={{ marginBottom: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <input
                            value={satelliteCountInput}
                            onChange={(e) => setSatelliteCountInput(e.target.value)}
                            min="-1000"
                            max="10000"
                            style={{
                                width: "60px",
                                padding: "2px",
                                fontSize: "10px",
                                border: "1px solid #ccc",
                                borderRadius: "3px",
                            }}
                        />
                        <button onClick={addMultipleSatellites} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: "#4CAF50" }}>
                            Add {satelliteCountInput} Satellites
                        </button>
                    </div>

                    <button onClick={toggleOrbits} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: showOrbits ? "#4CAF50" : "#666" }}>
                        {showOrbits ? "Hide Orbits" : "Show Orbits"}
                    </button>
                    <div style={{ marginBottom: "10px" }}>
                        <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Rendering System:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {[
                                { value: "particle", label: "Particle System", description: "Basic particles (fallback)" },
                                { value: "instanced", label: "Instanced Mesh", description: "High-performance instanced rendering" },
                                { value: "satpoints", label: "SatPoints", description: "Optimized points like whatsOverHead" },
                            ].map((option) => (
                                <label
                                    key={option.value}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "5px",
                                        cursor: "pointer",
                                        backgroundColor: renderingSystem === option.value ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.05)",
                                        borderRadius: "3px",
                                        border: renderingSystem === option.value ? "1px solid #4CAF50" : "1px solid transparent",
                                        fontSize: "10px",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="renderingSystem"
                                        value={option.value}
                                        checked={renderingSystem === option.value}
                                        onChange={(e) => {
                                            const newSystem = e.target.value as RenderingSystem;
                                            setRenderingSystem(newSystem);
                                            if (engineRef.current) {
                                                engineRef.current.setRenderingSystem(newSystem);
                                            }
                                        }}
                                        style={{ marginRight: "8px", accentColor: "#4CAF50" }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: "bold", color: renderingSystem === option.value ? "#4CAF50" : "#fff" }}>{option.label}</div>
                                        <div style={{ fontSize: "9px", color: "#aaa", marginTop: "1px" }}>{option.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: "10px" }}>
                        <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Globe Type:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            {[
                                { value: GlobeType.BASIC, label: "Basic Globe", description: "Simple globe with basic textures" },
                                { value: GlobeType.ENHANCED, label: "Enhanced Globe", description: "High-quality globe with day/night textures" },
                            ].map((option) => (
                                <label
                                    key={option.value}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "5px",
                                        cursor: "pointer",
                                        backgroundColor: globeType === option.value ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.05)",
                                        borderRadius: "3px",
                                        border: globeType === option.value ? "1px solid #4CAF50" : "1px solid transparent",
                                        fontSize: "10px",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="globeType"
                                        value={option.value}
                                        checked={globeType === option.value}
                                        onChange={(e) => {
                                            const newGlobeType = e.target.value as GlobeType;
                                            handleGlobeTypeChange(newGlobeType);
                                        }}
                                        style={{ marginRight: "8px", accentColor: "#4CAF50" }}
                                    />
                                    <div>
                                        <div style={{ fontWeight: "bold", color: globeType === option.value ? "#4CAF50" : "#fff" }}>{option.label}</div>
                                        <div style={{ fontSize: "9px", color: "#aaa", marginTop: "1px" }}>{option.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {renderingSystem === "satpoints" && (
                        <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
                            <label style={{ fontSize: "10px" }}>Size:</label>
                            <input
                                type="range"
                                min="0.01"
                                max="1.0"
                                step="0.01"
                                value={satPointsSize}
                                onChange={(e) => {
                                    const newSize = parseFloat(e.target.value);
                                    setSatPointsSize(newSize);
                                    if (engineRef.current) {
                                        engineRef.current.setSatPointsSize(newSize);
                                    }
                                }}
                                style={{ width: "60px" }}
                            />
                            <span style={{ fontSize: "9px" }}>{satPointsSize.toFixed(2)}</span>
                        </div>
                    )}
                    <button onClick={toggleOcclusionCulling} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: occlusionCulling ? "#4CAF50" : "#666" }}>
                        {occlusionCulling ? "Disable Occlusion" : "Enable Occlusion"}
                    </button>
                    <button onClick={toggleGlobeVisibility} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: globeVisible ? "#4CAF50" : "#666" }}>
                        {globeVisible ? "Hide Globe" : "Show Globe"}
                    </button>
                    <button onClick={toggleClouds} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: cloudsVisible ? "#4CAF50" : "#666" }}>
                        {cloudsVisible ? "Hide Clouds" : "Show Clouds"}
                    </button>
                    <button onClick={toggleAtmosphere} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: atmosphereVisible ? "#4CAF50" : "#666" }}>
                        {atmosphereVisible ? "Hide Atmosphere" : "Show Atmosphere"}
                    </button>
                </div>

                <div style={{ marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Mesh Update Controls:</div>
                    <div>Mesh Updates: {meshUpdatesEnabled ? "Enabled" : "Disabled"}</div>
                    <button
                        onClick={toggleMeshUpdates}
                        style={{
                            margin: "2px",
                            padding: "5px",
                            fontSize: "10px",
                            backgroundColor: meshUpdatesEnabled ? "#4CAF50" : "#F44336",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: "pointer",
                        }}
                    >
                        {meshUpdatesEnabled ? "Disable Mesh Updates" : "Enable Mesh Updates"}
                    </button>
                    <button
                        onClick={forceUpdateMesh}
                        disabled={meshUpdatesEnabled}
                        style={{
                            margin: "2px",
                            padding: "5px",
                            fontSize: "10px",
                            backgroundColor: meshUpdatesEnabled ? "#666" : "#FF9800",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: meshUpdatesEnabled ? "not-allowed" : "pointer",
                        }}
                    >
                        Update Mesh Now
                    </button>
                    <div style={{ fontSize: "9px", color: "#888", marginTop: "5px" }}>Tip: Disable mesh updates before adding many satellites, then click "Update Mesh Now"</div>
                </div>

                <div style={{ marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Time Controls:</div>
                    <button onClick={togglePause} style={{ margin: "2px", padding: "5px", fontSize: "10px", backgroundColor: isPaused ? "#4CAF50" : "#f44336" }}>
                        {isPaused ? "Play" : "Pause"}
                    </button>
                </div>

                <div style={{ marginTop: "10px", display: "flex", gap: "20px" }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Speed:</div>
                        <button onClick={() => handleSetTimeMultiplier(1)} style={{ margin: "2px", padding: "5px", fontSize: "10px" }}>
                            1x
                        </button>
                        <button onClick={() => handleSetTimeMultiplier(10)} style={{ margin: "2px", padding: "5px", fontSize: "10px" }}>
                            10x
                        </button>
                        <button onClick={() => handleSetTimeMultiplier(100)} style={{ margin: "2px", padding: "5px", fontSize: "10px" }}>
                            100x
                        </button>
                        <button onClick={() => handleSetTimeMultiplier(1000)} style={{ margin: "2px", padding: "5px", fontSize: "10px" }}>
                            1000x
                        </button>
                        <button onClick={() => handleSetTimeMultiplier(10000)} style={{ margin: "2px", padding: "5px", fontSize: "10px" }}>
                            10000x
                        </button>
                    </div>

                    <div style={{ flex: 2 }}>
                        <div style={{ marginBottom: "5px", fontWeight: "bold" }}>Timeline:</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
                            <div style={{ fontSize: "9px", color: "#aaa", minWidth: "80px" }}>
                                {(() => {
                                    const now = new Date();
                                    const currentTime = new Date(now.getTime() + timelineOffset * 60 * 60 * 1000);
                                    return currentTime.toLocaleTimeString();
                                })()}
                            </div>
                            <button
                                onClick={resetTimelineToNow}
                                style={{
                                    margin: "2px",
                                    padding: "3px 8px",
                                    fontSize: "9px",
                                    backgroundColor: "#4CAF50",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "3px",
                                    cursor: "pointer",
                                }}
                            >
                                Reset to Now
                            </button>
                        </div>
                        <div style={{ position: "relative", marginBottom: "5px", padding: "0 10px" }}>
                            <input
                                type="range"
                                min="-1"
                                max="1"
                                step="0.01"
                                value={timelineOffset / 24}
                                onChange={(e) => handleTimelineChange(parseFloat(e.target.value))}
                                onMouseDown={handleTimelineMouseDown}
                                onMouseUp={handleTimelineMouseUp}
                                style={{
                                    width: "100%",
                                    height: "20px",
                                    background: "linear-gradient(to right, #333 0%, #4CAF50 50%, #333 100%)",
                                    outline: "none",
                                    borderRadius: "10px",
                                    cursor: isDraggingTimeline ? "grabbing" : "grab",
                                    WebkitAppearance: "none",
                                    appearance: "none",
                                }}
                            />
                            {/* Tick marks */}
                            {[-24, -12, -6, -3, 0, 3, 6, 12, 24].map((hour) => {
                                const position = (hour + 24) / 48; // Convert to 0-1 range
                                const time = new Date();
                                time.setHours(time.getHours() + hour);
                                return (
                                    <div
                                        key={hour}
                                        style={{
                                            position: "absolute",
                                            top: "25px",
                                            left: `${position * 100}%`,
                                            transform: "translateX(-50%)",
                                            fontSize: "7px",
                                            color: hour === 0 ? "#4CAF50" : "#aaa",
                                            fontWeight: hour === 0 ? "bold" : "normal",
                                        }}
                                    >
                                        {hour === 0 ? "Now" : `${hour > 0 ? "+" : ""}${hour}h`}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ fontSize: "9px", color: "#888", marginTop: "5px" }}>💡 Drag anywhere on the timeline to scrub through time</div>
                    </div>
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
                <div
                    style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "rgba(0, 0, 0, 0.9)",
                        color: "white",
                        padding: "15px",
                        borderRadius: "8px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        minWidth: "300px",
                        maxWidth: "400px",
                        maxHeight: "80vh",
                        overflow: "auto",
                        border: "2px solid #4CAF50",
                        zIndex: 1000,
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <h3 style={{ margin: 0, color: "#4CAF50" }}>Satellite Details</h3>
                        <button
                            onClick={() => {
                                if (engineRef.current) {
                                    engineRef.current.deselectEntity();
                                }
                            }}
                            style={{
                                background: "#f44336",
                                color: "white",
                                border: "none",
                                borderRadius: "3px",
                                padding: "5px 10px",
                                cursor: "pointer",
                                fontSize: "10px",
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>

                    <div style={{ marginBottom: "10px" }}>
                        <strong>Name:</strong> {selectedEntity.name}
                    </div>

                    <div style={{ marginBottom: "10px" }}>
                        <strong>ID:</strong> {selectedEntity.id}
                    </div>

                    {selectedEntity.getCurrentLocation && (
                        <div style={{ marginBottom: "10px" }}>
                            <strong>Current Position:</strong>
                            {(() => {
                                try {
                                    const location = selectedEntity.getCurrentLocation();
                                    return location && typeof location.latitude === "number" && typeof location.longitude === "number" && typeof location.altitude === "number" ? (
                                        <div style={{ marginLeft: "10px", fontSize: "11px" }}>
                                            <div>Lat: {location.latitude.toFixed(4)}°</div>
                                            <div>Lon: {location.longitude.toFixed(4)}°</div>
                                            <div>Alt: {location.altitude.toFixed(2)} km</div>
                                        </div>
                                    ) : (
                                        <div style={{ marginLeft: "10px", fontSize: "11px", color: "#ff9800" }}>Position not available</div>
                                    );
                                } catch (error) {
                                    return <div style={{ marginLeft: "10px", fontSize: "11px", color: "#ff9800" }}>Error getting position</div>;
                                }
                            })()}
                        </div>
                    )}

                    {selectedEntity.getOrbitalElements && (
                        <div style={{ marginBottom: "10px" }}>
                            <strong>Orbital Elements:</strong>
                            {(() => {
                                try {
                                    const coe = selectedEntity.getOrbitalElements();
                                    return coe ? (
                                        <div style={{ marginLeft: "10px", fontSize: "11px" }}>
                                            <div>Inclination: {coe.inclination ? ((coe.inclination * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                            <div>RAAN: {coe.rightAscension ? ((coe.rightAscension * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                            <div>Eccentricity: {coe.eccentricity ? coe.eccentricity.toFixed(6) : "N/A"}</div>
                                            <div>Argument of perigee: {coe.argumentOfPerigee ? ((coe.argumentOfPerigee * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                            <div>Mean anomaly: {coe.meanAnomaly ? ((coe.meanAnomaly * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                            <div>Mean motion: {coe.meanMotion ? coe.meanMotion.toFixed(8) : "N/A"} rev/day</div>
                                        </div>
                                    ) : (
                                        <div style={{ marginLeft: "10px", fontSize: "11px", color: "#ff9800" }}>Orbital elements not available</div>
                                    );
                                } catch (error) {
                                    return <div style={{ marginLeft: "10px", fontSize: "11px", color: "#ff9800" }}>Error getting orbital elements</div>;
                                }
                            })()}
                        </div>
                    )}

                    <div style={{ marginTop: "15px", padding: "10px", background: "rgba(76, 175, 80, 0.1)", borderRadius: "5px" }}>
                        <div style={{ fontSize: "11px", color: "#4CAF50" }}>💡 Click anywhere on the screen to deselect</div>
                    </div>
                </div>
            )}
        </div>
    );
}
