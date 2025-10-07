import React, { useEffect, useRef, useState } from "react";
import type { RenderingSystem } from "../engine/EntityManager";
import { GlobeEngine, GlobeType } from "../engine/GlobeEngine";
import type { ClassicalOrbitalElements } from "../engine/OrbitalElements";
import { OrbitalElementsGenerator } from "../engine/OrbitalElements";
import type { OrbitRenderingSystem } from "../engine/OrbitManager";

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
    const [, setIsReady] = useState(false);
    const [satelliteCount, setSatelliteCount] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [_satelliteLocations, setSatelliteLocations] = useState<{ [key: string]: { latitude: number; longitude: number; altitude: number } }>({});
    const [isPaused, setIsPaused] = useState(false);
    const [timeMultiplier, setTimeMultiplier] = useState(1);
    const [satelliteCountInput, setSatelliteCountInput] = useState<any>(100);
    const [selectedEntity, setSelectedEntity] = useState<any>(null);
    const [showSidePanel, setShowSidePanel] = useState(false);
    const [renderingSystem, setRenderingSystem] = useState<RenderingSystem>("instanced");
    const [tleLoading, setTleLoading] = useState(false);
    const [occlusionCulling, setOcclusionCulling] = useState(true);
    const [globeVisible, setGlobeVisible] = useState(true);
    const [cloudsVisible, setCloudsVisible] = useState(true);
    const [atmosphereVisible, setAtmosphereVisible] = useState(true);
    const [meshUpdatesEnabled, setMeshUpdatesEnabled] = useState(true);
    const [globeType, setGlobeType] = useState<GlobeType>(GlobeType.BASIC);
    const [timelineOffset, setTimelineOffset] = useState(0); // Offset from center in hours
    const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
    const [orbitRenderingSystem, setOrbitRenderingSystem] = useState<OrbitRenderingSystem>("line");
    const [showOrbits, setShowOrbits] = useState(false);
    const [orbitCount, setOrbitCount] = useState(0);
    const [orbitSize, setOrbitSize] = useState(1.0);
    const [satelliteSize, setSatelliteSize] = useState(0.01);
    const [propagatorType, setPropagatorType] = useState<"satellitejs" | "k2">("satellitejs");

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
            orbitRenderingSystem: orbitRenderingSystem,
            maxOrbits: 1000000,
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
                // Add orbit for this satellite
                const orbitId = `orbit-${satellite.id}`;
                console.log(`Adding orbit for satellite ${satellite.id} with COE:`, orbitalElements);
                engine.addOrbit(orbitId, orbitalElements, color, 0.6, 64, orbitSize);
            }
        });

        // Update orbit count and show orbits
        setOrbitCount(engine.getOrbitCount());
        setShowOrbits(true);
        engine.setAllOrbitsVisible(true);
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

    const loadFromTurionAPI = async () => {
        if (!engineRef.current) return;

        setTleLoading(true);
        try {
            let allTLEData: Array<{ tle_line1: string; tle_line2: string }> = [];
            let page = 1;
            const perPage = 10000;
            let hasMore = true;

            console.log("Starting to fetch from Turion Space API...");

            // Keep fetching until we get all data
            while (hasMore) {
                const url = `https://rsodata.turionspace.com/api/v3/rsodata/current?per_page=${perPage}&page=${page}`;
                console.log(`Fetching page ${page}...`);

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch from API: ${response.status}`);
                }

                const jsonData = await response.json();
                const pageData = jsonData.data || [];

                console.log(`Page ${page}: Received ${pageData.length} satellites (Total available: ${jsonData.total || "unknown"})`);

                allTLEData = allTLEData.concat(pageData);

                // Check if we should continue fetching
                if (pageData.length < perPage) {
                    hasMore = false;
                    console.log(`Received fewer than ${perPage} items, stopping pagination`);
                } else {
                    page++;
                }
            }

            console.log(`Total satellites fetched: ${allTLEData.length}`);

            // Convert JSON format to TLE text format
            // TLE format: 3 lines per satellite (name, line1, line2)
            const tleLines: string[] = [];
            allTLEData.forEach((item, index) => {
                if (item.tle_line1 && item.tle_line2) {
                    // Extract satellite name from TLE line 1 or use a default
                    const satName = `RSO-${index + 1}`;
                    tleLines.push(satName);
                    tleLines.push(item.tle_line1);
                    tleLines.push(item.tle_line2);
                }
            });

            const tleContent = tleLines.join("\n");

            // Clear existing satellites first
            clearAllSatellites();

            // Load TLEs into the globe
            const satellites = engineRef.current.loadTLEFromFile(tleContent, 0);
            console.log(`Successfully loaded ${satellites.length} satellites from Turion Space API`);
        } catch (error) {
            console.error("Failed to load from Turion Space API:", error);
            alert(`Failed to load from Turion Space API: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            setTleLoading(false);
        }
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

    const forceLoadTiles = () => {
        if (!engineRef.current) return;
        engineRef.current.forceLoadTiles();
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

    const toggleOrbits = () => {
        if (!engineRef.current) return;

        const newShowOrbits = !showOrbits;
        console.log(`Toggling orbits: ${showOrbits} -> ${newShowOrbits}`);
        setShowOrbits(newShowOrbits);
        engineRef.current.setAllOrbitsVisible(newShowOrbits);
        console.log(`Orbit count: ${engineRef.current.getOrbitCount()}`);
    };

    const handleOrbitRenderingSystemChange = (newSystem: OrbitRenderingSystem) => {
        if (!engineRef.current) return;

        setOrbitRenderingSystem(newSystem);
        engineRef.current.setOrbitRenderingSystem(newSystem);

        // Preserve orbit visibility state after system change
        if (showOrbits) {
            engineRef.current.setAllOrbitsVisible(true);
        }
    };

    const addOrbitForSatellite = (satellite: any) => {
        if (!engineRef.current) return;

        try {
            const coe = satellite.getOrbitalElements();
            if (coe && coe.semiMajorAxis > 0) {
                const orbitId = `orbit-${satellite.id}`;
                const color = satellite.getColor();
                engineRef.current.addOrbit(orbitId, coe, color, 0.6, 64, orbitSize);
                setOrbitCount(engineRef.current.getOrbitCount());
            }
        } catch (error) {
            console.warn("Failed to add orbit for satellite:", error);
        }
    };

    const addOrbitsForAllSatellites = () => {
        if (!engineRef.current) return;

        const satellites = engineRef.current.getAllSatellites();
        satellites.forEach((satellite) => {
            addOrbitForSatellite(satellite);
        });
    };

    const clearAllOrbits = () => {
        if (!engineRef.current) return;

        engineRef.current.clearAllOrbits();
        setOrbitCount(0);
    };

    const handleOrbitSizeChange = (newSize: number) => {
        setOrbitSize(newSize);
        // Update existing orbits with new size
        if (engineRef.current) {
            const satellites = engineRef.current.getAllSatellites();
            satellites.forEach((satellite) => {
                const orbitId = `orbit-${satellite.id}`;
                const coe = satellite.getOrbitalElements();
                const color = satellite.getColor();
                engineRef.current!.addOrbit(orbitId, coe, color, 0.6, 64, newSize);
            });
        }
    };

    const handleSatelliteSizeChange = (newSize: number) => {
        setSatelliteSize(newSize);
        if (engineRef.current) {
            engineRef.current.setSatPointsSize(newSize);
        }
    };

    return (
        <div style={{ position: "relative", width: "100%", height: "100%", fontSize: "15px", ...style }} className={className}>
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
                    fontSize: "15px",
                    minWidth: "200px",
                }}
            >
                <div>Satellites: {satelliteCount}</div>
                <div>Time: {currentTime.toLocaleString()}</div>

                <div style={{ marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px", fontWeight: "bold", fontSize: "15px" }}>TLE File Controls:</div>
                    <button
                        onClick={loadFirst1000TLEs}
                        disabled={tleLoading}
                        style={{
                            margin: "2px",
                            padding: "5px",
                            fontSize: "15px",
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
                            fontSize: "15px",
                            backgroundColor: tleLoading ? "#666" : "#F44336",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: tleLoading ? "not-allowed" : "pointer",
                        }}
                    >
                        {tleLoading ? "Loading..." : "Load All TLEs"}
                    </button>
                    <button
                        onClick={loadFromTurionAPI}
                        disabled={tleLoading}
                        style={{
                            margin: "2px",
                            padding: "5px",
                            fontSize: "15px",
                            backgroundColor: tleLoading ? "#666" : "#2196F3",
                            color: "white",
                            border: "none",
                            borderRadius: "3px",
                            cursor: tleLoading ? "not-allowed" : "pointer",
                        }}
                    >
                        {tleLoading ? "Loading..." : "Load from Turion API"}
                    </button>
                </div>

                <div style={{ marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px", fontWeight: "bold", fontSize: "15px" }}>Satellite Controls:</div>
                    <div style={{ marginBottom: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <input
                            value={satelliteCountInput}
                            onChange={(e) => setSatelliteCountInput(e.target.value)}
                            min="-1000"
                            max="10000"
                            style={{
                                width: "60px",
                                padding: "2px",
                                fontSize: "15px",
                                border: "1px solid #ccc",
                                borderRadius: "3px",
                            }}
                        />
                        <button onClick={addMultipleSatellites} style={{ margin: "2px", padding: "5px", fontSize: "15px", backgroundColor: "#4CAF50" }}>
                            Add {satelliteCountInput} Satellites
                        </button>
                    </div>

                    {/* Orbit Controls */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Orbits:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px", marginBottom: "5px" }}>
                            <button
                                onClick={toggleOrbits}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: showOrbits ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                {showOrbits ? "Hide" : "Show"}
                            </button>
                            <button
                                onClick={addOrbitsForAllSatellites}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: "#2196F3",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Add All
                            </button>
                            <button
                                onClick={clearAllOrbits}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: "#f44336",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Rendering System */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Rendering:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px" }}>
                            {[
                                { value: "particle", label: "Particle", description: "Basic" },
                                { value: "instanced", label: "Instanced", description: "High-perf" },
                                { value: "satpoints", label: "SatPoints", description: "Optimized" },
                            ].map((option) => (
                                <label
                                    key={option.value}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        padding: "4px",
                                        cursor: "pointer",
                                        backgroundColor: renderingSystem === option.value ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.05)",
                                        borderRadius: "2px",
                                        border: renderingSystem === option.value ? "1px solid #4CAF50" : "1px solid transparent",
                                        fontSize: "15px",
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
                                        style={{ marginBottom: "2px", accentColor: "#4CAF50" }}
                                    />
                                    <div style={{ fontWeight: "bold", color: renderingSystem === option.value ? "#4CAF50" : "#fff", fontSize: "15px" }}>{option.label}</div>
                                    <div style={{ fontSize: "15px", color: "#aaa" }}>{option.description}</div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Propagator System */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Propagator:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
                            {[
                                { value: "satellitejs", label: "Satellite.js", description: "SGP4/SDP4" },
                                { value: "k2", label: "K2", description: "Runge-Kutta 2" },
                            ].map((option) => (
                                <label
                                    key={option.value}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        padding: "4px",
                                        cursor: "pointer",
                                        backgroundColor: propagatorType === option.value ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.05)",
                                        borderRadius: "2px",
                                        border: propagatorType === option.value ? "1px solid #4CAF50" : "1px solid transparent",
                                        fontSize: "15px",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="propagatorType"
                                        value={option.value}
                                        checked={propagatorType === option.value}
                                        onChange={(e) => {
                                            const newPropagator = e.target.value as "satellitejs" | "k2";
                                            setPropagatorType(newPropagator);
                                            if (engineRef.current) {
                                                engineRef.current.setPropagatorType(newPropagator);
                                            }
                                        }}
                                        style={{ marginBottom: "2px", accentColor: "#4CAF50" }}
                                    />
                                    <div style={{ fontWeight: "bold", color: propagatorType === option.value ? "#4CAF50" : "#fff", fontSize: "15px" }}>{option.label}</div>
                                    <div style={{ fontSize: "15px", color: "#aaa" }}>{option.description}</div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Globe Type */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Globe Type:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px" }}>
                            {[
                                { value: GlobeType.BASIC, label: "Basic", description: "Simple" },
                                { value: GlobeType.ENHANCED, label: "Enhanced", description: "High-quality" },
                                { value: GlobeType.TILE_PROVIDED, label: "Tile", description: "Map tiles" },
                            ].map((option) => (
                                <label
                                    key={option.value}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        padding: "4px",
                                        cursor: "pointer",
                                        backgroundColor: globeType === option.value ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.05)",
                                        borderRadius: "2px",
                                        border: globeType === option.value ? "1px solid #4CAF50" : "1px solid transparent",
                                        fontSize: "15px",
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
                                        style={{ marginBottom: "2px", accentColor: "#4CAF50" }}
                                    />
                                    <div style={{ fontWeight: "bold", color: globeType === option.value ? "#4CAF50" : "#fff", fontSize: "15px" }}>{option.label}</div>
                                    <div style={{ fontSize: "15px", color: "#aaa" }}>{option.description}</div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Orbit Rendering System */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Orbit System:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px" }}>
                            {[
                                { value: "line", label: "Line", description: "Traditional" },
                                { value: "instanced", label: "Instanced", description: "GPU optimized" },
                                { value: "shader", label: "Shader", description: "Experimental" },
                            ].map((option) => (
                                <label
                                    key={option.value}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        padding: "4px",
                                        cursor: "pointer",
                                        backgroundColor: orbitRenderingSystem === option.value ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.05)",
                                        borderRadius: "2px",
                                        border: orbitRenderingSystem === option.value ? "1px solid #4CAF50" : "1px solid transparent",
                                        fontSize: "15px",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="orbitRenderingSystem"
                                        value={option.value}
                                        checked={orbitRenderingSystem === option.value}
                                        onChange={(e) => {
                                            const newSystem = e.target.value as OrbitRenderingSystem;
                                            handleOrbitRenderingSystemChange(newSystem);
                                        }}
                                        style={{ marginBottom: "2px", accentColor: "#4CAF50" }}
                                    />
                                    <div style={{ fontWeight: "bold", color: orbitRenderingSystem === option.value ? "#4CAF50" : "#fff", fontSize: "15px" }}>{option.label}</div>
                                    <div style={{ fontSize: "15px", color: "#aaa" }}>{option.description}</div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Size Controls */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Size Controls:</div>

                        {/* Satellite Size */}
                        <div style={{ marginBottom: "5px" }}>
                            <div style={{ fontSize: "15px", marginBottom: "2px" }}>Satellites:</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                <input
                                    type="range"
                                    min="0.001"
                                    max="0.1"
                                    step="0.001"
                                    value={satelliteSize}
                                    onChange={(e) => {
                                        const newSize = parseFloat(e.target.value);
                                        handleSatelliteSizeChange(newSize);
                                    }}
                                    style={{ flex: 1, height: "4px" }}
                                />
                                <span style={{ fontSize: "15px", minWidth: "30px" }}>{satelliteSize.toFixed(3)}</span>
                            </div>
                        </div>

                        {/* Orbit Size */}
                        <div style={{ marginBottom: "5px" }}>
                            <div style={{ fontSize: "15px", marginBottom: "2px" }}>Orbits:</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="5.0"
                                    step="0.1"
                                    value={orbitSize}
                                    onChange={(e) => {
                                        const newSize = parseFloat(e.target.value);
                                        handleOrbitSizeChange(newSize);
                                    }}
                                    style={{ flex: 1, height: "4px" }}
                                />
                                <span style={{ fontSize: "15px", minWidth: "30px" }}>{orbitSize.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Toggle Controls */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Toggles:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
                            <button
                                onClick={toggleOcclusionCulling}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: occlusionCulling ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Occlusion: {occlusionCulling ? "On" : "Off"}
                            </button>
                            <button
                                onClick={toggleGlobeVisibility}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: globeVisible ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Globe: {globeVisible ? "On" : "Off"}
                            </button>
                            <button
                                onClick={toggleClouds}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: cloudsVisible ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Clouds: {cloudsVisible ? "On" : "Off"}
                            </button>
                            <button
                                onClick={toggleAtmosphere}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: atmosphereVisible ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Atmosphere: {atmosphereVisible ? "On" : "Off"}
                            </button>
                        </div>
                    </div>

                    {/* Mesh Update Controls */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Mesh Updates:</div>
                        <div style={{ display: "flex", gap: "3px", marginBottom: "3px" }}>
                            <button
                                onClick={toggleMeshUpdates}
                                style={{
                                    flex: 1,
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: meshUpdatesEnabled ? "#4CAF50" : "#F44336",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                {meshUpdatesEnabled ? "Disable" : "Enable"}
                            </button>
                            <button
                                onClick={forceUpdateMesh}
                                disabled={meshUpdatesEnabled}
                                style={{
                                    flex: 1,
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: meshUpdatesEnabled ? "#666" : "#FF9800",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: meshUpdatesEnabled ? "not-allowed" : "pointer",
                                }}
                            >
                                Update Now
                            </button>
                            <button
                                onClick={forceLoadTiles}
                                style={{
                                    flex: 1,
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: "#9C27B0",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Load Tiles
                            </button>
                        </div>
                        <div style={{ fontSize: "15px", color: "#888" }}>💡 Disable before adding many satellites</div>
                    </div>

                    {/* Time Controls */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Time:</div>
                        <div style={{ display: "flex", gap: "3px", marginBottom: "5px" }}>
                            <button
                                onClick={togglePause}
                                style={{
                                    flex: 1,
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: isPaused ? "#4CAF50" : "#f44336",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                {isPaused ? "Play" : "Pause"}
                            </button>
                        </div>

                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Speed:</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "3px" }}>
                            <button
                                onClick={() => handleSetTimeMultiplier(1)}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: timeMultiplier === 1 ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                1x
                            </button>
                            <button
                                onClick={() => handleSetTimeMultiplier(10)}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: timeMultiplier === 10 ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                10x
                            </button>
                            <button
                                onClick={() => handleSetTimeMultiplier(100)}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: timeMultiplier === 100 ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                100x
                            </button>
                            <button
                                onClick={() => handleSetTimeMultiplier(1000)}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: timeMultiplier === 1000 ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                1Kx
                            </button>
                            <button
                                onClick={() => handleSetTimeMultiplier(10000)}
                                style={{
                                    padding: "3px 6px",
                                    fontSize: "15px",
                                    backgroundColor: timeMultiplier === 10000 ? "#4CAF50" : "#666",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                10Kx
                            </button>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ marginBottom: "3px", fontWeight: "bold", fontSize: "15px" }}>Timeline:</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
                            <div style={{ fontSize: "15px", color: "#aaa", minWidth: "60px" }}>
                                {(() => {
                                    const now = new Date();
                                    const currentTime = new Date(now.getTime() + timelineOffset * 60 * 60 * 1000);
                                    return currentTime.toLocaleTimeString();
                                })()}
                            </div>
                            <button
                                onClick={resetTimelineToNow}
                                style={{
                                    padding: "2px 6px",
                                    fontSize: "15px",
                                    backgroundColor: "#4CAF50",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "2px",
                                    cursor: "pointer",
                                }}
                            >
                                Reset
                            </button>
                        </div>
                        <div style={{ position: "relative", marginBottom: "5px", padding: "0 5px" }}>
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
                                    height: "15px",
                                    background: "linear-gradient(to right, #333 0%, #4CAF50 50%, #333 100%)",
                                    outline: "none",
                                    borderRadius: "8px",
                                    cursor: isDraggingTimeline ? "grabbing" : "grab",
                                    WebkitAppearance: "none",
                                    appearance: "none",
                                }}
                            />
                            {/* Tick marks */}
                            {[-24, -12, -6, -3, 0, 3, 6, 12, 24].map((hour) => {
                                const position = (hour + 24) / 48; // Convert to 0-1 range
                                return (
                                    <div
                                        key={hour}
                                        style={{
                                            position: "absolute",
                                            top: "18px",
                                            left: `${position * 100}%`,
                                            transform: "translateX(-50%)",
                                            fontSize: "15px",
                                            color: hour === 0 ? "#4CAF50" : "#aaa",
                                            fontWeight: hour === 0 ? "bold" : "normal",
                                        }}
                                    >
                                        {hour === 0 ? "Now" : `${hour > 0 ? "+" : ""}${hour}h`}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ fontSize: "15px", color: "#888" }}>💡 Drag to scrub through time</div>
                    </div>
                </div>

                {/* Satellite Locations Display - Commented out for space */}

                {/* Side Panel for Selected Entity */}
                {showSidePanel && selectedEntity && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: "10px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: "rgba(0, 0, 0, 0.9)",
                            color: "white",
                            padding: "15px",
                            borderRadius: "8px",
                            fontFamily: "monospace",
                            fontSize: "15px",
                            minWidth: "300px",
                            maxWidth: "400px",
                            maxHeight: "80vh",
                            overflow: "auto",
                            border: "2px solid #4CAF50",
                            zIndex: 1000,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <h3 style={{ margin: 0, color: "#4CAF50", fontSize: "15px" }}>Satellite Details</h3>
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
                                    fontSize: "15px",
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>

                        <div style={{ marginBottom: "10px", fontSize: "15px" }}>
                            <strong>Name:</strong> {selectedEntity.name}
                        </div>

                        <div style={{ marginBottom: "10px", fontSize: "15px" }}>
                            <strong>ID:</strong> {selectedEntity.id}
                        </div>

                        {selectedEntity.getCurrentLocation && (
                            <div style={{ marginBottom: "10px", fontSize: "15px" }}>
                                <strong>Current Position:</strong>
                                {(() => {
                                    try {
                                        const location = selectedEntity.getCurrentLocation();
                                        return location &&
                                            typeof location.latitude === "number" &&
                                            typeof location.longitude === "number" &&
                                            typeof location.altitude === "number" ? (
                                            <div style={{ marginLeft: "10px", fontSize: "15px" }}>
                                                <div>Lat: {location.latitude.toFixed(4)}°</div>
                                                <div>Lon: {location.longitude.toFixed(4)}°</div>
                                                <div>Alt: {location.altitude.toFixed(2)} km</div>
                                            </div>
                                        ) : (
                                            <div style={{ marginLeft: "10px", fontSize: "15px", color: "#ff9800" }}>Position not available</div>
                                        );
                                    } catch (error) {
                                        return <div style={{ marginLeft: "10px", fontSize: "15px", color: "#ff9800" }}>Error getting position</div>;
                                    }
                                })()}
                            </div>
                        )}

                        {selectedEntity.getOrbitalElements && (
                            <div style={{ marginBottom: "10px", fontSize: "15px" }}>
                                <strong>Orbital Elements:</strong>
                                {(() => {
                                    try {
                                        const coe = selectedEntity.getOrbitalElements();
                                        return coe ? (
                                            <div style={{ marginLeft: "10px", fontSize: "15px" }}>
                                                <div>Inclination: {coe.inclination ? ((coe.inclination * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                                <div>RAAN: {coe.rightAscension ? ((coe.rightAscension * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                                <div>Eccentricity: {coe.eccentricity ? coe.eccentricity.toFixed(6) : "N/A"}</div>
                                                <div>Argument of perigee: {coe.argumentOfPerigee ? ((coe.argumentOfPerigee * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                                <div>Mean anomaly: {coe.meanAnomaly ? ((coe.meanAnomaly * 180) / Math.PI).toFixed(2) : "N/A"}°</div>
                                                <div>Mean motion: {coe.meanMotion ? coe.meanMotion.toFixed(8) : "N/A"} rev/day</div>
                                            </div>
                                        ) : (
                                            <div style={{ marginLeft: "10px", fontSize: "15px", color: "#ff9800" }}>Orbital elements not available</div>
                                        );
                                    } catch (error) {
                                        return <div style={{ marginLeft: "10px", fontSize: "15px", color: "#ff9800" }}>Error getting orbital elements</div>;
                                    }
                                })()}
                            </div>
                        )}

                        <div style={{ marginTop: "15px", padding: "10px", background: "rgba(76, 175, 80, 0.1)", borderRadius: "5px" }}>
                            <div style={{ fontSize: "15px", color: "#4CAF50" }}>💡 Click anywhere on the screen to deselect</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
