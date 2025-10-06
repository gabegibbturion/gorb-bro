import * as THREE from "three";
import type { ClassicalOrbitalElements } from "./OrbitalElements";

export interface OrbitInstance {
    id: string;
    coe: ClassicalOrbitalElements;
    color: number;
    opacity: number;
    visible: boolean;
    segments: number;
}

export interface SimpleOrbitSystemOptions {
    maxOrbits?: number;
    baseSegments?: number;
    enableLOD?: boolean;
    enableFrustumCulling?: boolean;
}

export class SimpleOrbitSystem {
    private scene: THREE.Scene;
    private options: Required<SimpleOrbitSystemOptions>;
    private orbitInstances: Map<string, OrbitInstance> = new Map();
    private orbitLines: Map<string, THREE.Line> = new Map();

    // Camera for LOD calculations
    private camera: THREE.Camera | null = null;
    private lodDistances: number[] = [5, 10, 20, 50];
    private lodSegments: number[] = [128, 64, 32, 16];

    constructor(scene: THREE.Scene, options: SimpleOrbitSystemOptions = {}) {
        this.scene = scene;
        this.options = {
            maxOrbits: 1000,
            baseSegments: 64,
            enableLOD: true,
            enableFrustumCulling: true,
            ...options,
        };
    }

    public addOrbit(id: string, coe: ClassicalOrbitalElements, color: number = 0x00ff00, opacity: number = 0.6, segments?: number): void {
        if (this.orbitInstances.has(id)) {
            this.updateOrbit(id, coe, color, opacity, segments);
            return;
        }

        if (this.orbitInstances.size >= this.options.maxOrbits) {
            console.warn(`Maximum orbit count (${this.options.maxOrbits}) reached`);
            return;
        }

        const instance: OrbitInstance = {
            id,
            coe,
            color,
            opacity,
            visible: true,
            segments: segments || this.options.baseSegments,
        };

        this.orbitInstances.set(id, instance);
        console.log(`SimpleOrbitSystem: Adding orbit ${id} with COE:`, coe);
        this.createOrbitLine(instance);
    }

    public removeOrbit(id: string): void {
        const line = this.orbitLines.get(id);
        if (line) {
            this.scene.remove(line);
            line.geometry.dispose();
            if (Array.isArray(line.material)) {
                line.material.forEach((material) => material.dispose());
            } else {
                line.material.dispose();
            }
            this.orbitLines.delete(id);
        }

        this.orbitInstances.delete(id);
    }

    public updateOrbit(id: string, coe: ClassicalOrbitalElements, color?: number, opacity?: number, segments?: number): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.coe = coe;
        if (color !== undefined) instance.color = color;
        if (opacity !== undefined) instance.opacity = opacity;
        if (segments !== undefined) instance.segments = segments;

