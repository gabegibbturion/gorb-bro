import * as THREE from 'three';
import type { OrbitalElements } from './OrbitalElements';
import { OrbitalElementsGenerator } from './OrbitalElements';
import type { SatelliteEntityOptions } from './SatelliteEntity';
import { SatelliteEntity } from './SatelliteEntity';

export interface EntityManagerOptions {
    maxSatellites?: number;
    autoCleanup?: boolean;
    updateInterval?: number;
}

export class EntityManager {
    private satellites: Map<string, SatelliteEntity> = new Map();
    private scene: THREE.Scene;
    private options: Required<EntityManagerOptions>;
    private currentTime: Date = new Date();
    private isUpdating: boolean = false;

    // Unified particle system for all satellites
    private particleSystem: THREE.Points | null = null;
    private particleGeometry: THREE.BufferGeometry | null = null;
    private particleMaterial: THREE.PointsMaterial | null = null;
    private currentParticleCount: number = 0;

    // Event callbacks
    private onSatelliteAdded?: (satellite: SatelliteEntity) => void;
    private onSatelliteRemoved?: (satellite: SatelliteEntity) => void;
    private onUpdate?: (satellites: SatelliteEntity[]) => void;

    constructor(scene: THREE.Scene, options: EntityManagerOptions = {}) {
        this.scene = scene;
        this.options = {
            maxSatellites: 100000,
            autoCleanup: true,
            updateInterval: 1000, // 1 second
            ...options
        };
    }


