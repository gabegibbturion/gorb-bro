import * as THREE from "three";
import type { ClassicalOrbitalElements } from "./OrbitalElements";
import { SimpleOrbitSystem } from "./SimpleOrbitSystem";
import { InstancedOrbitSystem } from "./InstancedOrbitSystem";
import { ShaderOrbitSystem } from "./ShaderOrbitSystem";

export type OrbitRenderingSystem = "line" | "instanced" | "shader";

export interface OrbitManagerOptions {
    renderingSystem?: OrbitRenderingSystem;
    maxOrbits?: number;
    enableLOD?: boolean;
    enableFrustumCulling?: boolean;
    baseSegments?: number;
    baseLineWidth?: number;
}

export interface OrbitInstance {
    id: string;
    coe: ClassicalOrbitalElements;
    color: number;
    opacity: number;
    visible: boolean;
    segments?: number;
    lineWidth?: number;
}

export class OrbitManager {
    private scene: THREE.Scene;
    private camera: THREE.Camera | null = null;
    private options: Required<OrbitManagerOptions>;

    // Rendering systems
    private lineSystem: SimpleOrbitSystem | null = null;
    private instancedSystem: InstancedOrbitSystem | null = null;
    private shaderSystem: ShaderOrbitSystem | null = null;

    private currentSystem: OrbitRenderingSystem;
    private orbitInstances: Map<string, OrbitInstance> = new Map();

    constructor(scene: THREE.Scene, options: OrbitManagerOptions = {}) {
        this.scene = scene;
        this.options = {
            renderingSystem: "line",
            maxOrbits: 1000,
            enableLOD: true,
            enableFrustumCulling: true,
            baseSegments: 64,
            baseLineWidth: 1.0,
            ...options,
        };

        this.currentSystem = this.options.renderingSystem;
        this.initializeRenderingSystem();
    }

    private initializeRenderingSystem(): void {
        console.log(`OrbitManager: Initializing rendering system: ${this.currentSystem}`);
        this.cleanupCurrentSystem();

        switch (this.currentSystem) {
            case "line":
                console.log(`OrbitManager: Creating SimpleOrbitSystem`);
                this.lineSystem = new SimpleOrbitSystem(this.scene, {
                    maxOrbits: this.options.maxOrbits,
                    baseSegments: this.options.baseSegments,
                    enableLOD: this.options.enableLOD,
                    enableFrustumCulling: this.options.enableFrustumCulling,
                });
                console.log(`OrbitManager: SimpleOrbitSystem created:`, this.lineSystem);
                break;

            case "instanced":
                this.instancedSystem = new InstancedOrbitSystem(this.scene, {
                    maxOrbits: this.options.maxOrbits,
                    baseSegments: this.options.baseSegments,
                    enableLOD: this.options.enableLOD,
                    enableFrustumCulling: this.options.enableFrustumCulling,
                });
                break;

            case "shader":
                this.shaderSystem = new ShaderOrbitSystem(this.scene, {
                    maxOrbits: this.options.maxOrbits,
                    enableLOD: this.options.enableLOD,
                    enableFrustumCulling: this.options.enableFrustumCulling,
                    baseLineWidth: this.options.baseLineWidth,
                });
                break;
        }

        // Restore all orbits to the new system
        this.restoreOrbits();
    }

    private cleanupCurrentSystem(): void {
        if (this.lineSystem) {
            this.lineSystem.dispose();
            this.lineSystem = null;
        }
        if (this.instancedSystem) {
            this.instancedSystem.dispose();
            this.instancedSystem = null;
        }
        if (this.shaderSystem) {
            this.shaderSystem.dispose();
            this.shaderSystem = null;
        }
    }

    private restoreOrbits(): void {
        const instances = Array.from(this.orbitInstances.values());
        this.orbitInstances.clear();

        instances.forEach((instance) => {
            this.addOrbitInternal(instance.id, instance.coe, instance.color, instance.opacity, instance.segments, instance.lineWidth);
        });
    }

    public setRenderingSystem(system: OrbitRenderingSystem): void {
        if (this.currentSystem === system) return;

        this.currentSystem = system;
        this.initializeRenderingSystem();
    }

    public getRenderingSystem(): OrbitRenderingSystem {
        return this.currentSystem;
    }

    public setCamera(camera: THREE.Camera): void {
        this.camera = camera;

        if (this.lineSystem) this.lineSystem.setCamera(camera);
        if (this.instancedSystem) this.instancedSystem.setCamera(camera);
        if (this.shaderSystem) this.shaderSystem.setCamera(camera);
    }

