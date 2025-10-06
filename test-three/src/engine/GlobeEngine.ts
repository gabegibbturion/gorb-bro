import Stats from "stats.js";
import SunCalc from "suncalc";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EnhancedGlobe } from "./EnhancedGlobe";
import { EntityManager, type RenderingSystem } from "./EntityManager";
import type { OrbitalElements } from "./OrbitalElements";
import { SatelliteEntity } from "./SatelliteEntity";
import { TLEParser } from "./TLEParser";

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
    useEnhancedGlobe?: boolean; // Use enhanced globe with high-quality textures
}

export class GlobeEngine {
    private container: HTMLElement;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private entityManager!: EntityManager;
    private globe!: THREE.Mesh;
    private enhancedGlobe: EnhancedGlobe | null = null;
    private controls!: OrbitControls;
    private sunLight!: THREE.DirectionalLight;
    private sun!: THREE.Mesh;
    private stats!: Stats;
    private animationId: number | null = null;
    private isRunning: boolean = false;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private selectedEntity: SatelliteEntity | null = null;

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
            useEnhancedGlobe: false, // Default to enhanced globe
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
        if (this.options.useEnhancedGlobe) {
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
        } else {
            // Use basic globe (legacy)
            const geometry = new THREE.SphereGeometry(1, 64, 64);

            // Create material with Earth texture
            const material = new THREE.MeshPhongMaterial({
                map: this.createEarthTexture(),
                bumpMap: this.createBumpTexture(),
                bumpScale: 0.02,
                shininess: 0.1,
            });

            this.globe = new THREE.Mesh(geometry, material);
            this.globe.receiveShadow = true;
            this.globe.castShadow = true;
            this.scene.add(this.globe);
        }
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
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, this.options.useEnhancedGlobe ? 5.0 : 15.0);
        this.scene.add(ambientLight);

        // Directional light (sun) - position will be calculated based on current time
        this.sunLight = new THREE.DirectionalLight(0xffffff, this.options.useEnhancedGlobe ? 3.0 : 8.0);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 50;
        this.sunLight.shadow.camera.left = -10;
        this.sunLight.shadow.camera.right = 10;
        this.sunLight.shadow.camera.top = 10;
        this.sunLight.shadow.camera.bottom = -10;
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
        // Create sun geometry - small sphere
        const sunGeometry = new THREE.SphereGeometry(0.1, 16, 16);

        // Create sun material with bright yellow/white color and emissive properties
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffaa,
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

        // Update stats
        if (this.stats) {
            this.stats.begin();
        }

        const deltaTime = this.clock.getDelta();

        // Update controls (for damping)
        if (this.controls) {
            this.controls.update();
        }

        // Update time
        this.currentTime = new Date(this.currentTime.getTime() + deltaTime * this.timeMultiplier * 1000);
        this.entityManager.setTime(this.currentTime);

        // Update enhanced globe if enabled
        if (this.enhancedGlobe) {
            this.enhancedGlobe.update(deltaTime * this.timeMultiplier * 1000);
        }

        // Update sun position based on current time
        this.updateSunPosition();

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime);
        }

        this.renderer.render(this.scene, this.camera);

        // End stats
        if (this.stats) {
            this.stats.end();
        }
    }

    private updateSunPosition(): void {
        if (!this.sunLight) return;

        // Calculate sun position using SunCalc
        const sunPosition = SunCalc.getPosition(this.currentTime, this.latitude, this.longitude);

        // Convert spherical coordinates to Cartesian coordinates
        // Distance from Earth normalized to globe size (globe radius = 1)
        const distance = 5; // Much closer to the globe for proper lighting

        // Convert altitude and azimuth to Cartesian coordinates
        const x = distance * Math.cos(sunPosition.altitude) * Math.sin(sunPosition.azimuth);
        const y = distance * Math.sin(sunPosition.altitude);
        const z = distance * Math.cos(sunPosition.altitude) * Math.cos(sunPosition.azimuth);

        // Update sun light position
        this.sunLight.position.set(x, y, z);

        // Update sun object position to match the light
        if (this.sun) {
            this.sun.position.set(x, y, z);
        }

        // Update light intensity based on sun altitude (darker when sun is below horizon)
        const intensity = Math.max(0, Math.sin(sunPosition.altitude));
        this.sunLight.intensity = intensity;
    }

    // Public API
    public addSatellite(orbitalElements: OrbitalElements, options?: any): SatelliteEntity | null {
        return this.entityManager.addSatellite(orbitalElements, options);
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
        } else {
            this.globe.visible = visible;
        }
    }

    public getGlobeVisible(): boolean {
        if (this.enhancedGlobe) {
            return this.enhancedGlobe.getGroup().visible;
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

        if (this.enhancedGlobe) {
            this.enhancedGlobe.dispose();
            this.enhancedGlobe = null;
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
}
