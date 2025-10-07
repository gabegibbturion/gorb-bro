import Stats from "stats.js";
import SunCalc from "suncalc";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EnhancedGlobe } from "./EnhancedGlobe";
import { EntityManager, type RenderingSystem } from "./EntityManager";
import type { OrbitalElements } from "./OrbitalElements";
import { SatelliteEntity } from "./SatelliteEntity";
import { TLEParser } from "./TLEParser";
import { OrbitManager, type OrbitRenderingSystem } from "./OrbitManager";
import { TileGlobe } from "./TileGlobe";
import { TileProvider } from "./TileProvider";
import { gstime } from "satellite.js";

export const GlobeType = {
    BASIC: "basic",
    ENHANCED: "enhanced",
    TILE_PROVIDED: "tile_provided",
} as const;

export type GlobeType = (typeof GlobeType)[keyof typeof GlobeType];

export interface GlobeEngineOptions {
    container: HTMLElement;
    width?: number;
    height?: number;
    enableControls?: boolean;
    enableStats?: boolean;
    autoRotate?: boolean;
    rotationSpeed?: number;
    maxSatellites?: number;
    renderingSystem?: RenderingSystem; // Single parameter to control rendering system
    globeType?: GlobeType; // Use enum for globe type selection
    orbitRenderingSystem?: OrbitRenderingSystem; // Orbit rendering system
    maxOrbits?: number; // Maximum number of orbits to render
    tileProvider?: TileProvider; // Tile provider for tile globe
    customTileUrl?: string; // Custom tile URL template for CUSTOM provider
}

export class GlobeEngine {
    private container: HTMLElement;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private entityManager!: EntityManager;
    private orbitManager!: OrbitManager;
    private globe!: THREE.Mesh;
    private enhancedGlobe: EnhancedGlobe | null = null;
    private tileGlobe: TileGlobe | null = null;
    private controls!: OrbitControls;
    private sunLight!: THREE.DirectionalLight;
    private sun!: THREE.Mesh;
    private stats!: Stats;
    private animationId: number | null = null;
    private isRunning: boolean = false;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private selectedEntity: SatelliteEntity | null = null;
    private enableGlobeRotation: boolean = true;
    private enableCameraRotation: boolean = true;
    private initialCameraPosition: THREE.Vector3 = new THREE.Vector3();
    private cameraRotationOffset: number = 0;

    private options: Required<GlobeEngineOptions>;
    private clock: THREE.Clock;
    private timeMultiplier: number = 1.0;
    private currentTime: Date = new Date();
    private latitude: number = 37.7749; // Default to San Francisco
    private longitude: number = -122.4194;

    // Event callbacks
    private onEngineReady?: () => void;
    private onTimeUpdate?: (time: Date) => void;
    private onSatelliteUpdate?: (satellites: SatelliteEntity[]) => void;
    private onEntitySelected?: (entity: SatelliteEntity | null) => void;

    constructor(options: GlobeEngineOptions) {
        this.container = options.container;
        this.options = {
            width: options.container.clientWidth,
            height: options.container.clientHeight,
            enableControls: true,
            enableStats: false,
            autoRotate: false,
            rotationSpeed: 0.001,
            maxSatellites: 50,
            renderingSystem: "instanced", // Default to instanced mesh
            globeType: GlobeType.BASIC, // Default to basic globe
            orbitRenderingSystem: "line", // Default to line-based orbits
            maxOrbits: 1000000, // Default max orbits
            tileProvider: TileProvider.ESRI, // Default to Esri World Imagery
            customTileUrl: "", // Default empty custom URL
            ...options,
        };

        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.init();
    }

    private init(): void {
        // Disable Three.js shader errors globally for better performance
        THREE.WebGLRenderer.prototype.debug = {
            checkShaderErrors: false,
            onShaderError: () => {},
        };

        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.createGlobe();
        this.createLights();
        this.createEntityManager();
        this.createOrbitManager();
        this.createControls();
        this.setupEventListeners();

        if (this.onEngineReady) {
            this.onEngineReady();
        }
    }

    private createScene(): void {
        this.scene = new THREE.Scene();
        // this.createSkybox();
    }

