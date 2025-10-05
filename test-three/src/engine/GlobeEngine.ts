import Stats from "stats.js";
import SunCalc from "suncalc";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EntityManager } from "./EntityManager";
import type { OrbitalElements } from "./OrbitalElements";
import { SatelliteEntity } from "./SatelliteEntity";

export interface GlobeEngineOptions {
    container: HTMLElement;
    width?: number;
    height?: number;
    enableControls?: boolean;
    enableStats?: boolean;
    autoRotate?: boolean;
    rotationSpeed?: number;
    maxSatellites?: number;
    useInstancedMesh?: boolean;
}

export class GlobeEngine {
    private container: HTMLElement;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private entityManager!: EntityManager;
    private globe!: THREE.Mesh;
    private controls!: OrbitControls;
    private sunLight!: THREE.DirectionalLight;
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
            useInstancedMesh: false,
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
        this.entityManager.setUseInstancedMesh(this.options.useInstancedMesh);
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
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10);
        this.camera.position.set(0, 0, 5);
    }

    private createRenderer(): void {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        this.renderer.setSize(this.options.width, this.options.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        // this.renderer.shadowMap.enabled = true;
        // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Disable shader errors and warnings for better performance
        this.renderer.debug = {
            checkShaderErrors: false,
            onShaderError: () => {},
        };

        this.container.appendChild(this.renderer.domElement);
    }

    private createGlobe(): void {
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
        this.scene.add(this.globe);
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
        const ambientLight = new THREE.AmbientLight(0x404040, 15.0);
        this.scene.add(ambientLight);

        // Directional light (sun) - position will be calculated based on current time
        this.sunLight = new THREE.DirectionalLight(0xffffff, 5.0);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.scene.add(this.sunLight);

        // Initialize sun position
        this.updateSunPosition();
    }

    private createEntityManager(): void {
        this.entityManager = new EntityManager(this.scene, {
            maxSatellites: this.options.maxSatellites,
            autoCleanup: true,
            updateInterval: 16, // Update every frame (60fps)
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

        // Get the current system from entity manager for intersection testing
        const currentSystem = this.entityManager.getCurrentSystem();
        if (!currentSystem) {
            // No satellites to select
            this.selectEntity(null);
            return;
        }

        // Calculate objects intersecting the picking ray
        const intersects = this.raycaster.intersectObject(currentSystem);

        if (intersects.length > 0) {
            // Find the closest satellite to the intersection point
            const intersectionPoint = intersects[0].point;
            const satellites = this.entityManager.getAllSatellites();

            let closestSatellite: SatelliteEntity | null = null;
            let closestDistance = Infinity;

            satellites.forEach((satellite) => {
                const satellitePosition = satellite.getPosition();
                const distance = intersectionPoint.distanceTo(satellitePosition);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSatellite = satellite;
                }
            });

            if (closestSatellite && closestDistance < 0.1) {
                // Within reasonable selection distance
                this.selectEntity(closestSatellite);
            } else {
                this.selectEntity(null);
            }
        } else {
            // Clicked on empty space, deselect
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

    public setUseInstancedMesh(useInstanced: boolean): void {
        this.entityManager.setUseInstancedMesh(useInstanced);
    }

    public getSystemInfo(): {
        satelliteCount: number;
        maxSatellites: number;
        isOptimized: boolean;
        systemType: "instanced" | "particle";
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

    public dispose(): void {
        this.stop();
        this.entityManager.dispose();

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
}
