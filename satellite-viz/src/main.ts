import * as satellite from "satellite.js";
import Stats from "stats.js";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DynOrbits } from "./DynOrbits";
import { SatPoints } from "./SatPoints";

// Constants
const MU_EARTH = 0.000001536328985; // G*MassOfEarth in units of earth radius

// TLE interface
interface TLEData {
    name: string;
    line1: string;
    line2: string;
}

// TLE parsing functions
function parseTLEFile(content: string): TLEData[] {
    const lines = content.split("\n").filter((line) => line.trim());
    const tles: TLEData[] = [];

    for (let i = 0; i < lines.length; i += 3) {
        if (i + 2 < lines.length) {
            const name = lines[i].trim();
            const line1 = lines[i + 1].trim();
            const line2 = lines[i + 2].trim();

            if (line1.startsWith("1 ") && line2.startsWith("2 ")) {
                tles.push({ name, line1, line2 });
            }
        }
    }

    return tles;
}

// Load TLE file
async function loadTLEFile(maxCount: number = 0): Promise<TLEData[]> {
    try {
        const response = await fetch("/gp.txt");
        const content = await response.text();
        const tles = parseTLEFile(content);

        if (maxCount > 0) {
            return tles.slice(0, maxCount);
        }

        return tles;
    } catch (error) {
        console.error("Error loading TLE file:", error);
        return [];
    }
}

// Global variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let points: SatPoints;
let clickOrbit: DynOrbits;
let clock: THREE.Clock;
let allSatState: number[][];
let allSatColorIn: number[][];
let allSatColorOut: number[][];
let allSatPeriods: number[];
let satNames: string[];
let satN: number;
let earth: THREE.Mesh;
let light: THREE.DirectionalLight;
let ambientLight: THREE.AmbientLight;
let stats: Stats;
let useSatelliteJS: boolean = false;
let useK2Propagator: boolean = false; // K2 propagator option
let timeMultiplier: number = 100; // Time acceleration factor
let simulationTime: Date = new Date(); // Global simulation time
let satelliteData: Array<{
    name: string;
    tle: {
        line1: string;
        line2: string;
    };
    state: number[];
    period: number;
}> = [];
let satRecs: satellite.SatRec[] = [];

// Performance optimization variables
let maxSatellites: number = 100000; // Maximum satellite capacity
let isInitialized: boolean = false; // Track if SatPoints is initialized
let lastSatelliteCount: number = 0; // Track satellite count for updateRanges optimization

// Initialize the application
async function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141414);

    // Create camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 1000);
    camera.position.set(5, 0, 0);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Create controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxDistance = 18;
    controls.minDistance = 1.1;
    controls.rotateSpeed = 0.25;
    controls.enablePan = false;

    // Create clock
    clock = new THREE.Clock();

    // Add lighting
    setupLighting();

    // Create Earth globe
    createEarth();

    // Create UI
    createUI();

    // Setup Stats.js
    setupStats();

    // Load satellite data
    await loadSatelliteData();

    // Hide loading screen
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
        loadingElement.style.display = "none";
    }

    // Start animation
    animate();

    // Handle window resize
    window.addEventListener("resize", onWindowResize);
}

// Load satellite data (mock data for now)
async function loadSatelliteData() {
    // Create mock satellite data
    const mockSatellites = generateMockSatellites(1000);

    allSatState = mockSatellites.map((sat) => sat.state);
    allSatColorIn = mockSatellites.map(() => [0.458431, 0.0, 0.025]); // #750006
    allSatColorOut = mockSatellites.map(() => [1.0, 0.573, 0.282]); // #ff9248
    allSatPeriods = mockSatellites.map((sat) => sat.period);
    satNames = mockSatellites.map((sat) => sat.name);
    satN = mockSatellites.length;

    // Create satellite sprite
    const loader = new THREE.TextureLoader();
    const sprite = loader.load(
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIgZmlsbD0iI2ZmOTI0OCIvPgo8L3N2Zz4K"
    );

    // Create satellite points with maximum capacity
    points = new SatPoints(maxSatellites, sprite);
    points.renderOrder = 1;
    scene.add(points);
    isInitialized = true;

    // Create orbit visualization
    clickOrbit = new DynOrbits(1000);
    scene.add(clickOrbit);

    // Initialize satellite positions and colors efficiently
    updateSatPointsData();

    // Update satellite counter
    updateSatelliteCounter();
}