    public addSatellite(orbitalElements: OrbitalElements, options?: Partial<SatelliteEntityOptions>): SatelliteEntity | null {
        if (this.satellites.size >= this.options.maxSatellites) {
            return null;
        }

        // Convert orbital elements to satrec
        const satrec = OrbitalElementsGenerator.toSatrec(orbitalElements);

        // Extract name from orbital elements
        const name = 'name' in orbitalElements ? orbitalElements.name : `Satellite-${Math.floor(Math.random() * 1000)}`;

        const satelliteOptions: SatelliteEntityOptions = {
            name,
            satrec,
            ...options
        };

        const satellite = new SatelliteEntity(satelliteOptions);
        this.satellites.set(satellite.id, satellite);

        // Add trails and orbits to scene (but not individual meshes)
        // const trail = satellite.getTrail();
        // if (trail) {
        //     this.scene.add(trail);
        // }
        // const orbit = satellite.getOrbitVisualization();
        // if (orbit) {
        //     this.scene.add(orbit);
        // }

        // Update particle system
        this.updateParticleSystem();

        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satellite);
        }

        return satellite;
    }

    public removeSatellite(id: string): boolean {
        const satellite = this.satellites.get(id);
        if (!satellite) {
            return false;
        }

        // Remove trails and orbits from scene
        const trail = satellite.getTrail();
        if (trail) {
            this.scene.remove(trail);
        }
        const orbit = satellite.getOrbitVisualization();
        if (orbit) {
            this.scene.remove(orbit);
        }

        // Cleanup
        satellite.dispose();
        this.satellites.delete(id);

        // Update particle system
        this.updateParticleSystem();

        // Trigger callback
        if (this.onSatelliteRemoved) {
            this.onSatelliteRemoved(satellite);
        }

        return true;
    }

    public getSatellite(id: string): SatelliteEntity | undefined {
        return this.satellites.get(id);
    }

    public getAllSatellites(): SatelliteEntity[] {
        return Array.from(this.satellites.values());
    }

    public getSatelliteCount(): number {
        return this.satellites.size;
    }

    public clearAll(): void {
        const satelliteIds = Array.from(this.satellites.keys());
        satelliteIds.forEach(id => this.removeSatellite(id));
    }

    public update(time: Date): void {
        if (this.isUpdating) return;

        this.isUpdating = true;
        this.currentTime = time;

        // Update all satellites
        this.satellites.forEach(satellite => {
            satellite.update(time);
        });

        // Update particle system positions
        this.updateParticleSystem();

        // Trigger update callback
        if (this.onUpdate) {
            this.onUpdate(this.getAllSatellites());
        }

        this.isUpdating = false;
    }

    private updateParticleSystem(): void {
        const satellites = this.getAllSatellites();

        // Remove existing particle system if no satellites
        if (satellites.length === 0) {
            if (this.particleSystem) {
                this.scene.remove(this.particleSystem);
                this.particleGeometry?.dispose();
                this.particleMaterial?.dispose();
                this.particleSystem = null;
                this.particleGeometry = null;
                this.particleMaterial = null;
                this.currentParticleCount = 0;
            }
            return;
        }

        // Only create particle system if it doesn't exist
        if (!this.particleSystem) {
            this.createParticleSystem();
        }

        // Update current particle count
        this.currentParticleCount = satellites.length;

        // Update positions and colors efficiently
        this.updateParticlePositions(satellites);
    }

    private updateParticlePositions(satellites: SatelliteEntity[]): void {
        if (!this.particleSystem || !this.particleGeometry) return;

        const positionAttribute = this.particleGeometry.attributes.position as THREE.BufferAttribute;
        const colorAttribute = this.particleGeometry.attributes.color as THREE.BufferAttribute;

        // Get the underlying arrays for direct manipulation
        const positions = positionAttribute.array as Float32Array;
        const colors = colorAttribute.array as Float32Array;

        // Update positions and colors for active satellites
        satellites.forEach((satellite, index) => {
            // Use direct position reference for better performance
            const position = satellite.getPositionDirect();
            const color = new THREE.Color(satellite.getColor());

            // Update positions directly in the buffer
            positions[index * 3] = position.x;
            positions[index * 3 + 1] = position.y;
            positions[index * 3 + 2] = position.z;

            // Update colors directly in the buffer
            colors[index * 3] = color.r;
            colors[index * 3 + 1] = color.g;
            colors[index * 3 + 2] = color.b;
        });

        // Hide unused particles by setting them to a far position
        for (let i = satellites.length; i < this.options.maxSatellites; i++) {
            // Move unused particles far away (they won't be visible)
            positions[i * 3] = 10000;
            positions[i * 3 + 1] = 10000;
            positions[i * 3 + 2] = 10000;

            // Set unused particles to transparent (black with zero alpha would be better, but we'll use black)
            colors[i * 3] = 0;
            colors[i * 3 + 1] = 0;
            colors[i * 3 + 2] = 0;
        }

        // Mark attributes as needing update
        positionAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;
    }

    private createParticleSystem(): void {
        const satellites = this.getAllSatellites();
        if (satellites.length === 0) return;

        // Remove existing particle system
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleGeometry?.dispose();
            this.particleMaterial?.dispose();
        }

        // Create geometry with a larger buffer to accommodate dynamic satellite counts
        // Use maxSatellites as the buffer size to avoid frequent recreations
        const maxParticles = this.options.maxSatellites;
        this.particleGeometry = new THREE.BufferGeometry();

        // Initialize with maximum possible particles (all zeros initially)
        const positions = new Float32Array(maxParticles * 3);
        const colors = new Float32Array(maxParticles * 3);

        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.particleGeometry.computeBoundingSphere();

        // Create material exactly like ParticleEngine
        this.particleMaterial = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: true,
            // transparent: true,
            // opacity: 0.8
        });

        // Create particle system
        this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.scene.add(this.particleSystem);

        // Update positions for current satellites
        this.updateParticlePositions(satellites);
    }


    public setTime(time: Date): void {
        this.currentTime = time;
        this.update(time);
    }

    public getCurrentTime(): Date {
        return new Date(this.currentTime);
    }


    // Event handlers
    public onSatelliteAddedCallback(callback: (satellite: SatelliteEntity) => void): void {
        this.onSatelliteAdded = callback;
    }

    public onSatelliteRemovedCallback(callback: (satellite: SatelliteEntity) => void): void {
        this.onSatelliteRemoved = callback;
    }

    public onUpdateCallback(callback: (satellites: SatelliteEntity[]) => void): void {
        this.onUpdate = callback;
    }

    // Utility methods
    public getSatellitesInRange(position: THREE.Vector3, radius: number): SatelliteEntity[] {
        return this.getAllSatellites().filter(satellite => {
            return satellite.getPosition().distanceTo(position) <= radius;
        });
    }

    public getSatellitesByName(name: string): SatelliteEntity[] {
        return this.getAllSatellites().filter(satellite =>
            satellite.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    public getRandomSatellites(count: number): SatelliteEntity[] {
        const allSatellites = this.getAllSatellites();
        const shuffled = allSatellites.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    public addRandomSatellite(name?: string): SatelliteEntity | null {
        const satelliteName = name || `Random-Sat-${Math.floor(Math.random() * 1000)}`;
        const coe = OrbitalElementsGenerator.generateRandomCOE(satelliteName);

        // Add some styling options
        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return this.addSatellite(coe, {
            color,
            size: 0.01 + Math.random() * 0.005,
            showTrail: true,
            trailLength: 50 + Math.random() * 100,
            trailColor: color,
            showOrbit: false,
            orbitColor: color
        });
    }

    // Add a random satellite using TLE generation from COE
    public addRandomTLEFromCOE(name?: string, altitudeRange: [number, number] = [400, 800]): SatelliteEntity | null {
        const satelliteName = name || `Random-TLE-${Math.floor(Math.random() * 1000)}`;
        const tle = OrbitalElementsGenerator.generateRandomTLEFromCOE(satelliteName, altitudeRange);

        // Add some styling options
        const colors = [0xffff00, 0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff];
        const color = colors[Math.floor(Math.random() * colors.length)];

        return this.addSatellite(tle, {
            color,
            size: 0.01 + Math.random() * 0.005,
            showTrail: true,
            trailLength: 50 + Math.random() * 100,
            trailColor: color,
            showOrbit: false,
            orbitColor: color
        });
    }

    // Add a satellite using the exact valid TLE (for testing)
    public addValidSatellite(options?: Partial<SatelliteEntityOptions>): SatelliteEntity | null {
        const validSatrec = OrbitalElementsGenerator.createValidSatellite();

        const satelliteOptions: SatelliteEntityOptions = {
            name: 'DROID-001',
            satrec: validSatrec,
            ...options
        };

        const satellite = new SatelliteEntity(satelliteOptions);
        this.satellites.set(satellite.id, satellite);

        // Add trails and orbits to scene (but not individual meshes)
        const trail = satellite.getTrail();
        if (trail) {
            this.scene.add(trail);
        }
        const orbit = satellite.getOrbitVisualization();
        if (orbit) {
            this.scene.add(orbit);
        }

        // Update particle system
        this.updateParticleSystem();

        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satellite);
        }

        return satellite;
    }

    public getParticleSystem(): THREE.Points | null {
        return this.particleSystem;
    }

    public getParticleSystemInfo(): {
        particleCount: number;
        maxParticles: number;
        isOptimized: boolean
    } {
        return {
            particleCount: this.currentParticleCount,
            maxParticles: this.options.maxSatellites,
            isOptimized: this.particleSystem !== null
        };
    }

    public dispose(): void {
        this.clearAll();
        this.satellites.clear();

        // Clean up particle system
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.particleGeometry?.dispose();
            this.particleMaterial?.dispose();
            this.particleSystem = null;
            this.particleGeometry = null;
            this.particleMaterial = null;
        }
    }
}