    public addOrbit(id: string, coe: ClassicalOrbitalElements, color: number = 0x00ff00, opacity: number = 0.6, segments?: number, lineWidth?: number): void {
        console.log(`OrbitManager: Adding orbit ${id} with system ${this.currentSystem}`);
        this.addOrbitInternal(id, coe, color, opacity, segments, lineWidth);
    }

    private addOrbitInternal(id: string, coe: ClassicalOrbitalElements, color: number, opacity: number, segments?: number, lineWidth?: number): void {
        // Store orbit instance
        const instance: OrbitInstance = {
            id,
            coe,
            color,
            opacity,
            visible: true,
            segments,
            lineWidth,
        };
        this.orbitInstances.set(id, instance);

        // Add to appropriate rendering system
        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    console.log(`OrbitManager: Adding to line system: ${id}`);
                    this.lineSystem.addOrbit(id, coe, color, opacity, segments);
                } else {
                    console.error(`OrbitManager: Line system not available for orbit ${id}`);
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    console.log(`OrbitManager: Adding to instanced system: ${id}`);
                    this.instancedSystem.addOrbit(id, coe, color, opacity);
                } else {
                    console.error(`OrbitManager: Instanced system not available for orbit ${id}`);
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    console.log(`OrbitManager: Adding to shader system: ${id}`);
                    this.shaderSystem.addOrbit(id, coe, color, opacity, lineWidth);
                } else {
                    console.error(`OrbitManager: Shader system not available for orbit ${id}`);
                }
                break;
        }
    }

    public removeOrbit(id: string): void {
        this.orbitInstances.delete(id);

        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    this.lineSystem.removeOrbit(id);
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    this.instancedSystem.removeOrbit(id);
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    this.shaderSystem.removeOrbit(id);
                }
                break;
        }
    }

    public updateOrbit(id: string, coe: ClassicalOrbitalElements, color?: number, opacity?: number, segments?: number, lineWidth?: number): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        // Update stored instance
        instance.coe = coe;
        if (color !== undefined) instance.color = color;
        if (opacity !== undefined) instance.opacity = opacity;
        if (segments !== undefined) instance.segments = segments;
        if (lineWidth !== undefined) instance.lineWidth = lineWidth;

        // Update in rendering system
        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    this.lineSystem.updateOrbit(id, coe, color, opacity, segments);
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    this.instancedSystem.updateOrbit(id, coe, color, opacity);
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    this.shaderSystem.updateOrbit(id, coe, color, opacity, lineWidth);
                }
                break;
        }
    }

    public setOrbitVisible(id: string, visible: boolean): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.visible = visible;

        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    this.lineSystem.setOrbitVisible(id, visible);
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    this.instancedSystem.setOrbitVisible(id, visible);
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    this.shaderSystem.setOrbitVisible(id, visible);
                }
                break;
        }
    }

    public toggleOrbitVisibility(id: string): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        this.setOrbitVisible(id, !instance.visible);
    }

    public setAllOrbitsVisible(visible: boolean): void {
        this.orbitInstances.forEach((instance) => {
            instance.visible = visible;
        });

        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    this.lineSystem.setAllOrbitsVisible(visible);
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    this.instancedSystem.setAllOrbitsVisible(visible);
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    this.shaderSystem.setAllOrbitsVisible(visible);
                }
                break;
        }
    }

    public update(): void {
        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    this.lineSystem.update();
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    this.instancedSystem.update();
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    this.shaderSystem.update();
                }
                break;
        }
    }

    public getOrbitCount(): number {
        return this.orbitInstances.size;
    }

    public getVisibleOrbitCount(): number {
        return Array.from(this.orbitInstances.values()).filter((instance) => instance.visible).length;
    }

    public getSystemInfo(): {
        renderingSystem: OrbitRenderingSystem;
        orbitCount: number;
        visibleOrbitCount: number;
        vertexCount?: number;
    } {
        const info = {
            renderingSystem: this.currentSystem,
            orbitCount: this.getOrbitCount(),
            visibleOrbitCount: this.getVisibleOrbitCount(),
        };

        // Add system-specific info
        if (this.currentSystem === "line" && this.lineSystem) {
            info.vertexCount = this.lineSystem.getVertexCount();
        }

        return info;
    }

    public clear(): void {
        this.orbitInstances.clear();

        switch (this.currentSystem) {
            case "line":
                if (this.lineSystem) {
                    this.lineSystem.clear();
                }
                break;

            case "instanced":
                if (this.instancedSystem) {
                    this.instancedSystem.clear();
                }
                break;

            case "shader":
                if (this.shaderSystem) {
                    this.shaderSystem.clear();
                }
                break;
        }
    }

    public dispose(): void {
        this.cleanupCurrentSystem();
        this.orbitInstances.clear();
    }
}