// Generate mock satellite data
function generateMockSatellites(count: number) {
    const satellites = [];

    for (let i = 0; i < count; i++) {
        // Generate random orbital parameters
        const a = 1.1 + Math.random() * 0.5; // Semi-major axis (Earth radii)
        const e = Math.random() * 0.1; // Eccentricity
        const i = Math.random() * Math.PI; // Inclination
        const Omega = Math.random() * 2 * Math.PI; // Right ascension of ascending node
        const M = Math.random() * 2 * Math.PI; // Mean anomaly
        const w = Math.random() * 2 * Math.PI; // Longitude of ascending node

        const tle = generateTLEFromCOEs(`Satellite_${i}`, a, e, i, Omega, w, M);

        // Convert to Cartesian coordinates (simplified)
        const r = (a * (1 - e * e)) / (1 + e * Math.cos(M));
        const x = r * Math.cos(M);
        const y = r * Math.sin(M);

        // Apply rotation for inclination and RAAN
        const cos_i = Math.cos(i);
        const sin_i = Math.sin(i);
        const cos_Omega = Math.cos(Omega);
        const sin_Omega = Math.sin(Omega);

        const x_final = x * cos_Omega - y * sin_Omega * cos_i;
        const y_final = x * sin_Omega + y * cos_Omega * cos_i;
        const z_final = y * sin_i;

        // Calculate velocity (simplified)
        const v = Math.sqrt(MU_EARTH / a);
        const vx = -v * Math.sin(M);
        const vy = v * Math.cos(M);
        const vz = 0;

        satellites.push({
            name: `Satellite_${i}`,
            state: [x_final, y_final, z_final, vx, vy, vz],
            period: 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH),
            tle: tle,
        });
    }

    return satellites;
}

// Generate TLE from COEs
function generateTLEFromCOEs(
    name: string,
    a: number,
    e: number,
    i: number,
    omega: number,
    w: number,
    M: number
): {
    name: string;
    line1: string;
    line2: string;
} {
    // Convert to TLE format (simplified)
    const n = Math.sqrt(398600.4418 / (a * a * a)); // Mean motion (rad/s)
    const n_deg = (n * 180) / Math.PI / 86400; // Mean motion in degrees per day

    const i_deg = (i * 180) / Math.PI;
    const omega_deg = (omega * 180) / Math.PI;
    const w_deg = (w * 180) / Math.PI;
    const M_deg = (M * 180) / Math.PI;

    // Generate satellite number (5 digits)
    const satNum = Math.floor(Math.random() * 99999) + 1;

    // Line 1: Satellite number, classification, international designator, epoch year, epoch day, etc.
    const line1 = `1 ${satNum.toString().padStart(5, "0")}U 24001A   24001.00000000  .00000000  00000-0  00000-0 0  9999`;

    // Line 2: Satellite number, inclination, RAAN, eccentricity, argument of perigee, mean anomaly, mean motion, revolution number
    const line2 = `2 ${satNum.toString().padStart(5, "0")} ${i_deg.toFixed(8).padStart(8, "0")} ${omega_deg.toFixed(8).padStart(8, "0")} ${(e * 10000000)
        .toFixed(0)
        .padStart(7, "0")} ${w_deg.toFixed(8).padStart(8, "0")} ${M_deg.toFixed(8).padStart(8, "0")} ${n_deg.toFixed(8).padStart(11, "0")} 00000`;

    return { name, line1, line2 };
}

// Batch update satellite positions using satellite.js
function updateSatelliteJSPositionsBatch() {
    if (!useSatelliteJS || satRecs.length === 0) return;

    // Batch process all satellites at once
    for (let i = 0; i < satN; i++) {
        if (!satelliteData[i] || !satRecs[i]) continue;

        try {
            const tle = satRecs[i];
            const positionAndVelocity = satellite.propagate(tle, simulationTime);

            if (positionAndVelocity && positionAndVelocity.position && positionAndVelocity.velocity) {
                const position = positionAndVelocity.position;
                const velocity = positionAndVelocity.velocity;

                // Convert from ECI to our coordinate system (Earth radii)
                const x = position.x / 6371; // Convert km to Earth radii
                const y = position.y / 6371;
                const z = position.z / 6371;
                const vx = velocity.x / 6371;
                const vy = velocity.y / 6371;
                const vz = velocity.z / 6371;

                // Update state directly
                allSatState[i] = [x, y, z, vx, vy, vz];
            }
        } catch (error) {
            // Fallback to custom propagation if satellite.js fails
            prop(0.016 * timeMultiplier, allSatState[i]);
        }
    }
}

