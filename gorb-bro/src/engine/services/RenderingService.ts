// Rendering Service - manages Three.js rendering context

import * as THREE from "three";
import type { IRenderingService } from "../types";

export class RenderingService implements IRenderingService {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private geometryCache: Map<string, THREE.BufferGeometry> = new Map();
    private materialCache: Map<string, THREE.Material> = new Map();
    private shaderCache: Map<string, THREE.ShaderMaterial> = new Map();
    private resizeHandler: (() => void) | null = null;
    public lastRenderTime: number = 0; // Exposed for performance tracking

    constructor(canvas: HTMLCanvasElement, options?: { antialias?: boolean; autoResize?: boolean }) {
        // Initialize renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: options?.antialias ?? true,
            alpha: false,
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Initialize scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000000);
        this.camera.position.set(0, 0, 50000);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(100000, 0, 0);
        this.scene.add(directionalLight);

        // Set up automatic resize handling (enabled by default)
        if (options?.autoResize !== false) {
            this.enableAutoResize();
        }
    }

    private enableAutoResize(): void {
        this.resizeHandler = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            this.resize(width, height);
        };
        window.addEventListener("resize", this.resizeHandler);
    }

    private disableAutoResize(): void {
        if (this.resizeHandler) {
            window.removeEventListener("resize", this.resizeHandler);
            this.resizeHandler = null;
        }
    }

    getRenderer(): THREE.WebGLRenderer {
        return this.renderer;
    }

    getScene(): THREE.Scene {
        return this.scene;
    }

    getCamera(): THREE.Camera {
        return this.camera;
    }

    addObject(object: THREE.Object3D): void {
        this.scene.add(object);
    }

    removeObject(object: THREE.Object3D): void {
        this.scene.remove(object);
    }

    setTileProvider(_provider: any): void {
        // Store tile provider for future use
    }

    registerShader(name: string, shader: THREE.ShaderMaterial): void {
        this.shaderCache.set(name, shader);
    }

    registerGeometry(name: string, geometry: THREE.BufferGeometry): void {
        this.geometryCache.set(name, geometry);
    }

    registerMaterial(name: string, material: THREE.Material): void {
        this.materialCache.set(name, material);
    }

    getGeometry(name: string): THREE.BufferGeometry | undefined {
        return this.geometryCache.get(name);
    }

    getMaterial(name: string): THREE.Material | undefined {
        return this.materialCache.get(name);
    }

    render(): void {
        const startTime = performance.now();
        this.renderer.render(this.scene, this.camera);
        this.lastRenderTime = performance.now() - startTime;
    }

    resize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    cleanup(): void {
        // Remove resize handler
        this.disableAutoResize();

        // Dispose of all cached resources
        this.geometryCache.forEach((geometry) => geometry.dispose());
        this.materialCache.forEach((material) => material.dispose());
        this.shaderCache.forEach((shader) => shader.dispose());

        // Clear caches
        this.geometryCache.clear();
        this.materialCache.clear();
        this.shaderCache.clear();

        // Dispose renderer
        this.renderer.dispose();
    }
}
