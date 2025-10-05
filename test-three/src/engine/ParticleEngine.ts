import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface ParticleEngineOptions {
    container: HTMLElement;
    width?: number;
    height?: number;
    enableControls?: boolean;
    particleCount?: number;
    autoRotate?: boolean;
    rotationSpeed?: number;
}

export class ParticleEngine {
    private container: HTMLElement;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;
    private points!: THREE.Points;
    private animationId: number | null = null;
    private isRunning: boolean = false;

    private options: Required<ParticleEngineOptions>;
    private clock: THREE.Clock;

    // Event callbacks
    private onEngineReady?: () => void;
    private onUpdate?: () => void;

    constructor(options: ParticleEngineOptions) {
        this.container = options.container;
        this.options = {
            width: options.container.clientWidth,
            height: options.container.clientHeight,
            enableControls: true,
            particleCount: 1000000,
            autoRotate: false,
            rotationSpeed: 0.001,
            ...options,
        };

        this.clock = new THREE.Clock();
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
        this.createParticleSystem();
        this.createControls();
        this.setupEventListeners();

        if (this.onEngineReady) {
            this.onEngineReady();
        }
    }

    private createScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050505);

        // Add fog for depth
        this.scene.fog = new THREE.Fog(0x050505, 2000, 3500);
    }

    private createCamera(): void {
        const aspect = this.options.width / this.options.height;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10000);
        this.camera.position.z = 2750;
    }

    private createRenderer(): void {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        this.renderer.setSize(this.options.width, this.options.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Disable shader errors and warnings for better performance
        this.renderer.debug = {
            checkShaderErrors: false,
            onShaderError: () => {},
        };

        this.container.appendChild(this.renderer.domElement);
    }

    private createParticleSystem(): void {
        const particles = this.options.particleCount;
        const geometry = new THREE.BufferGeometry();

        const positions: number[] = [];
        const colors: number[] = [];

        const color = new THREE.Color();
        const n = 1000;
        const n2 = n / 2; // particles spread in the cube

        for (let i = 0; i < particles; i++) {
            // positions
            const x = Math.random() * n - n2;
            const y = Math.random() * n - n2;
            const z = Math.random() * n - n2;

            positions.push(x, y, z);

            // colors
            const vx = x / n + 0.5;
            const vy = y / n + 0.5;
            const vz = z / n + 0.5;

            color.setRGB(vx, vy, vz);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

        geometry.computeBoundingSphere();

        const material = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
        });

        this.points = new THREE.Points(geometry, material);
        this.scene.add(this.points);
    }

    private createControls(): void {
        if (!this.options.enableControls) return;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        this.controls.autoRotate = this.options.autoRotate;
        this.controls.autoRotateSpeed = this.options.rotationSpeed;
        this.controls.minDistance = 200;
        this.controls.maxDistance = 5000;
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    private setupEventListeners(): void {
        window.addEventListener("resize", () => this.onWindowResize());
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

        const deltaTime = this.clock.getDelta();

        // Rotate the particle system
        if (this.points) {
            this.points.rotation.x += 0.001;
            this.points.rotation.y += 0.002;
        }

        // Update controls
        if (this.controls) {
            this.controls.update();
        }

        // Render the scene
        this.renderer.render(this.scene, this.camera);

        // Call update callback
        if (this.onUpdate) {
            this.onUpdate();
        }
    }

    // Public API
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    public getScene(): THREE.Scene {
        return this.scene;
    }

    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }

    public getPoints(): THREE.Points {
        return this.points;
    }

    public setParticleCount(count: number): void {
        this.options.particleCount = count;
        // Note: This would require recreating the particle system
        // For now, this is a placeholder for future enhancement
    }

    public setAutoRotate(enabled: boolean): void {
        this.options.autoRotate = enabled;
        if (this.controls) {
            this.controls.autoRotate = enabled;
        }
    }

    public setRotationSpeed(speed: number): void {
        this.options.rotationSpeed = speed;
        if (this.controls) {
            this.controls.autoRotateSpeed = speed;
        }
    }

    // Event handlers
    public onEngineReadyCallback(callback: () => void): void {
        this.onEngineReady = callback;
    }

    public onUpdateCallback(callback: () => void): void {
        this.onUpdate = callback;
    }

    public dispose(): void {
        this.stop();

        // Remove event listeners
        window.removeEventListener("resize", () => this.onWindowResize());

        // Dispose controls
        if (this.controls) {
            this.controls.dispose();
        }

        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
        }

        // Remove canvas from DOM
        if (this.container && this.renderer) {
            try {
                this.container.removeChild(this.renderer.domElement);
            } catch (error) {
                console.warn("Canvas already removed from DOM");
            }
        }
    }
}