        // Recreate the line
        this.removeOrbit(id);
        this.createOrbitLine(instance);
    }

    public setOrbitVisible(id: string, visible: boolean): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.visible = visible;
        const line = this.orbitLines.get(id);
        if (line) {
            line.visible = visible;
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
            const line = this.orbitLines.get(instance.id);
            if (line) {
                line.visible = visible;
            }
        });
    }

    private createOrbitLine(instance: OrbitInstance): void {
        const coe = instance.coe;
        const segments = this.calculateLODSegments(instance);
        console.log(`SimpleOrbitSystem: Creating orbit line for ${instance.id}, segments: ${segments}`);
        const points = this.generateOrbitPoints(coe, segments);
        console.log(`SimpleOrbitSystem: Generated ${points.length} points for orbit ${instance.id}`);

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);

        const color = new THREE.Color(instance.color);

        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const i3 = i * 3;

            positions[i3] = point.x;
            positions[i3 + 1] = point.y;
            positions[i3 + 2] = point.z;

            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        // Create material
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: instance.opacity,
            linewidth: 1,
        });

        // Create line
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = this.options.enableFrustumCulling;
        line.visible = instance.visible;

        this.scene.add(line);
        this.orbitLines.set(instance.id, line);
        console.log(`SimpleOrbitSystem: Added orbit line ${instance.id} to scene, visible: ${line.visible}`);
    }

    private generateOrbitPoints(coe: ClassicalOrbitalElements, segments: number): THREE.Vector3[] {
        const points: THREE.Vector3[] = [];

        // Extract orbital elements
        const a = coe.semiMajorAxis / 6371; // Convert km to Earth radii
        const e = coe.eccentricity;
        const i = (coe.inclination * Math.PI) / 180;
        const Ω = (coe.rightAscensionOfAscendingNode * Math.PI) / 180;
        const ω = (coe.argumentOfPeriapsis * Math.PI) / 180;

        // Generate points along the orbit
        for (let j = 0; j <= segments; j++) {
            const t = j / segments;
            const trueAnomaly = t * 2 * Math.PI;

            // Calculate position in orbital plane
            const r = this.calculateRadius(trueAnomaly, a, e);
            const x_orbital = r * Math.cos(trueAnomaly);
            const y_orbital = r * Math.sin(trueAnomaly);
            const z_orbital = 0;

            // Transform to ECI coordinates
            const position = this.transformToECI(x_orbital, y_orbital, z_orbital, i, Ω, ω);
            points.push(position);
        }

        return points;
    }

    private calculateRadius(trueAnomaly: number, a: number, e: number): number {
        const cos_nu = Math.cos(trueAnomaly);
        const r = (a * (1 - e * e)) / (1 + e * cos_nu);
        return r;
    }

    private transformToECI(x: number, y: number, z: number, i: number, Ω: number, ω: number): THREE.Vector3 {
        // Transform from orbital plane to ECI coordinates
        // 1. Rotate by argument of periapsis (ω)
        const cos_ω = Math.cos(ω);
        const sin_ω = Math.sin(ω);
        const x1 = x * cos_ω - y * sin_ω;
        const y1 = x * sin_ω + y * cos_ω;
        const z1 = z;

        // 2. Rotate by inclination (i)
        const cos_i = Math.cos(i);
        const sin_i = Math.sin(i);
        const x2 = x1;
        const y2 = y1 * cos_i - z1 * sin_i;
        const z2 = y1 * sin_i + z1 * cos_i;

        // 3. Rotate by RAAN (Ω)
        const cos_Ω = Math.cos(Ω);
        const sin_Ω = Math.sin(Ω);
        const x3 = x2 * cos_Ω - y2 * sin_Ω;
        const y3 = x2 * sin_Ω + y2 * cos_Ω;
        const z3 = z2;

        return new THREE.Vector3(x3, y3, z3);
    }

    private calculateLODSegments(instance: OrbitInstance): number {
        if (!this.options.enableLOD || !this.camera) {
            return instance.segments;
        }

        // Calculate distance from camera to orbit center
        const orbitCenter = this.calculateOrbitCenter(instance.coe);
        const distance = this.camera.position.distanceTo(orbitCenter);

        // Find appropriate LOD level
        for (let i = 0; i < this.lodDistances.length; i++) {
            if (distance <= this.lodDistances[i]) {
                return this.lodSegments[i];
            }
        }

        return this.lodSegments[this.lodSegments.length - 1];
    }

    private calculateOrbitCenter(_coe: ClassicalOrbitalElements): THREE.Vector3 {
        // Simplified orbit center calculation
        return new THREE.Vector3(0, 0, 0);
    }

    public setCamera(camera: THREE.Camera): void {
        this.camera = camera;
    }

    public update(): void {
        // Update LOD if enabled
        if (this.options.enableLOD && this.camera) {
            this.orbitInstances.forEach((instance) => {
                const line = this.orbitLines.get(instance.id);
                if (line && instance.visible) {
                    // Recreate line with new LOD
                    this.removeOrbit(instance.id);
                    this.createOrbitLine(instance);
                }
            });
        }
    }

    public getOrbitCount(): number {
        return this.orbitInstances.size;
    }

    public getVisibleOrbitCount(): number {
        return Array.from(this.orbitInstances.values()).filter((instance) => instance.visible).length;
    }

    public clear(): void {
        this.orbitInstances.forEach((instance) => {
            this.removeOrbit(instance.id);
        });
        this.orbitInstances.clear();
    }

    public dispose(): void {
        this.clear();
    }
}