    private createCamera(): void {
        const aspect = this.options.width / this.options.height;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
        this.camera.position.set(0, 0, 5);
        this.initialCameraPosition.copy(this.camera.position);
    }

    private createRenderer(): void {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: "high-performance",
        });
        this.renderer.setSize(this.options.width, this.options.height);
        // this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Disable shader errors and warnings for better performance
        // this.renderer.debug = {
        //   checkShaderErrors: false,
        //   onShaderError: () => { },
        // };

        this.container.appendChild(this.renderer.domElement);
    }

    private createGlobe(): void {
        if (this.options.globeType === GlobeType.ENHANCED) {
            // Use enhanced globe with high-quality rendering
            this.enhancedGlobe = new EnhancedGlobe({
                radius: 1.0,
                enableClouds: true,
                enableAtmosphere: true,
                enableNightLights: true,
                enableCloudShadows: true,
                speedFactor: 2.0,
            });

            // Initialize asynchronously (textures will load in background)
            this.enhancedGlobe
                .init()
                .then(() => {
                    console.log("Enhanced globe initialized successfully");
                })
                .catch((error) => {
                    console.error("Failed to initialize enhanced globe:", error);
                });

            // Add the globe group to the scene
            const globeGroup = this.enhancedGlobe.getGroup();
            this.scene.add(globeGroup);

            // Get the earth mesh for compatibility with existing code
            this.globe = this.enhancedGlobe.getEarth();
        } else if (this.options.globeType === GlobeType.TILE_PROVIDED) {
            // Use tile-based globe
            this.tileGlobe = new TileGlobe({
                radius: 1.0,
                segments: 64,
                tileProvider: this.options.tileProvider,
                customTileUrl: this.options.customTileUrl,
                enableBumpMap: true,
                bumpScale: 0.02,
                roughness: 0.7,
                metalness: 0.1,
            });

            // Add the tile globe to the scene
            const tileGlobeGroup = this.tileGlobe.getGroup();
            this.scene.add(tileGlobeGroup);

            // Set camera for tile globe
            this.tileGlobe.setCamera(this.camera);

            // Get the mesh for compatibility with existing code
            this.globe = this.tileGlobe.getMesh();
        } else {
            // Use basic globe with day/night texture support
            const geometry = new THREE.SphereGeometry(1, 64, 64);

            // Create material with Earth texture (not tile provider)
            const material = new THREE.MeshStandardMaterial({
                map: this.createEarthTexture(),
                bumpMap: this.createBumpTexture(),
                bumpScale: 0.02,
                roughness: 0.8,
                metalness: 0.05,
                side: THREE.FrontSide,
            });

            // Apply day/night shader modifications to basic globe
            this.modifyBasicGlobeShader(material);

            this.globe = new THREE.Mesh(geometry, material);
            this.globe.receiveShadow = true;
            this.globe.castShadow = true;
            this.scene.add(this.globe);
        }
    }

    public setGlobeRotation(enabled: boolean): void {
        this.enableGlobeRotation = enabled;
    }

    public getGlobeRotation(): boolean {
        return this.enableGlobeRotation;
    }

    public setCameraRotation(enabled: boolean): void {
        this.enableCameraRotation = enabled;
    }

    public getCameraRotation(): boolean {
        return this.enableCameraRotation;
    }

    public toggleCameraRotation(): void {
        this.enableCameraRotation = !this.enableCameraRotation;
    }

    private calculateEarthRotation(): number {
        const gmst = gstime(this.currentTime);

        // GMST is in radians
        const longitudeRadians = (this.longitude * Math.PI) / 180;
        const rotationAngle = gmst + longitudeRadians;

        return rotationAngle;
    }

    private createEarthTexture(): THREE.Texture {
        const loader = new THREE.TextureLoader();
        const texture = loader.load("/assets/earth_day.jpg");
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    private createBumpTexture(): THREE.Texture {
        const loader = new THREE.TextureLoader();
        const texture = loader.load("/assets/Bump.jpg");
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // private createSkybox(): void {
    //     // Create a large sphere for the skybox
    //     const skyboxGeometry = new THREE.SphereGeometry(500, 32, 32);

    //     // Load the skybox texture
    //     const loader = new THREE.TextureLoader();
    //     const skyboxTexture = loader.load('/src/assets/skybox.jpeg');

    //     // Create material for the skybox
    //     const skyboxMaterial = new THREE.MeshBasicMaterial({
    //         map: skyboxTexture,
    //         side: THREE.BackSide // Render the inside of the sphere
    //     });

    //     // Create the skybox mesh
    //     const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
    //     this.scene.add(skybox);
    // }

    private createLights(): void {
        // Ambient light for overall illumination - reduced intensity
        const ambientLight = new THREE.AmbientLight(0x404040, 15);
        this.scene.add(ambientLight);

        // Directional light (sun) - reduced intensity for better balance
        this.sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 50;
        this.sunLight.shadow.bias = -0.0001;
        this.scene.add(this.sunLight);

        // Set the sun light for the enhanced globe
        if (this.enhancedGlobe) {
            this.enhancedGlobe.setDirectionalLight(this.sunLight);
        }

        // Create sun object
        this.createSun();

        // Initialize sun position
        this.updateSunPosition();
    }

    private createSun(): void {
        // Create sun geometry - larger sphere for better visibility
        const sunGeometry = new THREE.SphereGeometry(0.2, 16, 16);

        // Create sun material with bright yellow/white color
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
        });

        // Create sun mesh
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);

        // Add sun to scene
        this.scene.add(this.sun);
    }

    private createEntityManager(): void {
        this.entityManager = new EntityManager(this.scene, {
            maxSatellites: this.options.maxSatellites,
            autoCleanup: true,
            updateInterval: 16, // Update every frame (60fps)
            renderingSystem: this.options.renderingSystem,
        });

        // Set up entity manager callbacks
        this.entityManager.onUpdateCallback((satellites) => {
            if (this.onSatelliteUpdate) {
                this.onSatelliteUpdate(satellites);
            }
        });
    }

    private createOrbitManager(): void {
        this.orbitManager = new OrbitManager(this.scene, {
            renderingSystem: this.options.orbitRenderingSystem,
            maxOrbits: this.options.maxOrbits,
            enableLOD: true,
            enableFrustumCulling: true,
            baseSegments: 64,
            baseLineWidth: 1.0,
        });

        // Set camera for orbit manager
        this.orbitManager.setCamera(this.camera);
    }

    private createControls(): void {
        if (!this.options.enableControls) return;

        // Create OrbitControls for camera rotation around the globe
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0, 0); // Target the center of the globe
        this.controls.enableDamping = false;
        // this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = false; // Disable panning to keep camera orbiting around globe
        this.controls.minDistance = 1;
        this.controls.maxDistance = 30;
    }

    private setupEventListeners(): void {
        window.addEventListener("resize", () => this.onWindowResize());
        this.renderer.domElement.addEventListener("click", (event) => this.onMouseClick(event));
    }

    private onWindowResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    private onMouseClick(event: MouseEvent): void {
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Get all satellites for manual raycasting
        const satellites = this.entityManager.getAllSatellites();
        if (satellites.length === 0) {
            this.selectEntity(null);
            return;
        }

        // Manual raycasting for instanced geometry
        let closestSatellite: SatelliteEntity | null = null;
        let closestDistance = Infinity;
        const selectionThreshold = 0.05; // Adjust based on satellite size

        satellites.forEach((satellite) => {
            const satellitePosition = satellite.getPosition();

            // Calculate distance from ray to satellite position
            const rayOrigin = this.raycaster.ray.origin;
            const rayDirection = this.raycaster.ray.direction;

            // Vector from ray origin to satellite
            const toSatellite = satellitePosition.clone().sub(rayOrigin);

            // Project toSatellite onto ray direction
            const projectionLength = toSatellite.dot(rayDirection);

            // Closest point on ray to satellite
            const closestPointOnRay = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(projectionLength));

            // Distance from satellite to closest point on ray
            const distanceToRay = satellitePosition.distanceTo(closestPointOnRay);

            // Only consider satellites in front of the camera
            if (projectionLength > 0 && distanceToRay < selectionThreshold) {
                if (distanceToRay < closestDistance) {
                    closestDistance = distanceToRay;
                    closestSatellite = satellite;
                }
            }
        });

        if (closestSatellite) {
            this.selectEntity(closestSatellite);
        } else {
            this.selectEntity(null);
        }
    }

    private selectEntity(entity: SatelliteEntity | null): void {
        // Clear previous selection visual feedback
        if (this.selectedEntity) {
            this.selectedEntity.setSelected(false);
        }

        this.selectedEntity = entity;

        // Add visual feedback for new selection
        if (this.selectedEntity) {
            this.selectedEntity.setSelected(true);
        }

        // Notify callback
        if (this.onEntitySelected) {
            this.onEntitySelected(this.selectedEntity);
        }
    }

    public start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.animate();
    }

    public stop(): void {
        this.isRunning = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    private animate(): void {
        if (!this.isRunning) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        if (this.stats) {
            this.stats.begin();
        }

        const deltaTime = this.clock.getDelta();

        if (this.controls) {
            this.controls.update();
        }

        // Update time
        this.currentTime = new Date(this.currentTime.getTime() + deltaTime * this.timeMultiplier * 1000);
        this.entityManager.setTime(this.currentTime);

        // Rotate the globe based on actual Earth rotation
        if (this.enableGlobeRotation) {
            const rotationAngle = this.calculateEarthRotation();

            if (this.enhancedGlobe) {
                this.enhancedGlobe.getGroup().rotation.y = rotationAngle;
            } else if (this.tileGlobe) {
                this.tileGlobe.getGroup().rotation.y = rotationAngle;
            } else if (this.globe) {
                this.globe.rotation.y = rotationAngle;
            }
        }

        // Rotate the camera to match Earth rotation for stable shadows
        if (this.enableCameraRotation) {
            const rotationAngle = this.calculateEarthRotation();

            // Calculate the rotation delta since last frame
            const rotationDelta = rotationAngle - this.cameraRotationOffset;
            this.cameraRotationOffset = rotationAngle;

            // Apply rotation to camera position around Y-axis
            const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationDelta);
            this.camera.position.applyMatrix4(rotationMatrix);
        }

        if (this.enhancedGlobe) {
            this.enhancedGlobe.update(deltaTime * this.timeMultiplier * 1000);
        }

        if (this.tileGlobe) {
            this.tileGlobe.update(deltaTime * this.timeMultiplier * 1000);
        }

        // Update orbit manager
        this.orbitManager.update();

        this.updateSunPosition();

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime);
        }

        this.renderer.render(this.scene, this.camera);

        if (this.stats) {
            this.stats.end();
        }
    }

    private updateSunPosition(): void {
        if (!this.sunLight) return;

        const sunPosition = SunCalc.getPosition(this.currentTime, this.latitude, this.longitude);

        const distance = 10;

        // Sun position remains in world space (doesn't rotate with Earth)
        const z = distance * Math.cos(sunPosition.altitude) * Math.sin(sunPosition.azimuth);
        const x = distance * Math.sin(sunPosition.altitude);
        const y = distance * Math.cos(sunPosition.altitude) * Math.cos(sunPosition.azimuth);

        this.sunLight.position.set(x, y, z);
        this.sunLight.target.position.set(0, 0, 0);

        if (this.sun) {
            this.sun.position.set(x, y, z);
        }

        const intensity = 10;
        this.sunLight.intensity = intensity;
    }

    // Public API
    public addSatellite(orbitalElements: OrbitalElements, options?: any): SatelliteEntity | null {
        return this.entityManager.addSatellite(orbitalElements, options);
    }

    public setPropagatorType(propagatorType: "satellitejs" | "k2"): void {
        this.entityManager.setPropagatorType(propagatorType);
    }

    public getPropagatorType(): "satellitejs" | "k2" {
        return this.entityManager.getPropagatorType();
    }

    public addRandomSatellite(name?: string): SatelliteEntity | null {
        return this.entityManager.addRandomSatellite(name);
    }

    public addValidSatellite(options?: any): SatelliteEntity | null {
        return this.entityManager.addValidSatellite(options);
    }

    public addRandomTLEFromCOE(name?: string, altitudeRange?: [number, number]): SatelliteEntity | null {
        return this.entityManager.addRandomTLEFromCOE(name, altitudeRange);
    }

    public addRandomTLEFromCOEBatch(count: number, namePrefix?: string, altitudeRange?: [number, number], colors?: number[]): SatelliteEntity[] {
        return this.entityManager.addRandomTLEFromCOEBatch(count, namePrefix, altitudeRange, colors);
    }

    public removeSatellite(id: string): boolean {
        return this.entityManager.removeSatellite(id);
    }

    public getSatellite(id: string): SatelliteEntity | undefined {
        return this.entityManager.getSatellite(id);
    }

    public getAllSatellites(): SatelliteEntity[] {
        return this.entityManager.getAllSatellites();
    }

    public setTime(time: Date): void {
        this.currentTime = time;
        this.entityManager.setTime(time);
    }

    public getCurrentTime(): Date {
        return this.entityManager.getCurrentTime();
    }

    public setTimeMultiplier(multiplier: number): void {
        this.timeMultiplier = multiplier;
    }

    public getTimeMultiplier(): number {
        return this.timeMultiplier;
    }

    public setAutoRotate(enabled: boolean): void {
        this.options.autoRotate = enabled;
    }

    public setRotationSpeed(speed: number): void {
        this.options.rotationSpeed = speed;
    }

    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    public getScene(): THREE.Scene {
        return this.scene;
    }

    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }

    public getGlobe(): THREE.Mesh {
        return this.globe;
    }

    public getEntityManager(): EntityManager {
        return this.entityManager;
    }

    public setRenderingSystem(system: RenderingSystem): void {
        this.entityManager.setRenderingSystem(system);
    }

    public getRenderingSystem(): RenderingSystem {
        return this.entityManager.getRenderingSystem();
    }

    public setSatPointsSize(size: number): void {
        this.entityManager.setSatPointsSize(size);
    }

    public getSatPointsSize(): number {
        return this.entityManager.getSatPointsSize();
    }

    public getSystemInfo(): {
        satelliteCount: number;
        maxSatellites: number;
        isOptimized: boolean;
        systemType: RenderingSystem;
    } {
        return this.entityManager.getSystemInfo();
    }

    public setLocation(latitude: number, longitude: number): void {
        this.latitude = latitude;
        this.longitude = longitude;
        this.updateSunPosition();
    }

    public getLocation(): { latitude: number; longitude: number } {
        return { latitude: this.latitude, longitude: this.longitude };
    }

    // Event handlers
    public onEngineReadyCallback(callback: () => void): void {
        this.onEngineReady = callback;
    }

    public onTimeUpdateCallback(callback: (time: Date) => void): void {
        this.onTimeUpdate = callback;
    }

    public onSatelliteUpdateCallback(callback: (satellites: SatelliteEntity[]) => void): void {
        this.onSatelliteUpdate = callback;
    }

    public onEntitySelectedCallback(callback: (entity: SatelliteEntity | null) => void): void {
        this.onEntitySelected = callback;
    }

    public getSelectedEntity(): SatelliteEntity | null {
        return this.selectedEntity;
    }

    public deselectEntity(): void {
        this.selectEntity(null);
    }

    public loadTLEFromFile(content: string, maxCount: number = 0): SatelliteEntity[] {
        const parsedTLEs = TLEParser.parseTLEFile(content, maxCount);

        console.log(`Parsed ${parsedTLEs.length} TLEs from file`);

        // Prepare batch data
        const satellitesData = parsedTLEs.map((parsedTLE) => ({
            orbitalElements: TLEParser.toTLEData(parsedTLE),
            options: {
                name: parsedTLE.name,
                color: this.getRandomColor(),
                size: 0.005 + Math.random() * 0.005,
                showTrail: false,
                trailLength: 50,
                trailColor: this.getRandomColor(),
            },
        }));

        // Use batch add for much better performance
        return this.entityManager.addSatellitesBatch(satellitesData);
    }

    public loadTLEFromURL(url: string, maxCount: number = 0): Promise<SatelliteEntity[]> {
        return fetch(url)
            .then((response) => response.text())
            .then((content) => this.loadTLEFromFile(content, maxCount))
            .catch((error) => {
                console.error("Failed to load TLE file:", error);
                return [];
            });
    }

    private getRandomColor(): number {
        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff, 0xff8800, 0x8800ff];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    public setOcclusionCulling(enabled: boolean): void {
        this.entityManager.setOcclusionCulling(enabled);
    }

    public getOcclusionCulling(): boolean {
        return this.entityManager.getOcclusionCulling();
    }

    public setGlobeVisible(visible: boolean): void {
        if (this.enhancedGlobe) {
            this.enhancedGlobe.setVisible(visible);
        } else if (this.tileGlobe) {
            this.tileGlobe.setVisible(visible);
        } else {
            this.globe.visible = visible;
        }
    }

    public getGlobeVisible(): boolean {
        if (this.enhancedGlobe) {
            return this.enhancedGlobe.getGroup().visible;
        } else if (this.tileGlobe) {
            return this.tileGlobe.getVisible();
        } else {
            return this.globe.visible;
        }
    }

    public toggleGlobeVisibility(): void {
        this.setGlobeVisible(!this.getGlobeVisible());
    }

    public setMeshUpdatesEnabled(enabled: boolean): void {
        this.entityManager.setMeshUpdatesEnabled(enabled);
    }

    public getMeshUpdatesEnabled(): boolean {
        return this.entityManager.getMeshUpdatesEnabled();
    }

    public forceUpdateMesh(): void {
        this.entityManager.forceUpdateMesh();
    }

    public dispose(): void {
        this.stop();
        this.entityManager.dispose();
        this.orbitManager.dispose();

        if (this.enhancedGlobe) {
            this.enhancedGlobe.dispose();
            this.enhancedGlobe = null;
        }

        if (this.tileGlobe) {
            this.tileGlobe.dispose();
            this.tileGlobe = null;
        }

        if (this.controls) {
            this.controls.dispose();
        }

        if (this.stats && this.container) {
            this.container.removeChild(this.stats.dom);
        }

        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.container && this.renderer) {
            this.container.removeChild(this.renderer.domElement);
        }
    }

    public getEnhancedGlobe(): EnhancedGlobe | null {
        return this.enhancedGlobe;
    }

    public getTileGlobe(): TileGlobe | null {
        return this.tileGlobe;
    }

    public forceLoadTiles(): void {
        if (this.tileGlobe) {
            this.tileGlobe.forceLoadTiles();
        }
    }

    public setSunVisible(visible: boolean): void {
        if (this.sun) {
            this.sun.visible = visible;
        }
    }

    public getSunVisible(): boolean {
        return this.sun ? this.sun.visible : false;
    }

    public toggleSunVisibility(): void {
        this.setSunVisible(!this.getSunVisible());
    }

    public getSun(): THREE.Mesh | null {
        return this.sun;
    }

    public setGlobeType(globeType: GlobeType): void {
        if (this.options.globeType === globeType) return;

        // Remove current globe
        if (this.enhancedGlobe) {
            this.scene.remove(this.enhancedGlobe.getGroup());
            this.enhancedGlobe.dispose();
            this.enhancedGlobe = null;
        } else if (this.tileGlobe) {
            this.scene.remove(this.tileGlobe.getGroup());
            this.tileGlobe.dispose();
            this.tileGlobe = null;
        } else if (this.globe) {
            this.scene.remove(this.globe);
        }

        // Update options
        this.options.globeType = globeType;

        // Create new globe
        this.createGlobe();
    }

    public getGlobeType(): GlobeType {
        return this.options.globeType;
    }

    private modifyBasicGlobeShader(_material: THREE.MeshStandardMaterial): void {
        // Temporarily disable shader modifications to fix compilation errors
        // TODO: Implement proper day/night shader switching
        console.log("Basic globe shader modifications disabled to prevent compilation errors");
    }

    public getSunLightPosition(): THREE.Vector3 | null {
        return this.sunLight ? this.sunLight.position.clone() : null;
    }

    public getSunLightIntensity(): number {
        return this.sunLight ? this.sunLight.intensity : 0;
    }

    public setTimeFromTimeline(time: Date): void {
        this.currentTime = time;
        this.entityManager.setTime(time);
    }

    public resetToCurrentTime(): void {
        this.currentTime = new Date();
        this.entityManager.setTime(this.currentTime);
    }

    public getTimelineRange(): { start: Date; end: Date } {
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
        const end = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
        return { start, end };
    }

    // Orbit Management Methods
    public addOrbit(id: string, coe: OrbitalElements, color: number = 0x00ff00, opacity: number = 0.6, segments?: number, lineWidth?: number): void {
        console.log(`GlobeEngine: Adding orbit ${id} with COE:`, coe);

        // Convert orbital elements to ClassicalOrbitalElements if needed
        let classicalCoe;
        if ("semiMajorAxis" in coe) {
            classicalCoe = coe as any;
            console.log(`GlobeEngine: Using existing COE for orbit ${id}`);
        } else {
            // Convert from TLE or other format
            // For now, create a default COE - in a full implementation,
            // you'd extract the actual orbital elements from the TLE
            classicalCoe = {
                semiMajorAxis: 7000, // Default altitude
                eccentricity: 0.01,
                inclination: 51.6,
                rightAscensionOfAscendingNode: 0,
                argumentOfPeriapsis: 0,
                meanAnomaly: 0,
                epoch: new Date(),
            };
            console.log(`GlobeEngine: Using default COE for orbit ${id}`);
        }

        console.log(`GlobeEngine: Final COE for orbit ${id}:`, classicalCoe);
        this.orbitManager.addOrbit(id, classicalCoe, color, opacity, segments, lineWidth);
        console.log(`GlobeEngine: Orbit count after adding ${id}: ${this.orbitManager.getOrbitCount()}`);
    }

    public removeOrbit(id: string): void {
        this.orbitManager.removeOrbit(id);
    }

    public setOrbitVisible(id: string, visible: boolean): void {
        this.orbitManager.setOrbitVisible(id, visible);
    }

    public toggleOrbitVisibility(id: string): void {
        this.orbitManager.toggleOrbitVisibility(id);
    }

    public setAllOrbitsVisible(visible: boolean): void {
        this.orbitManager.setAllOrbitsVisible(visible);
    }

    public setOrbitRenderingSystem(system: OrbitRenderingSystem): void {
        this.orbitManager.setRenderingSystem(system);
    }

    public getOrbitRenderingSystem(): OrbitRenderingSystem {
        return this.orbitManager.getRenderingSystem();
    }

    public getOrbitCount(): number {
        return this.orbitManager.getOrbitCount();
    }

    public getVisibleOrbitCount(): number {
        return this.orbitManager.getVisibleOrbitCount();
    }

    public getOrbitSystemInfo(): any {
        return this.orbitManager.getSystemInfo();
    }

    public clearAllOrbits(): void {
        this.orbitManager.clear();
    }

    // Tile Provider Management Methods
    public setTileProvider(provider: TileProvider, customUrl?: string): void {
        this.options.tileProvider = provider;
        if (customUrl && provider === TileProvider.CUSTOM) {
            this.options.customTileUrl = customUrl;
        }

        // Recreate globe with new tile provider
        this.recreateGlobe();
    }

    public getTileProvider(): TileProvider {
        return this.options.tileProvider;
    }

    public getCustomTileUrl(): string {
        return this.options.customTileUrl;
    }

    public getAvailableTileProviders(): { value: TileProvider; label: string; description: string }[] {
        return [
            {
                value: TileProvider.OPENSTREETMAP,
                label: "OpenStreetMap",
                description: "Free, open-source map tiles",
            },
            {
                value: TileProvider.CARTO,
                label: "CartoDB",
                description: "Light, clean map style",
            },
            {
                value: TileProvider.STAMEN,
                label: "Stamen Terrain",
                description: "Terrain-focused map tiles",
            },
            {
                value: TileProvider.ESRI,
                label: "Esri World Imagery",
                description: "Satellite imagery from Esri",
            },
            {
                value: TileProvider.NASA,
                label: "NASA Blue Marble",
                description: "NASA's Blue Marble imagery",
            },
            {
                value: TileProvider.CUSTOM,
                label: "Custom",
                description: "Use your own tile server",
            },
        ];
    }

    private recreateGlobe(): void {
        // Remove current globe
        if (this.enhancedGlobe) {
            this.scene.remove(this.enhancedGlobe.getGroup());
            this.enhancedGlobe.dispose();
            this.enhancedGlobe = null;
        } else if (this.tileGlobe) {
            this.scene.remove(this.tileGlobe.getGroup());
            this.tileGlobe.dispose();
            this.tileGlobe = null;
        } else if (this.globe) {
            this.scene.remove(this.globe);
        }

        // Create new globe with updated tile provider
        this.createGlobe();
    }
}
