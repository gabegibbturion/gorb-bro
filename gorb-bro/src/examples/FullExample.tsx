import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "stats.js";

// Import Gorb Bro ECS
import {
    Engine,
    RenderingService,
    TimeService,
    PropagationSystem,
    RenderSystem,
    SelectionSystem,
    createSolarSystem,
    ComponentType,
    OrbitalFormat,
    type EntityId,
    InstancedSatelliteSystem,
} from "../engine";

// Import celestial update system and propagators
import { CelestialUpdateSystem } from "../engine/systems/CelestialUpdateSystem";
import { HybridK2SGP4Propagator } from "../engine/propagators/HybridK2SGP4Propagator";
import { TLELoader } from "../engine/utils/TLELoader";

// Import TLE file
import gpText from "../assets/gp.txt?raw";

function FullExample() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const celestialSystemRef = useRef<CelestialUpdateSystem | null>(null);
    const satelliteEntitiesRef = useRef<EntityId[]>([]);
    const statsRef = useRef<Stats | null>(null);

    // UI state that triggers re-renders (only when actually changed)
    const [entityCount, setEntityCount] = useState(0);
    const [satelliteCount, setSatelliteCount] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showCelestialInfo, setShowCelestialInfo] = useState(true);
    const [selectedEntity, setSelectedEntity] = useState<EntityId | null>(null);

    // Display refs that update without re-render (for frequently changing values)
    const simTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const entityCountDisplayRef = useRef<HTMLSpanElement>(null);
    const satelliteCountDisplayRef = useRef<HTMLSpanElement>(null);
    const celestialUpdateTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const propagationTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const transformTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const renderTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const instancedSatelliteTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const selectionTimeDisplayRef = useRef<HTMLSpanElement>(null);

    // Frame timing refs
    const totalFrameTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const totalSystemTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const engineOverheadDisplayRef = useRef<HTMLSpanElement>(null);
    const threeRenderTimeDisplayRef = useRef<HTMLSpanElement>(null);
    const unmeasuredTimeDisplayRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        const setupScene = async () => {
            // ====================================================================
            // Initialize Gorb Bro ECS Engine
            // ====================================================================

            const renderingService = new RenderingService(canvasRef.current!, {
                antialias: true,
            });

            const timeService = new TimeService(Date.now());
            timeService.play();

            const engine = new Engine({
                services: {
                    rendering: renderingService,
                    time: timeService,
                },
                maxEntities: 100000,
            });

            engineRef.current = engine;

            // ====================================================================
            // Add Systems
            // ====================================================================

            // Celestial update system (updates Earth, Sun, Moon)
            const celestialSystem = new CelestialUpdateSystem();
            engine.addSystem(celestialSystem);
            celestialSystemRef.current = celestialSystem;

            // Instanced satellite rendering system (MUST be added BEFORE PropagationSystem!)
            // PropagationSystem needs to find this during init
            const instancedSatelliteSystem = new InstancedSatelliteSystem(100000);
            engine.addSystem(instancedSatelliteSystem);

            // Propagation system (for satellites) - added AFTER InstancedSatelliteSystem
            engine.addSystem(new PropagationSystem());

            // engine.addSystem(new TransformSystem()); // Disabled - not needed for current setup
            engine.addSystem(new RenderSystem());
            engine.addSystem(new SelectionSystem());

            // ====================================================================
            // Setup Scene
            // ====================================================================

            const camera = renderingService.getCamera() as THREE.PerspectiveCamera;
            const renderer = renderingService.getRenderer();

            // Set camera position
            camera.position.set(0, 0, 25000);
            camera.lookAt(0, 0, 0);

            // Add orbit controls
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.minDistance = 6500;
            controls.maxDistance = 500000;
            controlsRef.current = controls;

            // Add starfield
            // addStarfield(scene);

            // ====================================================================
            // Setup Stats.js
            // ====================================================================

            const stats = new Stats();
            stats.showPanel(0); // 0: fps, 1: ms, 2: mb
            stats.dom.style.position = "absolute";
            stats.dom.style.top = "0";
            stats.dom.style.left = "0";
            document.body.appendChild(stats.dom);
            statsRef.current = stats;

            // ====================================================================
            // Create Solar System (Earth, Sun, Moon)
            // ====================================================================

            const { earth, sun, moon } = await createSolarSystem(engine, {
                earth: {
                    radius: 6371,
                    segments: 64,
                },
                sun: {
                    visualDistance: 200000,
                    radius: 10000, // Scaled down for visibility
                    autoPosition: true,
                },
                moon: {
                    visualDistance: 50000,
                    radius: 1737,
                    autoPosition: true,
                },
            });

            // Register celestial bodies for automatic updates
            celestialSystem.registerCelestialBodies({
                earth: earth.object,
                sun: sun.object,
                moon: moon.object,
            });

            // DEBUG: Make Earth transparent to see satellites
            const earthMesh = earth.object.getMesh();
            if (earthMesh) {
                (earthMesh.material as THREE.Material).transparent = true;
                (earthMesh.material as THREE.Material).opacity = 0.3;
                console.log("[DEBUG] Made Earth transparent (opacity 0.3)");
            }

            // Initial counts
            setEntityCount(engine.getEntityCount());
            setSatelliteCount(satelliteEntitiesRef.current.length);

            // ====================================================================
            // Setup Selection Listener
            // ====================================================================

            const selectionService = engine.getService("selection");
            if (selectionService && "onSelectionChange" in selectionService) {
                (selectionService as any).onSelectionChange((entityId: EntityId | null) => {
                    setSelectedEntity(entityId);
                });
            }

            // ====================================================================
            // Animation loop with OrbitControls and Stats
            // ====================================================================

            const animate = () => {
                const frameStartTime = performance.now();

                requestAnimationFrame(animate);

                // Update stats
                if (statsRef.current) {
                    statsRef.current.begin();
                }

                // Update controls
                if (controlsRef.current) {
                    controlsRef.current.update();
                }

                // Get system timing data
                const celestialSystem = engine.getSystem("celestialUpdate") as CelestialUpdateSystem | undefined;
                const propagationSystem = engine.getSystem("propagation") as PropagationSystem | undefined;
                // const transformSystem = engine.getSystem("transform") as TransformSystem | undefined; // Disabled
                const renderSystem = engine.getSystem("render") as RenderSystem | undefined;
                const instancedSatelliteSystem = engine.getSystem("instancedSatellite") as InstancedSatelliteSystem | undefined;
                const selectionSystem = engine.getSystem("selection") as SelectionSystem | undefined;

                // Calculate total system time
                const celestialTime = celestialSystem?.celestialUpdateTime || 0;
                const propagationTime = propagationSystem?.propagationTime || 0;
                const transformTime = 0; // Disabled
                const renderSystemTime = renderSystem?.renderTime || 0;
                const instancedSatelliteTime = instancedSatelliteSystem?.renderTime || 0;
                const selectionTime = selectionSystem?.selectionTime || 0;
                const totalSystemTime = celestialTime + propagationTime + transformTime + renderSystemTime + instancedSatelliteTime + selectionTime;

                // Update display values directly (no re-render)
                if (simTimeDisplayRef.current) {
                    simTimeDisplayRef.current.textContent = formatTime(timeService.getCurrentTime());
                }
                if (entityCountDisplayRef.current) {
                    const count = engine.getEntityCount();
                    entityCountDisplayRef.current.textContent = count.toString();
                }
                if (satelliteCountDisplayRef.current) {
                    satelliteCountDisplayRef.current.textContent = satelliteEntitiesRef.current.length.toString();
                }
                if (celestialUpdateTimeDisplayRef.current && celestialSystem) {
                    celestialUpdateTimeDisplayRef.current.textContent = celestialSystem.celestialUpdateTime.toFixed(2);
                }
                if (propagationTimeDisplayRef.current && propagationSystem) {
                    propagationTimeDisplayRef.current.textContent = propagationSystem.propagationTime.toFixed(2);
                }
                // Transform system disabled
                if (transformTimeDisplayRef.current) {
                    transformTimeDisplayRef.current.textContent = "N/A";
                }
                if (renderTimeDisplayRef.current && renderSystem) {
                    renderTimeDisplayRef.current.textContent = renderSystem.renderTime.toFixed(2);
                }
                if (instancedSatelliteTimeDisplayRef.current && instancedSatelliteSystem) {
                    instancedSatelliteTimeDisplayRef.current.textContent = instancedSatelliteTime.toFixed(2);
                }
                if (selectionTimeDisplayRef.current && selectionSystem) {
                    selectionTimeDisplayRef.current.textContent = selectionSystem.selectionTime.toFixed(2);
                }

                // Calculate frame timing
                const frameEndTime = performance.now();
                const totalFrameTime = frameEndTime - frameStartTime;

                // Get engine overhead (time spent in engine.update but not in systems)
                const engineUpdateTime = (engine as any).lastUpdateTime || 0;
                const engineOverhead = Math.max(0, engineUpdateTime - totalSystemTime);

                // Get Three.js render time
                const threeRenderTime = renderingService.lastRenderTime || 0;

                // Calculate unmeasured time (time not accounted for - likely browser/JS overhead, OrbitControls, etc.)
                const measuredTime = totalSystemTime + engineOverhead + threeRenderTime;
                const unmeasuredTime = Math.max(0, totalFrameTime - measuredTime);

                // Update frame timing displays
                if (totalFrameTimeDisplayRef.current) {
                    totalFrameTimeDisplayRef.current.textContent = totalFrameTime.toFixed(2);
                }
                if (totalSystemTimeDisplayRef.current) {
                    totalSystemTimeDisplayRef.current.textContent = totalSystemTime.toFixed(2);
                }
                if (engineOverheadDisplayRef.current) {
                    engineOverheadDisplayRef.current.textContent = (engineOverhead - totalSystemTime).toFixed(2);
                }
                if (threeRenderTimeDisplayRef.current) {
                    threeRenderTimeDisplayRef.current.textContent = threeRenderTime.toFixed(2);
                }
                if (unmeasuredTimeDisplayRef.current) {
                    unmeasuredTimeDisplayRef.current.textContent = unmeasuredTime.toFixed(2);
                }

                // Note: isPaused state is now managed by togglePause button directly

                if (statsRef.current) {
                    statsRef.current.end();
                }
            };
            animate();

            // Start the engine
            engine.start();

            // ====================================================================
            // Cleanup
            // ====================================================================

            return () => {
                // Cleanup
                if (statsRef.current) {
                    document.body.removeChild(statsRef.current.dom);
                }
                earth.object.destroy();
                sun.object.destroy();
                moon.object.destroy();
                engine.cleanup();
                controls.dispose();
                renderer.dispose();
            };
        };

        setupScene();
    }, []);

    // ====================================================================
    // UI Control Functions
    // ====================================================================

    const togglePause = () => {
        const engine = engineRef.current;
        if (!engine) return;

        if (engine.isPaused()) {
            engine.resume();
            setIsPaused(false);
        } else {
            engine.pause();
            setIsPaused(true);
        }
    };

    const changeSpeed = (speed: number) => {
        const engine = engineRef.current;
        if (!engine) return;

        const timeService = engine.getService("time") as TimeService;
        if (timeService) {
            timeService.setRate(speed);
        }
    };

    const loadSatellites = async (count?: number) => {
        const engine = engineRef.current;
        if (!engine) return;

        setIsLoading(true);

        try {
            // Parse TLE data
            const tles = TLELoader.parseTLEText(gpText);
            console.log(`Loaded ${tles.length} TLEs from gp.txt`);

            // Limit to requested count or all
            const tlesToLoad = count ? tles.slice(0, count) : tles;

            // Calculate stagger offset per satellite
            const baseStaggerInterval = 1000; // Base 1 second stagger
            const staggerPerSat = baseStaggerInterval / Math.max(tlesToLoad.length / 100, 1);

            // Create satellites with staggered propagators
            for (let i = 0; i < tlesToLoad.length; i++) {
                const tle = tlesToLoad[i];
                const entity = engine.createEntity();

                // Add orbital elements
                engine.addComponent(entity, {
                    type: ComponentType.ORBITAL_ELEMENTS,
                    format: OrbitalFormat.TLE,
                    data: TLELoader.toTLE(tle),
                    epoch: Date.now(),
                });

                // Add Hybrid K2/SGP4 propagator with staggered updates
                const staggerOffset = (i * staggerPerSat) % baseStaggerInterval;
                engine.addComponent(entity, {
                    type: ComponentType.PROPAGATOR,
                    propagator: new HybridK2SGP4Propagator(TLELoader.toTLE(tle), {
                        sgp4UpdateInterval: 60000, // SGP4 update every 60 seconds
                        staggerOffset: staggerOffset,
                        timeJumpThreshold: 1000, // Force SGP4 for jumps >1000 seconds
                        useK2: true, // Enable K2 for intermediate steps
                    }),
                });

                // Add billboard for rendering
                engine.addComponent(entity, {
                    type: ComponentType.BILLBOARD,
                    size: 50,
                    color: 0x00ff00,
                    sizeAttenuation: true,
                });

                satelliteEntitiesRef.current.push(entity);
            }

            console.log(`Created ${tlesToLoad.length} satellite entities with hybrid K2/SGP4 propagation`);
            console.log(`Stagger range: 0-${baseStaggerInterval}ms, per satellite: ${staggerPerSat.toFixed(2)}ms`);
            setSatelliteCount(satelliteEntitiesRef.current.length);
        } catch (error) {
            console.error("Failed to load satellites:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const clearSatellites = () => {
        const engine = engineRef.current;
        if (!engine) return;

        // Destroy all satellite entities
        for (const entity of satelliteEntitiesRef.current) {
            engine.destroyEntity(entity);
        }

        satelliteEntitiesRef.current = [];
        setSatelliteCount(0);
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    const getCelestialInfo = () => {
        const engine = engineRef.current;
        if (!engine) return { date: "", time: "" };

        const timeService = engine.getService("time") as TimeService;
        const timestamp = timeService ? timeService.getCurrentTime() : Date.now();
        const date = new Date(timestamp);

        return {
            date: date.toLocaleDateString(),
            time: date.toLocaleTimeString(),
        };
    };

    // ====================================================================
    // Render UI
    // ====================================================================

    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh", backgroundColor: "#000" }}>
            <canvas ref={canvasRef} />

            {/* Main Control Panel */}
            <div
                style={{
                    position: "absolute",
                    top: 20,
                    left: 20,
                    background: "rgba(0, 0, 0, 0.85)",
                    color: "white",
                    padding: "20px",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "14px",
                    minWidth: "300px",
                    maxWidth: "350px",
                    border: "1px solid #333",
                }}
            >
                <h2 style={{ margin: "0 0 15px 0", fontSize: "20px", color: "#00ff00" }}>🚀 Gorb Bro Full Demo</h2>

                <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #333" }}>
                    <div style={{ marginBottom: "8px" }}>
                        <strong>Total Entities:</strong> <span ref={entityCountDisplayRef}>{entityCount}</span>
                    </div>
                    <div style={{ marginBottom: "8px", color: "#00ff00" }}>
                        <strong>Satellites:</strong> <span ref={satelliteCountDisplayRef}>{satelliteCount}</span>
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                        <strong>Sim Time:</strong> <span ref={simTimeDisplayRef}>{formatTime(Date.now())}</span>
                    </div>
                    <div style={{ marginBottom: "8px", color: selectedEntity !== null ? "#ffff00" : undefined }}>
                        <strong>Selected:</strong> {selectedEntity !== null ? `Entity ${selectedEntity}` : "None"}
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px" }}>
                        <strong>Status:</strong> {isPaused ? "⏸ Paused" : "▶ Running"}
                    </div>
                </div>

                {/* Performance Stats - Frame Timing */}
                <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #333" }}>
                    <div style={{ marginBottom: "10px", color: "#ffaa00" }}>
                        <strong>⚡ Frame Timing (ms)</strong>
                    </div>
                    <div style={{ fontSize: "11px" }}>
                        <div style={{ marginBottom: "5px", fontWeight: "bold", color: "#00ffff" }}>
                            <strong>Total Frame:</strong> <span ref={totalFrameTimeDisplayRef}>0.00</span> ms
                        </div>
                        <div style={{ marginBottom: "3px", paddingLeft: "10px", opacity: 0.9 }}>
                            <strong>Systems Total:</strong> <span ref={totalSystemTimeDisplayRef}>0.00</span> ms
                        </div>
                        <div style={{ marginBottom: "3px", paddingLeft: "10px", opacity: 0.9 }}>
                            <strong>Engine Overhead:</strong> <span ref={engineOverheadDisplayRef}>0.00</span> ms
                        </div>
                        <div style={{ marginBottom: "3px", paddingLeft: "10px", opacity: 0.9 }}>
                            <strong>Three.js Render:</strong> <span ref={threeRenderTimeDisplayRef}>0.00</span> ms
                        </div>
                        <div style={{ marginBottom: "3px", paddingLeft: "10px", opacity: 0.7, color: "#ff6666" }}>
                            <strong>Unmeasured:</strong> <span ref={unmeasuredTimeDisplayRef}>0.00</span> ms
                        </div>
                    </div>
                </div>

                {/* Performance Stats - System Breakdown */}
                <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #333" }}>
                    <div style={{ marginBottom: "10px", color: "#ffaa00" }}>
                        <strong>🔧 System Breakdown (ms)</strong>
                    </div>
                    <div style={{ fontSize: "11px" }}>
                        <div style={{ marginBottom: "3px" }}>
                            <strong>Celestial:</strong> <span ref={celestialUpdateTimeDisplayRef}>0.00</span>
                        </div>
                        <div style={{ marginBottom: "3px" }}>
                            <strong>Propagation:</strong> <span ref={propagationTimeDisplayRef}>0.00</span>
                        </div>
                        <div style={{ marginBottom: "3px" }}>
                            <strong>Transform:</strong> <span ref={transformTimeDisplayRef}>N/A</span>
                        </div>
                        <div style={{ marginBottom: "3px" }}>
                            <strong>Render:</strong> <span ref={renderTimeDisplayRef}>0.00</span>
                        </div>
                        <div style={{ marginBottom: "3px" }}>
                            <strong>Instanced Sats:</strong> <span ref={instancedSatelliteTimeDisplayRef}>0.00</span>
                        </div>
                        <div style={{ marginBottom: "3px" }}>
                            <strong>Selection:</strong> <span ref={selectionTimeDisplayRef}>0.00</span>
                        </div>
                    </div>
                </div>

                {/* Playback Controls */}
                <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #333" }}>
                    <div style={{ marginBottom: "10px" }}>
                        <strong>Playback:</strong>
                    </div>
                    <button
                        onClick={togglePause}
                        style={{
                            padding: "8px 16px",
                            marginRight: "8px",
                            cursor: "pointer",
                            background: isPaused ? "#4CAF50" : "#f44336",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "14px",
                        }}
                    >
                        {isPaused ? "▶ Play" : "⏸ Pause"}
                    </button>
                </div>

                {/* Time Speed Controls */}
                <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #333" }}>
                    <div style={{ marginBottom: "10px" }}>
                        <strong>Time Speed:</strong>
                    </div>
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {[0.1, 0.5, 1, 2, 5, 10, 50, 100].map((speed) => (
                            <button
                                key={speed}
                                onClick={() => changeSpeed(speed)}
                                style={{
                                    padding: "6px 12px",
                                    cursor: "pointer",
                                    background: "#555",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                }}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>
                </div>

                {/* Satellite Loading */}
                <div style={{ marginBottom: "15px" }}>
                    <div style={{ marginBottom: "10px" }}>
                        <strong>Load Satellites:</strong>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <button
                            onClick={() => loadSatellites(100)}
                            disabled={isLoading}
                            style={{
                                padding: "8px 16px",
                                cursor: isLoading ? "not-allowed" : "pointer",
                                background: isLoading ? "#666" : "#2196F3",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "14px",
                            }}
                        >
                            {isLoading ? "Loading..." : "Load 100 Satellites"}
                        </button>
                        <button
                            onClick={() => loadSatellites(1000)}
                            disabled={isLoading}
                            style={{
                                padding: "8px 16px",
                                cursor: isLoading ? "not-allowed" : "pointer",
                                background: isLoading ? "#666" : "#2196F3",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "14px",
                            }}
                        >
                            {isLoading ? "Loading..." : "Load 1000 Satellites"}
                        </button>
                        <button
                            onClick={() => loadSatellites()}
                            disabled={isLoading}
                            style={{
                                padding: "8px 16px",
                                cursor: isLoading ? "not-allowed" : "pointer",
                                background: isLoading ? "#666" : "#FF9800",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "14px",
                            }}
                        >
                            {isLoading ? "Loading..." : "Load All (GP.TXT)"}
                        </button>
                        <button
                            onClick={clearSatellites}
                            disabled={satelliteCount === 0}
                            style={{
                                padding: "8px 16px",
                                cursor: satelliteCount === 0 ? "not-allowed" : "pointer",
                                background: satelliteCount === 0 ? "#666" : "#f44336",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "14px",
                            }}
                        >
                            Clear Satellites
                        </button>
                    </div>
                </div>

                {/* Propagation Info */}
                <div
                    style={{
                        fontSize: "10px",
                        opacity: 0.6,
                        borderTop: "1px solid #333",
                        paddingTop: "10px",
                        marginBottom: "10px",
                    }}
                >
                    <div style={{ marginBottom: "5px" }}>
                        <strong>Propagation:</strong> Hybrid K2/SGP4
                    </div>
                    <div>• SGP4: Every 60s (staggered)</div>
                    <div>• K2: Intermediate frames</div>
                    <div>• Force SGP4: Time jumps &gt;1000s</div>
                </div>

                {/* Controls Help */}
                <div style={{ fontSize: "11px", opacity: 0.7, borderTop: "1px solid #333", paddingTop: "10px" }}>
                    <div>🖱️ Left drag: Rotate</div>
                    <div>🖱️ Right drag: Pan</div>
                    <div>🖱️ Scroll: Zoom</div>
                </div>
            </div>

            {/* Celestial Information Panel */}
            {showCelestialInfo && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 20,
                        right: 20,
                        background: "rgba(0, 0, 0, 0.85)",
                        color: "white",
                        padding: "20px",
                        borderRadius: "8px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        maxWidth: "300px",
                        border: "1px solid #333",
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                        <h3 style={{ margin: 0, fontSize: "14px", color: "#00ff00" }}>🌍 Celestial Info</h3>
                        <button
                            onClick={() => setShowCelestialInfo(false)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "#999",
                                cursor: "pointer",
                                fontSize: "16px",
                            }}
                        >
                            ×
                        </button>
                    </div>
                    <div style={{ opacity: 0.9, lineHeight: "1.6" }}>
                        <div>
                            <strong>Date:</strong> {getCelestialInfo().date}
                        </div>
                        <div>
                            <strong>Time:</strong> {getCelestialInfo().time}
                        </div>
                        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #333" }}>
                            <div>🌍 Earth: Rotating</div>
                            <div>☀️ Sun: Auto-positioned</div>
                            <div>🌙 Moon: Auto-positioned</div>
                        </div>
                    </div>
                </div>
            )}

            {!showCelestialInfo && (
                <button
                    onClick={() => setShowCelestialInfo(true)}
                    style={{
                        position: "absolute",
                        bottom: 20,
                        right: 20,
                        padding: "10px 15px",
                        background: "rgba(0, 0, 0, 0.85)",
                        color: "white",
                        border: "1px solid #333",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontFamily: "monospace",
                    }}
                >
                    Show Celestial Info
                </button>
            )}

            {/* Legend & Selected Entity Info */}
            <div
                style={{
                    position: "absolute",
                    top: 20,
                    right: 20,
                    background: "rgba(0, 0, 0, 0.85)",
                    color: "white",
                    padding: "15px",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    border: "1px solid #333",
                    maxWidth: "280px",
                }}
            >
                <h3 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>Legend</h3>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "5px" }}>
                    <div style={{ width: "15px", height: "15px", background: "#2233ff", marginRight: "8px", borderRadius: "50%" }}></div>
                    <span>Earth</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "5px" }}>
                    <div style={{ width: "15px", height: "15px", background: "#ffff00", marginRight: "8px", borderRadius: "50%" }}></div>
                    <span>Sun</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", marginBottom: "5px" }}>
                    <div style={{ width: "15px", height: "15px", background: "#aaaaaa", marginRight: "8px", borderRadius: "50%" }}></div>
                    <span>Moon</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: "15px", height: "15px", background: "#00ff00", marginRight: "8px", borderRadius: "50%" }}></div>
                    <span>Satellites</span>
                </div>

                {/* Selected Entity Info */}
                {selectedEntity !== null && (
                    <>
                        <div style={{ borderTop: "1px solid #333", marginTop: "15px", paddingTop: "15px" }}>
                            <h3 style={{ margin: "0 0 10px 0", fontSize: "14px", color: "#ff0000" }}>🎯 Selected Entity</h3>
                            <div style={{ fontSize: "11px", lineHeight: "1.6" }}>
                                <div style={{ marginBottom: "5px" }}>
                                    <strong>Entity ID:</strong> {selectedEntity}
                                </div>
                                {(() => {
                                    const engine = engineRef.current;
                                    if (!engine) return null;

                                    const position = engine.getComponent(selectedEntity, ComponentType.POSITION);
                                    const orbital = engine.getComponent(selectedEntity, ComponentType.ORBITAL_ELEMENTS);
                                    const mesh = engine.getComponent(selectedEntity, ComponentType.MESH);
                                    const billboard = engine.getComponent(selectedEntity, ComponentType.BILLBOARD);

                                    return (
                                        <>
                                            <div style={{ marginBottom: "5px" }}>
                                                <strong>Components:</strong>
                                            </div>
                                            <div style={{ paddingLeft: "10px", fontSize: "10px" }}>
                                                {position && <div>✓ Position</div>}
                                                {orbital && <div>✓ Orbital Elements</div>}
                                                {mesh && <div>✓ Mesh</div>}
                                                {billboard && <div>✓ Billboard</div>}
                                            </div>
                                            {position && "x" in position && (
                                                <div style={{ marginTop: "5px" }}>
                                                    <strong>Position (km):</strong>
                                                    <div style={{ paddingLeft: "10px", fontSize: "10px" }}>
                                                        <div>X: {position.x.toFixed(2)}</div>
                                                        <div>Y: {position.y.toFixed(2)}</div>
                                                        <div>Z: {position.z.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default FullExample;
