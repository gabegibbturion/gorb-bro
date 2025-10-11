// Orbit visualization utilities
// Generates orbit geometry from Classical Orbital Elements (COEs)

import * as THREE from "three";
import type { OrbitalElementsComponent } from "../types";
import { OrbitalFormat } from "../types";
import * as satellite from "satellite.js";

export interface OrbitVisualizerOptions {
    color?: number;
    lineWidth?: number;
    segments?: number;
    opacity?: number;
}

export class OrbitVisualizer {
    private line: THREE.Line | null = null;
    private scene: THREE.Scene | null = null;

    constructor(private options: OrbitVisualizerOptions = {}) {
        this.options = {
            color: options.color ?? 0x00ff00,
            lineWidth: options.lineWidth ?? 2,
            segments: options.segments ?? 128,
            opacity: options.opacity ?? 0.6,
        };
    }

    /**
     * Create orbit visualization from orbital elements
     */
    createOrbit(orbitalElements: OrbitalElementsComponent, scene: THREE.Scene): void {
        this.scene = scene;

        // Remove existing orbit if any
        this.removeOrbit();

        // Generate orbit points
        const points = this.generateOrbitPoints(orbitalElements);

        if (points.length === 0) {
            console.warn("[OrbitVisualizer] Failed to generate orbit points");
            return;
        }

        // Create line geometry
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Create line material
        const material = new THREE.LineBasicMaterial({
            color: this.options.color,
            transparent: true,
            opacity: this.options.opacity,
            linewidth: this.options.lineWidth,
        });

        // Create line
        this.line = new THREE.Line(geometry, material);
        scene.add(this.line);
    }

    /**
     * Remove orbit visualization from scene
     */
    removeOrbit(): void {
        if (this.line && this.scene) {
            this.scene.remove(this.line);
            this.line.geometry.dispose();
            (this.line.material as THREE.Material).dispose();
            this.line = null;
        }
    }

    /**
     * Generate orbit points from orbital elements
     */
    private generateOrbitPoints(orbitalElements: OrbitalElementsComponent): THREE.Vector3[] {
        const points: THREE.Vector3[] = [];

        // Only support TLE format for now
        if (orbitalElements.format !== OrbitalFormat.TLE) {
            console.warn("[OrbitVisualizer] Only TLE format is currently supported");
            return points;
        }

        // Type guard for TLE data
        const tleData = orbitalElements.data as any;
        if (!tleData.line1 || !tleData.line2) {
            console.warn("[OrbitVisualizer] Invalid TLE data");
            return points;
        }

        try {
            // Initialize satellite record from TLE
            const satrec = satellite.twoline2satrec(tleData.line1, tleData.line2);

            // Get current time
            const now = Date.now();

            // Generate points for one complete orbit
            // Approximate orbital period from mean motion (revolutions per day)
            const meanMotion = satrec.no; // radians per minute
            const orbitalPeriod = (2 * Math.PI) / meanMotion; // minutes

            const segments = this.options.segments ?? 128;
            const timeStep = orbitalPeriod / segments; // minutes

            for (let i = 0; i <= segments; i++) {
                const time = now + i * timeStep * 60 * 1000; // Convert to milliseconds
                const date = new Date(time);

                // Propagate satellite position
                const positionAndVelocity = satellite.propagate(satrec, date);

                if (positionAndVelocity && positionAndVelocity.position && typeof positionAndVelocity.position !== "boolean") {
                    const pos = positionAndVelocity.position;
                    // Positions are in km (ECI frame)
                    points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
                }
            }
        } catch (error) {
            console.error("[OrbitVisualizer] Error generating orbit:", error);
        }

        return points;
    }

    /**
     * Update orbit color
     */
    setColor(color: number): void {
        if (this.line) {
            (this.line.material as THREE.LineBasicMaterial).color.setHex(color);
        }
    }

    /**
     * Update orbit opacity
     */
    setOpacity(opacity: number): void {
        if (this.line) {
            (this.line.material as THREE.LineBasicMaterial).opacity = opacity;
        }
    }
}
