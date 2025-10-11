import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./App.css";

// Import Gorb Bro ECS
import {
    Engine,
    RenderingService,
    TimeService,
    QueryService,
    PropagationSystem,
    TransformSystem,
    RenderSystem,
    createRSO,
    createPoint,
    createMeshEntity,
    ReferenceFrame,
} from "./engine";

function App() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const [entityCount, setEntityCount] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [simulationTime, setSimulationTime] = useState(Date.now());

    useEffect(() => {
        if (!canvasRef.current) return;

        // ====================================================================
        // Initialize Gorb Bro ECS Engine
        // ====================================================================

        // Create rendering service
        const renderingService = new RenderingService(canvasRef.current, {
            antialias: true,
        });

        // Create time service
        const timeService = new TimeService(Date.now());
        timeService.play(); // Start time

        // Create query service
        const queryService = new QueryService();

        // Initialize engine with services
        const engine = new Engine({
            services: {
                rendering: renderingService,
                time: timeService,
                query: queryService,
            },
            maxEntities: 100000,
        });

        // Add systems in priority order
        engine.addSystem(new PropagationSystem());
        engine.addSystem(new TransformSystem());
        engine.addSystem(new RenderSystem());

        engineRef.current = engine;

        // ====================================================================
        // Setup Scene
        // ====================================================================

        const scene = renderingService.getScene();
        const camera = renderingService.getCamera() as THREE.PerspectiveCamera;
        const renderer = renderingService.getRenderer();

        // Set camera position
        camera.position.set(0, 0, 15000);
        camera.lookAt(0, 0, 0);

        // Add orbit controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 100;
        controls.maxDistance = 50000;
        controlsRef.current = controls;

        // ====================================================================
        // Create Earth
        // ====================================================================

        const earthGeometry = new THREE.SphereGeometry(6371, 64, 64); // Earth radius in km
        const earthMaterial = new THREE.MeshPhongMaterial({
            color: 0x2233ff,
            emissive: 0x112244,
            wireframe: false,
        });
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        scene.add(earth);

        // Register geometries and materials
        renderingService.registerGeometry("sphere", new THREE.SphereGeometry(1, 16, 16));
        renderingService.registerGeometry("box", new THREE.BoxGeometry(1, 1, 1));
        renderingService.registerMaterial("default", new THREE.MeshStandardMaterial({ color: 0xffffff }));
        renderingService.registerMaterial("red", new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        renderingService.registerMaterial("green", new THREE.MeshStandardMaterial({ color: 0x00ff00 }));

        // ====================================================================
        // Create Entities
        // ====================================================================

        // Create some mock satellites using TLE format
        const satellites = [
            {
                line1: "1 25544U 98067A   21001.00000000  .00016717  00000-0  10270-3 0  9005",
                line2: "2 25544  51.6442 339.8364 0002571  31.2677 328.8693 15.48919393123456",
                name: "ISS (ZARYA)",
            },
            {
                line1: "1 00001U 12345A   21001.00000000  .00000000  00000-0  00000-0 0  0001",
                line2: "2 00001  98.0000   0.0000 0001000   0.0000   0.0000 14.00000000000001",
                name: "SAT-1",
            },
            {
                line1: "1 00002U 12345B   21001.00000000  .00000000  00000-0  00000-0 0  0002",
                line2: "2 00002  90.0000  90.0000 0001000   0.0000   0.0000 14.50000000000002",
                name: "SAT-2",
            },
        ];

        for (const tle of satellites) {
            createRSO(engine, tle);
        }

        // Create some static points
        createPoint(engine, 8000, 0, 0, ReferenceFrame.ECI, {
            color: 0xff0000,
            size: 100,
            label: "Point A",
        });

        createPoint(engine, 0, 8000, 0, ReferenceFrame.ECI, {
            color: 0x00ff00,
            size: 100,
            label: "Point B",
        });

        createPoint(engine, 0, 0, 8000, ReferenceFrame.ECI, {
            color: 0x0000ff,
            size: 100,
            label: "Point C",
        });

        // Create some mesh entities
        createMeshEntity(engine, 10000, 0, 0, "box", "red", [200, 200, 200], ReferenceFrame.ECI);

        createMeshEntity(engine, 0, 10000, 0, "sphere", "green", [150, 150, 150], ReferenceFrame.ECI);

        setEntityCount(engine.getEntityCount());

        // ====================================================================
        // Update UI periodically
        // ====================================================================

        const uiUpdateInterval = setInterval(() => {
            setEntityCount(engine.getEntityCount());
            setSimulationTime(timeService.getCurrentTime());
            setIsPaused(engine.isPaused());
        }, 100); // Update UI every 100ms

        // ====================================================================
        // Animation loop with OrbitControls
        // ====================================================================

        // Custom animation loop that includes OrbitControls update
        const animate = () => {
            requestAnimationFrame(animate);

            // Update controls
            if (controlsRef.current) {
                controlsRef.current.update();
            }
        };

        animate();

        // Start the engine (it will handle its own animation loop)
        engine.start();

        // ====================================================================
        // Cleanup
        // ====================================================================

        return () => {
            clearInterval(uiUpdateInterval);
            engine.cleanup();
            controls.dispose();
            renderer.dispose();
            earthGeometry.dispose();
            earthMaterial.dispose();
        };
    }, []);

    // ====================================================================
    // UI Controls
    // ====================================================================

    const togglePause = () => {
        const engine = engineRef.current;
        if (!engine) return;

        if (engine.isPaused()) {
            engine.resume();
        } else {
            engine.pause();
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

    const addSatellite = () => {
        const engine = engineRef.current;
        if (!engine) return;

        // Create a random satellite
        const randomTle = {
            line1: `1 ${Math.floor(Math.random() * 99999)
                .toString()
                .padStart(5, "0")}U 00000A   21001.00000000  .00000000  00000-0  00000-0 0  0000`,
            line2: `2 ${Math.floor(Math.random() * 99999)
                .toString()
                .padStart(5, "0")}  ${(Math.random() * 180).toFixed(4).padStart(8, " ")} ${(Math.random() * 360).toFixed(4).padStart(8, " ")} 0001000   0.0000   0.0000 ${(
                14 +
                Math.random() * 2
            ).toFixed(8)}00000001`,
            name: `Random Satellite ${entityCount + 1}`,
        };

        createRSO(engine, randomTle);
        setEntityCount(engine.getEntityCount());
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString();
    };

    // ====================================================================
    // Render UI
    // ====================================================================

    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
            <canvas ref={canvasRef} />

            {/* Control Panel */}
            <div
                style={{
                    position: "absolute",
                    top: 20,
                    left: 20,
                    background: "rgba(0, 0, 0, 0.7)",
                    color: "white",
                    padding: "20px",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "14px",
                    minWidth: "250px",
                }}
            >
                <h2 style={{ margin: "0 0 15px 0", fontSize: "18px" }}>Gorb Bro ECS Demo</h2>

                <div style={{ marginBottom: "10px" }}>
                    <strong>Entities:</strong> {entityCount}
                </div>

                <div style={{ marginBottom: "15px" }}>
                    <strong>Sim Time:</strong> {formatTime(simulationTime)}
                </div>

                <div style={{ marginBottom: "15px" }}>
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
                        }}
                    >
                        {isPaused ? "▶ Play" : "⏸ Pause"}
                    </button>

                    <button
                        onClick={addSatellite}
                        style={{
                            padding: "8px 16px",
                            cursor: "pointer",
                            background: "#2196F3",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                        }}
                    >
                        + Add Satellite
                    </button>
                </div>

                <div style={{ marginBottom: "10px" }}>
                    <strong>Time Speed:</strong>
                </div>
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                    {[0.1, 0.5, 1, 2, 5, 10].map((speed) => (
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
                            }}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default App;
