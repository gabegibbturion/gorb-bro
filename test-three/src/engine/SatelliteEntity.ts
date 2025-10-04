import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { OrbitVisualization } from './OrbitVisualization';
import type { ClassicalOrbitalElements } from './OrbitalElements';

// Legacy TLE interface for backward compatibility
export interface TLEData {
    name: string;
    line1: string;
    line2: string;
}

export interface SatelliteEntityOptions {
    name: string;
    satrec: any; // satellite.js satrec object
    color?: number;
    size?: number;
    showTrail?: boolean;
    trailLength?: number;
    trailColor?: number;
    showOrbit?: boolean;
    orbitColor?: number;
}

export class SatelliteEntity {
    public readonly id: string;
    public readonly name: string;
    public readonly satrec: any;

    private trail!: THREE.Line;
    private trailGeometry!: THREE.BufferGeometry;
    private trailMaterial!: THREE.LineBasicMaterial;
    private orbitVisualization!: OrbitVisualization;
    private currentCOE!: ClassicalOrbitalElements;

    private options: Required<SatelliteEntityOptions>;
    private currentPosition: THREE.Vector3 = new THREE.Vector3();
    private currentVelocity: THREE.Vector3 = new THREE.Vector3();

    constructor(options: SatelliteEntityOptions) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.name = options.name;
        this.satrec = options.satrec;


        this.options = {
            color: 0xffff00,
            size: 0.01, // Much smaller size for scaled coordinates
            showTrail: false, // Temporarily disabled
            trailLength: 100,
            trailColor: 0xffff00,
            showOrbit: false,
            orbitColor: 0x00ff00,
            ...options
        };

        this.createTrail();
        this.createOrbitVisualization();
        // this.update(new Date());
    }


    private createTrail(): void {
        if (!this.options.showTrail) return;

        this.trailGeometry = new THREE.BufferGeometry();

        // Create a more sophisticated trail material with gradient effect
        this.trailMaterial = new THREE.LineBasicMaterial({
            color: this.options.trailColor,
            transparent: true,
            opacity: 0.8,
            linewidth: 1,
            vertexColors: true // Enable vertex colors for gradient effect
        });

        this.trail = new THREE.Line(this.trailGeometry, this.trailMaterial);
    }

    private createOrbitVisualization(): void {
        // Extract COE from satrec for orbit visualization
        this.currentCOE = this.extractCOEFromSatrec();

        this.orbitVisualization = new OrbitVisualization(this.currentCOE, {
            color: this.options.orbitColor,
            opacity: 0.6,
            lineWidth: 1,
            segments: 64,
            showHalfOrbit: true
        });

        this.orbitVisualization.setVisible(this.options.showOrbit);
    }

    private extractCOEFromSatrec(): ClassicalOrbitalElements {
        // Extract Classical Orbital Elements from satrec
        const earthRadius = 6371; // km

        return {
            semiMajorAxis: this.satrec.a * earthRadius, // Convert from Earth radii to km
            eccentricity: this.satrec.ecco,
            inclination: this.satrec.inclo * 180 / Math.PI, // Convert from radians to degrees
            rightAscensionOfAscendingNode: this.satrec.nodeo * 180 / Math.PI,
            argumentOfPeriapsis: this.satrec.argpo * 180 / Math.PI,
            meanAnomaly: this.satrec.mo * 180 / Math.PI,
            epoch: new Date()
        };
    }

    public update(time: Date): void {
        try {
            // Propagate satellite position using satellite.js
            const positionAndVelocity = satellite.propagate(this.satrec, time);

            if (positionAndVelocity?.position && positionAndVelocity?.velocity) {
                const pos = positionAndVelocity.position;
                const vel = positionAndVelocity.velocity;

                // Check for NaN values
                if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                    return;
                }

                // Convert from km to Three.js units (globe radius = 1)
                // Earth radius is ~6371 km, so scale factor is 1/6371
                const earthRadiusKm = 6371;
                const scaleFactor = 1 / earthRadiusKm;

                this.currentPosition.set(
                    pos.x * scaleFactor,
                    pos.y * scaleFactor,
                    pos.z * scaleFactor
                );

                this.currentVelocity.set(
                    vel.x * scaleFactor,
                    vel.y * scaleFactor,
                    vel.z * scaleFactor
                );

                // Calculate geodetic coordinates for location display
                const gmst = satellite.gstime(time);
                satellite.eciToGeodetic(pos, gmst);

                // Position is now just stored in currentPosition for the particle system
            }
        } catch (error) {
            // Propagation error - satellite position not updated
        }
    }


    // No longer returns a mesh - satellites are just data points

    public getTrail(): THREE.Line | null {
        return this.trail;
    }

    public getOrbitVisualization(): THREE.Line | null {
        return this.orbitVisualization ? this.orbitVisualization.getLine() : null;
    }

    public toggleOrbitVisibility(): void {
        if (this.orbitVisualization) {
            this.orbitVisualization.toggleVisibility();
        }
    }

    public setOrbitVisible(visible: boolean): void {
        if (this.orbitVisualization) {
            this.orbitVisualization.setVisible(visible);
        }
    }

    public getCurrentLocation(): { latitude: number; longitude: number; altitude: number } | null {
        if (!this.currentPosition.length()) return null;

        // Convert ECI position to geodetic coordinates
        const time = new Date();
        const gmst = satellite.gstime(time);
        const earthRadiusKm = 6371;
        const scaleFactor = 1 / earthRadiusKm;

        const eciPos = {
            x: this.currentPosition.x / scaleFactor, // Convert back to km
            y: this.currentPosition.y / scaleFactor,
            z: this.currentPosition.z / scaleFactor
        };
        const positionGd = satellite.eciToGeodetic(eciPos, gmst);

        return {
            latitude: satellite.degreesLat(positionGd.latitude),
            longitude: satellite.degreesLong(positionGd.longitude),
            altitude: positionGd.height
        };
    }

    public getPosition(): THREE.Vector3 {
        return this.currentPosition.clone();
    }

    public getVelocity(): THREE.Vector3 {
        return this.currentVelocity.clone();
    }

    public getOrbitalElements(): any {
        return {
            inclination: this.satrec.inclo,
            rightAscension: this.satrec.nodeo,
            eccentricity: this.satrec.ecco,
            argumentOfPerigee: this.satrec.argpo,
            meanAnomaly: this.satrec.mo,
            meanMotion: this.satrec.no
        };
    }


    public setVisible(_visible: boolean): void {
        // Visibility is now handled by the particle system
    }

    public isVisible(): boolean {
        return true; // Always visible in particle system
    }

    public setSelected(_selected: boolean): void {
        // Selection is now handled by the particle system
        // Could store selection state for particle system updates
    }

    public setColor(color: number): void {
        this.options.color = color;
        // Color updates will be handled by the particle system
    }

    public getColor(): number {
        return this.options.color;
    }

    public dispose(): void {
        if (this.trail) {
            this.trail.geometry.dispose();
            if (Array.isArray(this.trail.material)) {
                this.trail.material.forEach(material => material.dispose());
            } else {
                this.trail.material.dispose();
            }
        }

        if (this.orbitVisualization) {
            this.orbitVisualization.dispose();
        }
    }
}