// Batch update satellite positions using K2 propagator
function updateK2PositionsBatch() {
    if (!useK2Propagator) return;

    // Batch process all satellites at once
    for (let i = 0; i < satN; i++) {
        if (!allSatState[i]) continue;
        // Use K2 propagation
        prop(0.016 * timeMultiplier, allSatState[i]);
    }
}

// Batch update satellite positions using RK2 propagation
function updateSatellitePositionsBatch() {
    if (useSatelliteJS) return; // Skip if using satellite.js

    // Batch process all satellites at once
    for (let i = 0; i < satN; i++) {
        if (!allSatState[i]) continue;
        // Use RK2 propagation
        prop(0.016 * timeMultiplier, allSatState[i]);
    }
}

// RK2 propagation function
function prop(dt: number, state: number[]) {
    const halfDT = dt * 0.5;

    const k1 = [state[0], state[1], state[2]];
    const mag1 = -MU_EARTH / Math.pow(k1[0] * k1[0] + k1[1] * k1[1] + k1[2] * k1[2], 1.5);
    k1[0] *= mag1;
    k1[1] *= mag1;
    k1[2] *= mag1;

    const k2 = [state[0] + dt * k1[0], state[1] + dt * k1[1], state[2] + dt * k1[2]];
    const mag2 = -MU_EARTH / Math.pow(k2[0] * k2[0] + k2[1] * k2[1] + k2[2] * k2[2], 1.5);
    k2[0] *= mag2;
    k2[1] *= mag2;
    k2[2] *= mag2;

    state[3] += halfDT * (k1[0] + k2[0]);
    state[4] += halfDT * (k1[1] + k2[1]);
    state[5] += halfDT * (k1[2] + k2[2]);

    state[0] += dt * state[3];
    state[1] += dt * state[4];
    state[2] += dt * state[5];
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    stats.begin();
    const dt = clock.getDelta();

    // Rotate Earth slowly
    if (earth) {
        earth.rotation.y += dt * 0.1;
    }

    // Update simulation time for satellite.js
    if (useSatelliteJS) {
        simulationTime = new Date(simulationTime.getTime() + dt * 1000 * timeMultiplier);
    }

    // Update satellite positions in batch
    if (useSatelliteJS) {
        updateSatelliteJSPositionsBatch();
    } else if (useK2Propagator) {
        updateK2PositionsBatch();
    } else {
        updateSatellitePositionsBatch();
    }

    // Update SatPoints data efficiently (like EntityManager)
    updateSatPointsData();

    controls.update();
    renderer.render(scene, camera);

    stats.end();
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Setup Stats.js
function setupStats() {
    stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);

    // Style the stats panel
    stats.dom.style.position = "absolute";
    stats.dom.style.top = "0px";
    stats.dom.style.left = "0px";
    stats.dom.style.zIndex = "1000";
}

// Setup lighting
function setupLighting() {
    // Ambient light for overall illumination
    ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    // Directional light (sun)
    light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 5, 5);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50;
    scene.add(light);
}

// Create Earth globe
function createEarth() {
    const geometry = new THREE.SphereGeometry(1, 64, 64);

    // Create a simple Earth-like material
    const material = new THREE.MeshPhongMaterial({
        color: 0x4a90e2,
        shininess: 30,
        specular: 0x222222,
    });

    earth = new THREE.Mesh(geometry, material);
    earth.receiveShadow = true;
    earth.castShadow = true;
    scene.add(earth);
}

