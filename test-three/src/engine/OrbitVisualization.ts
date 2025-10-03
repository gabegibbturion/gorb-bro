import * as THREE from 'three';
import type { ClassicalOrbitalElements } from './OrbitalElements';

export interface OrbitVisualizationOptions {
    color?: number;
    opacity?: number;
    lineWidth?: number;
    segments?: number;
    showHalfOrbit?: boolean; // Show 180 degrees before and after current position
}

export class OrbitVisualization {
    private orbitLine!: THREE.Line;
    private orbitGeometry!: THREE.BufferGeometry;
    private orbitMaterial!: THREE.LineBasicMaterial;
    private options: Required<OrbitVisualizationOptions>;
    private coe: ClassicalOrbitalElements;
    private isVisible: boolean = false;

    constructor(coe: ClassicalOrbitalElements, options: OrbitVisualizationOptions = {}) {
        this.coe = coe;
        this.options = {
            color: 0x00ff00,
            opacity: 0.6,
            lineWidth: 1,
            segments: 64,
            showHalfOrbit: true,
            ...options
        };

        this.createOrbitGeometry();
    }

    private createOrbitGeometry(): void {
        const points = this.generateOrbitPoints();
        
        this.orbitGeometry = new THREE.BufferGeometry();
        this.orbitGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
        
        this.orbitMaterial = new THREE.LineBasicMaterial({
            color: this.options.color,
            transparent: true,
            opacity: this.options.opacity,
            linewidth: this.options.lineWidth
        });

        this.orbitLine = new THREE.Line(this.orbitGeometry, this.orbitMaterial);
        this.orbitLine.visible = this.isVisible;
    }

    private generateOrbitPoints(): number[] {
        const points: number[] = [];
        const segments = this.options.segments;
        
        // Calculate orbit parameters from COE
        const a = this.coe.semiMajorAxis; // Semi-major axis in km
        const e = this.coe.eccentricity; // Eccentricity
        const i = this.coe.inclination * Math.PI / 180; // Inclination in radians
        const Ω = this.coe.rightAscensionOfAscendingNode * Math.PI / 180; // RAAN in radians
        const ω = this.coe.argumentOfPeriapsis * Math.PI / 180; // Argument of periapsis in radians
        
        // Calculate the range of true anomaly to show
        let startAngle = 0;
        let endAngle = 2 * Math.PI;
        
        if (this.options.showHalfOrbit) {
            // Show 180 degrees before and after current position
            const currentMeanAnomaly = this.coe.meanAnomaly * Math.PI / 180;
            startAngle = currentMeanAnomaly - Math.PI;
            endAngle = currentMeanAnomaly + Math.PI;
        }

        // Generate points along the orbit
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const trueAnomaly = startAngle + t * (endAngle - startAngle);
            
            // Calculate position in orbital plane
            const r = this.calculateRadius(trueAnomaly, a, e);
            const x_orbital = r * Math.cos(trueAnomaly);
            const y_orbital = r * Math.sin(trueAnomaly);
            const z_orbital = 0;
            
            // Transform to ECI coordinates
            const position = this.transformToECI(x_orbital, y_orbital, z_orbital, i, Ω, ω);
            
            // Scale to Three.js units (globe radius = 1)
            const earthRadiusKm = 6371;
            const scaleFactor = 1 / earthRadiusKm;
            
            points.push(
                position.x * scaleFactor,
                position.y * scaleFactor,
                position.z * scaleFactor
            );
        }

        return points;
    }

    private calculateRadius(trueAnomaly: number, a: number, e: number): number {
        // Calculate radius from true anomaly using orbital mechanics
        const cos_nu = Math.cos(trueAnomaly);
        const r = a * (1 - e * e) / (1 + e * cos_nu);
        return r;
    }

    private transformToECI(x: number, y: number, z: number, i: number, Ω: number, ω: number): THREE.Vector3 {
        // Transform from orbital plane to ECI coordinates
        // This involves three rotations: argument of periapsis, inclination, and RAAN
        
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

    public updateOrbit(newCoe: ClassicalOrbitalElements): void {
        this.coe = newCoe;
        const points = this.generateOrbitPoints();
        this.orbitGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
        this.orbitGeometry.attributes.position.needsUpdate = true;
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.orbitLine.visible = visible;
    }

    public toggleVisibility(): void {
        this.setVisible(!this.isVisible);
    }

    public getLine(): THREE.Line {
        return this.orbitLine;
    }

    public setColor(color: number): void {
        this.options.color = color;
        this.orbitMaterial.color.setHex(color);
    }

    public setOpacity(opacity: number): void {
        this.options.opacity = opacity;
        this.orbitMaterial.opacity = opacity;
    }

    public dispose(): void {
        if (this.orbitGeometry) {
            this.orbitGeometry.dispose();
        }
        if (this.orbitMaterial) {
            this.orbitMaterial.dispose();
        }
    }
}
