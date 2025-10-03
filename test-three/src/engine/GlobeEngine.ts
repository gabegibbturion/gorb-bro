import Stats from 'stats.js';
import SunCalc from 'suncalc';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EntityManager } from './EntityManager';
import type { OrbitalElements } from './OrbitalElements';
import { SatelliteEntity } from './SatelliteEntity';

export interface GlobeEngineOptions {
    container: HTMLElement;
    width?: number;
    height?: number;
    enableControls?: boolean;
    enableStats?: boolean;
    autoRotate?: boolean;
    rotationSpeed?: number;
    maxSatellites?: number;
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
            ...options
        };

        this.clock = new THREE.Clock();
        this.init();
    }

    private init(): void {
        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.createGlobe();
        this.createLights();
        this.createEntityManager();
        this.createControls();
        this.createStats();
        this.setupEventListeners();

        if (this.onEngineReady) {
            this.onEngineReady();
        }
    }

    private createScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);
    }

    private createCamera(): void {
        const aspect = this.options.width / this.options.height;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000000);
        this.camera.position.set(0, 0, 5);
    }

    private createRenderer(): void {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.options.width, this.options.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.appendChild(this.renderer.domElement);
    }

    private createGlobe(): void {
        const geometry = new THREE.SphereGeometry(1, 64, 64);

        // Create material with Earth texture
        const material = new THREE.MeshPhongMaterial({
            map: this.createEarthTexture(),
            bumpMap: this.createBumpTexture(),
            bumpScale: 0.02,
            shininess: 0.1
        });

        this.globe = new THREE.Mesh(geometry, material);
        this.globe.receiveShadow = true;
        this.scene.add(this.globe);
    }

    private createEarthTexture(): THREE.Texture {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/assets/earth_day.jpg');
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    private createBumpTexture(): THREE.Texture {
        const loader = new THREE.TextureLoader();
        const texture = loader.load('/assets/Bump.jpg');
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    private createLights(): void {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        // Directional light (sun) - position will be calculated based on current time
        this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
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
            updateInterval: 16 // Update every frame (60fps)
        });

        // Initialize LOD system with camera
        this.entityManager.initializeLOD(this.camera, {
            lodDistances: [0.1, 0.3, 0.8, 2.0], // Much closer LOD distances for better performance
            clusterDistance: 5.0, // Increased cluster distance to group more satellites
            maxVisibleSatellites: 10000, // Maximum visible satellites
            useInstancing: true
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
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = false; // Disable panning to keep camera orbiting around globe
        this.controls.minDistance = 2;
        this.controls.maxDistance = 20;
    }

    private createStats(): void {
        if (!this.options.enableStats) return;

        this.stats = new Stats();
        this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
        this.stats.dom.style.position = 'absolute';
        this.stats.dom.style.top = '0px';
        this.stats.dom.style.right = '0px';
        this.stats.dom.style.left = 'auto';
        this.stats.dom.style.zIndex = '100';
        this.container.appendChild(this.stats.dom);
    }


    private setupEventListeners(): void {
        window.addEventListener('resize', () => this.onWindowResize());
    }

    private onWindowResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    public start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.entityManager.startAutoUpdate();
        this.animate();
    }

    public stop(): void {
        this.isRunning = false;
        this.entityManager.stopAutoUpdate();

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