// Create UI elements
function createUI() {
    // Create satellite counter
    const counterDiv = document.createElement("div");
    counterDiv.id = "satellite-counter";
    counterDiv.style.cssText = `
    position: absolute;
    top: 20px;
    left: 100px;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 18px;
    background: rgba(0, 0, 0, 0.7);
    padding: 10px 15px;
    border-radius: 5px;
    z-index: 1000;
  `;
    counterDiv.innerHTML = 'Satellites: <span id="sat-count">0</span>';
    document.body.appendChild(counterDiv);

    // Create controls panel
    const controlsDiv = document.createElement("div");
    controlsDiv.id = "controls-panel";
    controlsDiv.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    color: white;
    font-family: Arial, sans-serif;
    background: rgba(0, 0, 0, 0.7);
    padding: 15px;
    border-radius: 5px;
    z-index: 1000;
  `;
    controlsDiv.innerHTML = `
    <div style="margin-bottom: 10px;">
      <label for="satellite-count">Add Satellites:</label><br>
      <input type="number" id="satellite-count" value="100" min="1" max="10000" style="width: 100px; margin: 5px 0;">
      <button id="add-satellites" style="margin-left: 10px; padding: 5px 10px;">Add</button>
    </div>
    <div style="margin-bottom: 10px;">
      <label for="propagation-method">Propagation Method:</label><br>
      <select id="propagation-method" style="width: 120px; margin: 5px 0;">
        <option value="custom">Custom RK2</option>
        <option value="satellitejs">Satellite.js</option>
        <option value="k2">K2 Propagator</option>
      </select>
    </div>
    <div style="margin-bottom: 10px;">
      <label>TLE Loading (Satellite.js only):</label><br>
      <button id="load-100-tles" style="padding: 3px 8px; margin: 2px; font-size: 12px;">100 TLEs</button>
      <button id="load-1000-tles" style="padding: 3px 8px; margin: 2px; font-size: 12px;">1000 TLEs</button>
      <button id="load-all-tles" style="padding: 3px 8px; margin: 2px; font-size: 12px;">All TLEs</button>
    </div>
    <div style="margin-bottom: 10px;">
      <label>External Data Sources:</label><br>
      <button id="load-turion-api" style="padding: 5px 10px; margin: 2px; background: #4CAF50; color: white;">Load from Turion API</button>
    </div>
    <div style="margin-bottom: 10px;">
      <label for="time-multiplier">Time Speed:</label><br>
      <input type="range" id="time-multiplier" min="1" max="1000" value="100" style="width: 120px; margin: 5px 0;">
      <span id="time-multiplier-value">100x</span>
      <button id="reset-time" style="padding: 3px 8px; margin: 2px; font-size: 12px;">Reset Time</button>
    </div>
    <div>
      <button id="clear-satellites" style="padding: 5px 10px; background: #ff4444;">Clear All</button>
    </div>
  `;
    document.body.appendChild(controlsDiv);

    // Add event listeners
    document.getElementById("add-satellites")?.addEventListener("click", addSatellites);
    document.getElementById("clear-satellites")?.addEventListener("click", clearSatellites);
    document.getElementById("propagation-method")?.addEventListener("change", onPropagationMethodChange);
    document.getElementById("load-100-tles")?.addEventListener("click", () => loadTLEs(100));
    document.getElementById("load-1000-tles")?.addEventListener("click", () => loadTLEs(10000));
    document.getElementById("load-all-tles")?.addEventListener("click", () => loadTLEs(0));
    document.getElementById("load-turion-api")?.addEventListener("click", loadFromTurionAPI);
    document.getElementById("time-multiplier")?.addEventListener("input", onTimeMultiplierChange);
    document.getElementById("reset-time")?.addEventListener("click", resetSimulationTime);
}

// Add satellites dynamically - OPTIMIZED VERSION
async function addSatellites() {
    const countInput = document.getElementById("satellite-count") as HTMLInputElement;
    const count = parseInt(countInput.value) || 100;

    // Show loading indicator
    const addButton = document.getElementById("add-satellites") as HTMLButtonElement;
    const originalText = addButton.textContent;
    addButton.textContent = "Loading...";
    addButton.disabled = true;

    try {
        console.log(`Starting batch add of ${count} satellites...`);
        const startTime = performance.now();

        const newSatellites = generateMockSatellites(count);

        // Batch extend arrays (much faster than individual pushes)
        const newStates = newSatellites.map((sat) => sat.state);
        const newColors = newSatellites.map(() => [0.458431, 0.0, 0.025]);
        const newColorsOut = newSatellites.map(() => [1.0, 0.573, 0.282]);
        const newPeriods = newSatellites.map((sat) => sat.period);
        const newNames = newSatellites.map((sat) => sat.name);

        allSatState.push(...newStates);
        allSatColorIn.push(...newColors);
        allSatColorOut.push(...newColorsOut);
        allSatPeriods.push(...newPeriods);
        satNames.push(...newNames);
        satN = allSatState.length;

        // Store satellite data for satellite.js (batch process)
        if (useSatelliteJS) {
            const newSatelliteData = newSatellites.map((sat) => ({
                name: sat.name,
                tle: (sat as any).tle,
                state: sat.state,
                period: sat.period,
            }));
            satelliteData.push(...newSatelliteData);

            // Batch parse TLEs (much faster than individual parsing)
            const newSatRecs = newSatellites.map((sat) => satellite.twoline2satrec((sat as any).tle.line1, (sat as any).tle.line2));
            satRecs.push(...newSatRecs);
        }

        // Update SatPoints data efficiently (no recreation!)
        updateSatPointsData();

        // Update counter
        updateSatelliteCounter();

        const endTime = performance.now();
        console.log(`Batch add complete: ${count} satellites added in ${(endTime - startTime).toFixed(2)}ms`);
    } catch (error) {
        console.error("Error adding satellites:", error);
        alert("Error loading satellites. Please try again.");
    } finally {
        // Restore button state
        addButton.textContent = originalText;
        addButton.disabled = false;
    }
}

// Clear all satellites - OPTIMIZED VERSION
function clearSatellites() {
    allSatState = [];
    allSatColorIn = [];
    allSatColorOut = [];
    allSatPeriods = [];
    satNames = [];
    satN = 0;
    satelliteData = [];
    satRecs = [];

    // Reset simulation time
    simulationTime = new Date();

    // Just update the existing SatPoints (no recreation!)
    updateSatPointsData();
    updateSatelliteCounter();
}

// Handle propagation method change
function onPropagationMethodChange() {
    const select = document.getElementById("propagation-method") as HTMLSelectElement;
    useSatelliteJS = select.value === "satellitejs";
    useK2Propagator = select.value === "k2";

    // Reset simulation time when switching methods
    simulationTime = new Date();

    // Clear existing satellites when switching methods
    if (satN > 0) {
        clearSatellites();
    }
}

// Handle time multiplier change
function onTimeMultiplierChange() {
    const slider = document.getElementById("time-multiplier") as HTMLInputElement;
    const valueSpan = document.getElementById("time-multiplier-value") as HTMLSpanElement;
    timeMultiplier = parseInt(slider.value);
    valueSpan.textContent = `${timeMultiplier}x`;
}

// Reset simulation time
function resetSimulationTime() {
    simulationTime = new Date();
    console.log("Simulation time reset to current time");
}

// Load satellites from Turion Space API
async function loadFromTurionAPI() {
    const button = document.getElementById("load-turion-api") as HTMLButtonElement;
    const originalText = button.textContent;

    // Show loading state
    button.textContent = "Loading...";
    button.disabled = true;

    try {
        console.log("Starting to fetch from Turion Space API...");

        let allTLEData: Array<{ tle_line1: string; tle_line2: string }> = [];
        let page = 1;
        const perPage = 10000;
        let hasMore = true;

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

        // Save TLE data to gp.txt file (download for manual replacement)
        try {
            // Create a blob with the TLE content
            const blob = new Blob([tleContent], { type: "text/plain" });
            const url = URL.createObjectURL(blob);

            // Create a temporary download link to save the file
            const a = document.createElement("a");
            a.href = url;
            a.download = "gp.txt";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log("TLE data downloaded as gp.txt");
            console.log("Copy the downloaded file to public/gp.txt to update the application");

            // Show user instruction
            setTimeout(() => {
                alert(
                    `TLE data downloaded as gp.txt\n\nTo update the application:\n1. Copy the downloaded file to public/gp.txt\n2. Refresh the page to load the new data\n\nAlternatively, you can copy the TLE data from the console and paste it into public/gp.txt`
                );
            }, 1000);

            // Also log the TLE content to console for easy copying
            console.log("=== TLE DATA (copy this to public/gp.txt) ===");
            console.log(tleContent);
            console.log("=== END TLE DATA ===");
        } catch (error) {
            console.warn("Failed to save TLE data to file:", error);
        }

        // Clear existing satellites first
        clearSatellites();

        // Parse TLEs and create satellites - BATCH PROCESSING
        const tles = parseTLEFile(tleContent);
        const satellites = [];
        const satRecsBatch = [];

        console.log(`Processing ${tles.length} TLEs in batch...`);
        const parseStartTime = performance.now();

        // Batch process TLEs
        for (let i = 0; i < tles.length; i++) {
            try {
                const tle = tles[i];

                // Parse TLE with satellite.js
                const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
                satRecsBatch.push(satrec);

                // Get current position
                const now = new Date();
                const positionAndVelocity = satellite.propagate(satrec, now);

                if (positionAndVelocity && positionAndVelocity.position && positionAndVelocity.velocity) {
                    const position = positionAndVelocity.position;
                    const velocity = positionAndVelocity.velocity;

                    // Convert from ECI to our coordinate system (Earth radii)
                    const x = position.x / 6371;
                    const y = position.y / 6371;
                    const z = position.z / 6371;
                    const vx = velocity.x / 6371;
                    const vy = velocity.y / 6371;
                    const vz = velocity.z / 6371;

                    // Calculate orbital period
                    const semiMajorAxis = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
                    const period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / 398600.4418);

                    satellites.push({
                        name: tle.name,
                        tle: tle,
                        state: [x, y, z, vx, vy, vz],
                        period: period,
                    });
                }
            } catch (error) {
                console.warn(`Failed to process TLE ${i}:`, error);
            }
        }

        const parseEndTime = performance.now();
        console.log(`TLE parsing completed in ${(parseEndTime - parseStartTime).toFixed(2)}ms`);

        // Add satellites to scene - BATCH OPERATIONS
        allSatState.push(...satellites.map((sat) => sat.state));
        allSatColorIn.push(...satellites.map(() => [0.458431, 0.0, 0.025]));
        allSatColorOut.push(...satellites.map(() => [1.0, 0.573, 0.282]));
        allSatPeriods.push(...satellites.map((sat) => sat.period));
        satNames.push(...satellites.map((sat) => sat.name));
        satN = allSatState.length;

        // Store satellite data for satellite.js
        satelliteData.push(
            ...satellites.map((sat) => ({
                name: sat.name,
                tle: sat.tle,
                state: sat.state,
                period: sat.period,
            }))
        );

        // Store satRecs for satellite.js
        satRecs.push(...satRecsBatch);

        // Update SatPoints efficiently (no recreation!)
        updateSatPointsData();
        updateSatelliteCounter();

        console.log(`Successfully loaded ${satellites.length} satellites from Turion Space API`);
        alert(`Successfully loaded ${satellites.length} satellites from Turion Space API`);
    } catch (error) {
        console.error("Failed to load from Turion Space API:", error);
        alert(`Failed to load from Turion Space API: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
        // Restore button state
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Load TLEs directly (for satellite.js method)
async function loadTLEs(count: number) {
    // Show loading indicator
    const buttons = document.querySelectorAll("#load-100-tles, #load-1000-tles, #load-all-tles") as NodeListOf<HTMLButtonElement>;
    buttons.forEach((btn) => {
        btn.disabled = true;
        btn.textContent = "Loading...";
    });

    try {
        // Clear existing satellites
        clearSatellites();

        // Load TLE data
        const tles = await loadTLEFile(count);
        const satellites = [];

        for (let i = 0; i < tles.length; i++) {
            try {
                const tle = tles[i];

                // Parse TLE with satellite.js
                const satrec = satellite.twoline2satrec(tle.line1, tle.line2);

                // Get current position
                const now = new Date();
                const positionAndVelocity = satellite.propagate(satrec, now);

                if (positionAndVelocity && positionAndVelocity.position && positionAndVelocity.velocity) {
                    const position = positionAndVelocity.position;
                    const velocity = positionAndVelocity.velocity;

                    // Convert from ECI to our coordinate system (Earth radii)
                    const x = position.x / 6371;
                    const y = position.y / 6371;
                    const z = position.z / 6371;
                    const vx = velocity.x / 6371;
                    const vy = velocity.y / 6371;
                    const vz = velocity.z / 6371;

                    // Calculate orbital period
                    const semiMajorAxis = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
                    const period = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / 398600.4418);

                    satellites.push({
                        name: tle.name,
                        tle: tle,
                        state: [x, y, z, vx, vy, vz],
                        period: period,
                    });
                    satRecs.push(...satellites.map((sat) => satellite.twoline2satrec(sat.tle.line1, sat.tle.line2)));
                }
            } catch (error) {
                console.warn(`Failed to process TLE ${i}:`, error);
            }
        }

        // Add satellites to scene - BATCH OPERATIONS
        allSatState.push(...satellites.map((sat) => sat.state));
        allSatColorIn.push(...satellites.map(() => [0.458431, 0.0, 0.025]));
        allSatColorOut.push(...satellites.map(() => [1.0, 0.573, 0.282]));
        allSatPeriods.push(...satellites.map((sat) => sat.period));
        satNames.push(...satellites.map((sat) => sat.name));
        satN = allSatState.length;

        // Store satellite data for satellite.js
        satelliteData.push(
            ...satellites.map((sat) => ({
                name: sat.name,
                tle: sat.tle,
                state: sat.state,
                period: sat.period,
            }))
        );

        // Update SatPoints efficiently (no recreation!)
        updateSatPointsData();
        updateSatelliteCounter();

        console.log(`Loaded ${satellites.length} satellites from TLE data`);
    } catch (error) {
        console.error("Error loading TLEs:", error);
        alert("Error loading TLE data. Please try again.");
    } finally {
        // Restore button state
        buttons.forEach((btn) => {
            btn.disabled = false;
            btn.textContent = btn.id === "load-100-tles" ? "100 TLEs" : btn.id === "load-1000-tles" ? "1000 TLEs" : "All TLEs";
        });
    }
}

