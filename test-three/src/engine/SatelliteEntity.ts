import * as satellite from "satellite.js";
import * as THREE from "three";
import { OrbitVisualization } from "./OrbitVisualization";
import type { ClassicalOrbitalElements } from "./OrbitalElements";

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
    useK2Propagator?: boolean; // Use K2 propagator instead of satellite.js
}

export class SatelliteEntity {
    public readonly id: string;
    public readonly name: string;
    public readonly satrec: any;

    private trail!: THREE.Line;
    private trailGeometry!: THREE.BufferGeometry;
    private trailMaterial!: THREE.LineBasicMaterial;
    private orbitVisualization: OrbitVisualization | null = null;
    private currentCOE: ClassicalOrbitalElements | null = null;

    private options: Required<SatelliteEntityOptions>;
    private currentPosition: THREE.Vector3 = new THREE.Vector3();
    private currentVelocity: THREE.Vector3 = new THREE.Vector3();
    private lastUpdateTime: Date | null = null;
    private isSelected: boolean = false;
    private isVisible: boolean = true;

    // K2 propagator state
    private k2State: number[] = [0, 0, 0, 0, 0, 0]; // [x, y, z, vx, vy, vz] in Earth radii
    private k2Initialized: boolean = false;

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
            useK2Propagator: false, // Default to satellite.js
            ...options,
        };

        // Only create trail if needed (performance optimization)
        if (this.options.showTrail) {
            this.createTrail();
        }

        // Lazy-load orbit visualization only when requested (huge performance boost)
        // this.createOrbitVisualization();
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
            vertexColors: true, // Enable vertex colors for gradient effect
        });

        this.trail = new THREE.Line(this.trailGeometry, this.trailMaterial);
    }

    private createOrbitVisualization(): void {
        if (this.orbitVisualization) return; // Already created

        // Extract COE from satrec for orbit visualization
        if (!this.currentCOE) {
            this.currentCOE = this.extractCOEFromSatrec();
        }

        this.orbitVisualization = new OrbitVisualization(this.currentCOE, {
            color: this.options.orbitColor,
            opacity: 0.6,
            lineWidth: 1,
            segments: 64,
            showHalfOrbit: true,
        });

        this.orbitVisualization.setVisible(this.options.showOrbit);
    }

    private ensureOrbitVisualization(): void {
        if (!this.orbitVisualization) {
            this.createOrbitVisualization();
        }
    }

    private extractCOEFromSatrec(): ClassicalOrbitalElements {
        // Extract Classical Orbital Elements from satrec
        const earthRadius = 6371; // km

        return {
            semiMajorAxis: this.satrec.a * earthRadius, // Convert from Earth radii to km
            eccentricity: this.satrec.ecco,
            inclination: (this.satrec.inclo * 180) / Math.PI, // Convert from radians to degrees
            rightAscensionOfAscendingNode: (this.satrec.nodeo * 180) / Math.PI,
            argumentOfPeriapsis: (this.satrec.argpo * 180) / Math.PI,
            meanAnomaly: (this.satrec.mo * 180) / Math.PI,
            epoch: new Date(),
        };
    }

    private initializeK2State(): void {
        if (this.k2Initialized) return;

        try {
            // Get initial position from satellite.js
            const positionAndVelocity = satellite.propagate(this.satrec, new Date());

            if (positionAndVelocity?.position && positionAndVelocity?.velocity) {
                const pos = positionAndVelocity.position;
                const vel = positionAndVelocity.velocity;

                // Convert from km to Earth radii
                const earthRadiusKm = 6371;
                const scaleFactor = 1 / earthRadiusKm;

                this.k2State[0] = pos.x * scaleFactor;
                this.k2State[1] = pos.y * scaleFactor;
                this.k2State[2] = pos.z * scaleFactor;
                this.k2State[3] = vel.x * scaleFactor;
                this.k2State[4] = vel.y * scaleFactor;
                this.k2State[5] = vel.z * scaleFactor;

                this.k2Initialized = true;
            }
        } catch (error) {
            console.warn(`Failed to initialize K2 state for satellite ${this.name}:`, error);
        }
    }

    private k2Propagate(dt: number): void {
        if (!this.k2Initialized) {
            this.initializeK2State();
            return;
        }

        // K2 (Runge-Kutta 2nd order) propagator
        const MU_EARTH = 0.000001536328985; // G*MassOfEarth in units of earth radius

        const halfDT = dt * 0.5;

        // K1 step
        const k1 = [this.k2State[0], this.k2State[1], this.k2State[2]];
        const mag1 = -MU_EARTH / Math.pow(k1[0] * k1[0] + k1[1] * k1[1] + k1[2] * k1[2], 1.5);
        k1[0] *= mag1;
        k1[1] *= mag1;
        k1[2] *= mag1;

        // K2 step
        const k2 = [this.k2State[0] + dt * k1[0], this.k2State[1] + dt * k1[1], this.k2State[2] + dt * k1[2]];
        const mag2 = -MU_EARTH / Math.pow(k2[0] * k2[0] + k2[1] * k2[1] + k2[2] * k2[2], 1.5);
        k2[0] *= mag2;
        k2[1] *= mag2;
        k2[2] *= mag2;

        // Update velocity
        this.k2State[3] += halfDT * (k1[0] + k2[0]);
        this.k2State[4] += halfDT * (k1[1] + k2[1]);
        this.k2State[5] += halfDT * (k1[2] + k2[2]);

        // Update position
        this.k2State[0] += dt * this.k2State[3];
        this.k2State[1] += dt * this.k2State[4];
        this.k2State[2] += dt * this.k2State[5];
    }

    public update(time: Date): void {
        // Skip update if time hasn't changed significantly (performance optimization)
        // Reduced threshold from 100ms to 50ms for smoother updates
        if (this.lastUpdateTime && Math.abs(time.getTime() - this.lastUpdateTime.getTime()) < 50) {
            return;
        }

        if (this.options.useK2Propagator) {
            // Use K2 propagator
            const dt = this.lastUpdateTime ? (time.getTime() - this.lastUpdateTime.getTime()) / 1000 : 0.016; // Default 16ms
            this.k2Propagate(dt);

            // Update position and velocity from K2 state
            this.currentPosition.set(this.k2State[0], this.k2State[1], this.k2State[2]);
            this.currentVelocity.set(this.k2State[3], this.k2State[4], this.k2State[5]);

            this.lastUpdateTime = time;
        } else {
            // Use satellite.js propagator
            try {
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

                    this.currentPosition.set(pos.x * scaleFactor, pos.y * scaleFactor, pos.z * scaleFactor);

                    this.currentVelocity.set(vel.x * scaleFactor, vel.y * scaleFactor, vel.z * scaleFactor);

                    this.lastUpdateTime = time;
                }
            } catch (error) {
                // Propagation error - satellite position not updated
            }
        }
    }

    // No longer returns a mesh - satellites are just data points

    public getTrail(): THREE.Line | null {
        return this.trail;
    }

    public getOrbitVisualization(): THREE.Line | null {
        this.ensureOrbitVisualization();
        return this.orbitVisualization ? this.orbitVisualization.getLine() : null;
    }

    public toggleOrbitVisibility(): void {
        this.ensureOrbitVisualization();
        if (this.orbitVisualization) {
            this.orbitVisualization.toggleVisibility();
        }
    }

    public setOrbitVisible(visible: boolean): void {
        this.ensureOrbitVisualization();
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
            z: this.currentPosition.z / scaleFactor,
        };
        const positionGd = satellite.eciToGeodetic(eciPos, gmst);

        return {
            latitude: satellite.degreesLat(positionGd.latitude),
            longitude: satellite.degreesLong(positionGd.longitude),
            altitude: positionGd.height,
        };
    }

    public getPropagatorType(): string {
        return this.options.useK2Propagator ? "K2" : "satellite.js";
    }

    public setPropagatorType(useK2: boolean): void {
        this.options.useK2Propagator = useK2;
        // Reset K2 state if switching propagators
        if (useK2) {
            this.k2Initialized = false;
        }
    }

    public getPosition(): THREE.Vector3 {
        return this.currentPosition.clone();
    }

    public getPositionDirect(): THREE.Vector3 {
        // Return direct reference for performance-critical operations
        return this.currentPosition;
    }

    public getVelocity(): THREE.Vector3 {
        return this.currentVelocity.clone();
    }

    public getOrbitalElements(): ClassicalOrbitalElements {
        // Extract Classical Orbital Elements from satrec
        const earthRadius = 6371; // km

        return {
            semiMajorAxis: this.satrec.a * earthRadius, // Convert from Earth radii to km
            eccentricity: this.satrec.ecco,
            inclination: (this.satrec.inclo * 180) / Math.PI, // Convert from radians to degrees
            rightAscensionOfAscendingNode: (this.satrec.nodeo * 180) / Math.PI,
            argumentOfPeriapsis: (this.satrec.argpo * 180) / Math.PI,
            meanAnomaly: (this.satrec.mo * 180) / Math.PI,
            epoch: new Date(),
        };
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
    }

    public getVisible(): boolean {
        return this.isVisible;
    }

    public setSelected(selected: boolean): void {
        this.isSelected = selected;
    }

    public getSelected(): boolean {
        return this.isSelected;
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
                this.trail.material.forEach((material) => material.dispose());
            } else {
                this.trail.material.dispose();
            }
        }

        if (this.orbitVisualization) {
            this.orbitVisualization.dispose();
        }
    }
}
