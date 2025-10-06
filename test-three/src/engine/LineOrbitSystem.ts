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

export interface LineOrbitSystemOptions {
    maxOrbits?: number;
    baseSegments?: number;
    enableLOD?: boolean;
    enableFrustumCulling?: boolean;
}

export class LineOrbitSystem {
    private scene: THREE.Scene;
    private options: Required<LineOrbitSystemOptions>;
    private orbitInstances: Map<string, OrbitInstance> = new Map();

    // Single line geometry for all orbits
    private orbitLine: THREE.Line | null = null;
    private orbitGeometry: THREE.BufferGeometry | null = null;
    private orbitMaterial: THREE.LineBasicMaterial | null = null;

    // Combined position and color data for all orbits
    private positionData: Float32Array;
    private colorData: Float32Array;
    private currentVertexCount: number = 0;
    private currentOrbitCount: number = 0;

    // Camera for LOD calculations
    private camera: THREE.Camera | null = null;
    private lodDistances: number[] = [5, 10, 20, 50];
    private lodSegments: number[] = [128, 64, 32, 16];

    constructor(scene: THREE.Scene, options: LineOrbitSystemOptions = {}) {
        this.scene = scene;
        this.options = {
            maxOrbits: 1000,
            baseSegments: 64,
            enableLOD: true,
            enableFrustumCulling: true,
            ...options,
        };

        // Calculate maximum vertices needed
        const maxVertices = this.options.maxOrbits * (this.options.baseSegments + 1) * 3;
        this.positionData = new Float32Array(maxVertices);
        this.colorData = new Float32Array(maxVertices);

        this.createOrbitGeometry();
        this.createOrbitMaterial();
        this.createOrbitLine();
    }

    private createOrbitGeometry(): void {
        this.orbitGeometry = new THREE.BufferGeometry();

        // Set up attributes
        this.orbitGeometry.setAttribute("position", new THREE.BufferAttribute(this.positionData, 3));
        this.orbitGeometry.setAttribute("color", new THREE.BufferAttribute(this.colorData, 3));
    }

    private createOrbitMaterial(): void {
        this.orbitMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            linewidth: 1,
        });
    }

    private createOrbitLine(): void {
        if (!this.orbitGeometry || !this.orbitMaterial) return;

        this.orbitLine = new THREE.Line(this.orbitGeometry, this.orbitMaterial);
        this.orbitLine.frustumCulled = this.options.enableFrustumCulling;
        this.scene.add(this.orbitLine);
    }

    public addOrbit(id: string, coe: ClassicalOrbitalElements, color: number = 0x00ff00, opacity: number = 0.6, segments?: number): void {
        if (this.orbitInstances.has(id)) {
            this.updateOrbit(id, coe, color, opacity, segments);
            return;
        }

        if (this.currentOrbitCount >= this.options.maxOrbits) {
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
        this.updateAllOrbits();
    }

    public removeOrbit(id: string): void {
        if (!this.orbitInstances.has(id)) return;

        this.orbitInstances.delete(id);
        this.updateAllOrbits();
    }

    public updateOrbit(id: string, coe: ClassicalOrbitalElements, color?: number, opacity?: number, segments?: number): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.coe = coe;
        if (color !== undefined) instance.color = color;
        if (opacity !== undefined) instance.opacity = opacity;
        if (segments !== undefined) instance.segments = segments;

        this.updateAllOrbits();
    }

    public setOrbitVisible(id: string, visible: boolean): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.visible = visible;
        this.updateAllOrbits();
    }

    public toggleOrbitVisibility(id: string): void {
        const instance = this.orbitInstances.get(id);
        if (!instance) return;

        instance.visible = !instance.visible;
        this.updateAllOrbits();
    }

    public setAllOrbitsVisible(visible: boolean): void {
        this.orbitInstances.forEach((instance) => {
            instance.visible = visible;
        });
        this.updateAllOrbits();
    }

    private updateAllOrbits(): void {
        if (!this.orbitGeometry) return;

        // Clear all data
        this.positionData.fill(0);
        this.colorData.fill(0);
        this.currentVertexCount = 0;
        this.currentOrbitCount = 0;

        // Update all visible orbits
        this.orbitInstances.forEach((instance) => {
            if (!instance.visible) return;

            this.addOrbitToGeometry(instance);
            this.currentOrbitCount++;
        });

        // Update geometry
        this.updateGeometry();
    }

    private addOrbitToGeometry(instance: OrbitInstance): void {
        const coe = instance.coe;
        const segments = this.calculateLODSegments(instance);
        const color = new THREE.Color(instance.color);

        // Generate orbit points
        const points = this.generateOrbitPoints(coe, segments);

        // Add points to geometry with proper line breaks
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const vertexIndex = this.currentVertexCount + i;

            if (vertexIndex * 3 + 2 >= this.positionData.length) {
                console.warn("Exceeded maximum vertex count");
                break;
            }

            // Position
            this.positionData[vertexIndex * 3 + 0] = point.x;
            this.positionData[vertexIndex * 3 + 1] = point.y;
            this.positionData[vertexIndex * 3 + 2] = point.z;

            // Color
            this.colorData[vertexIndex * 3 + 0] = color.r;
            this.colorData[vertexIndex * 3 + 1] = color.g;
            this.colorData[vertexIndex * 3 + 2] = color.b;
        }

        this.currentVertexCount += points.length;
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

    private calculateOrbitCenter(coe: ClassicalOrbitalElements): THREE.Vector3 {
        // Simplified orbit center calculation
        // In reality, you'd want to calculate the actual center of the ellipse
        return new THREE.Vector3(0, 0, 0);
    }

    private updateGeometry(): void {
        if (!this.orbitGeometry) return;

        const positionAttribute = this.orbitGeometry.attributes.position as THREE.BufferAttribute;
        const colorAttribute = this.orbitGeometry.attributes.color as THREE.BufferAttribute;

        // Update the geometry with new data
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;

        // Update draw range
        this.orbitGeometry.setDrawRange(0, this.currentVertexCount);
    }

    public setCamera(camera: THREE.Camera): void {
        this.camera = camera;
    }

    public update(): void {
        // Update LOD if enabled
        if (this.options.enableLOD && this.camera) {
            this.updateAllOrbits();
        }
    }

    public getOrbitCount(): number {
        return this.orbitInstances.size;
    }

    public getVisibleOrbitCount(): number {
        return Array.from(this.orbitInstances.values()).filter((instance) => instance.visible).length;
    }

    public getVertexCount(): number {
        return this.currentVertexCount;
    }

    public clear(): void {
        this.orbitInstances.clear();
        this.currentVertexCount = 0;
        this.currentOrbitCount = 0;
        this.updateAllOrbits();
    }

    public dispose(): void {
        if (this.orbitLine) {
            this.scene.remove(this.orbitLine);
        }

        if (this.orbitGeometry) {
            this.orbitGeometry.dispose();
        }

        if (this.orbitMaterial) {
            this.orbitMaterial.dispose();
        }
    }
}