// REMOVED: recreateSatellitePoints() - No longer needed!
// SatPoints is now created once with maximum capacity and reused

// Optimized function to update SatPoints data (like EntityManager)
function updateSatPointsData() {
    if (!points || !isInitialized) return;

    // DIRECT buffer manipulation - no method calls!
    const satArray = points.satArray;
    const satColor = points.satColor;
    const visibilityArray = points.visibilityArray;
    const sizeArray = points.sizeArray;

    // Update active satellites - DIRECT array access
    for (let j = 0; j < satN; j++) {
        const pos = allSatState[j];
        const clr = allSatColorIn[j];

        // Direct array access - maximum performance
        const j3 = j * 3;
        satArray[j3] = pos[0];
        satArray[j3 + 1] = pos[1];
        satArray[j3 + 2] = pos[2];

        satColor[j3] = clr[0];
        satColor[j3 + 1] = clr[1];
        satColor[j3 + 2] = clr[2];

        visibilityArray[j] = 1;
        sizeArray[j] = 1;
    }

    // Hide unused satellites - batch operation
    for (let j = satN; j < maxSatellites; j++) {
        const j3 = j * 3;
        satArray[j3] = 10000;
        satArray[j3 + 1] = 10000;
        satArray[j3 + 2] = 10000;
        satColor[j3] = 0;
        satColor[j3 + 1] = 0;
        satColor[j3 + 2] = 0;
        visibilityArray[j] = 0;
    }

    // Use update ranges for efficiency - only update what changed
    const updateCount = Math.max(satN, lastSatelliteCount);
    if (updateCount > 0) {
        points.satPositionAttribute.updateRanges = [
            {
                start: 0,
                count: updateCount * 3, // 3 components per position
            },
        ];
        points.satColorAttribute.updateRanges = [
            {
                start: 0,
                count: updateCount * 3, // 3 components per color
            },
        ];
        // Only update visibility when count changes
        if (satN !== lastSatelliteCount) {
            points.satVisibilityAttribute.updateRanges = [
                {
                    start: 0,
                    count: updateCount,
                },
            ];
        }
    }

    // Update last satellite count for next frame
    lastSatelliteCount = satN;

    // Mark attributes for update - batch operation
    points.satPositionAttribute.needsUpdate = true;
    points.satColorAttribute.needsUpdate = true;
    // Only update visibility when count changes
    if (satN !== lastSatelliteCount) {
        points.satVisibilityAttribute.needsUpdate = true;
    }
}

// Update satellite counter
function updateSatelliteCounter() {
    const counter = document.getElementById("sat-count");
    if (counter) {
        counter.textContent = satN.toString();
    }
}

// Start the application
init().catch(console.error);
