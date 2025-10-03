import * as THREE from 'three';
import { LODSystem } from './LODSystem';
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
    private updateTimer: number | null = null;
    private currentTime: Date = new Date();
    private isUpdating: boolean = false;
    private lodSystem: LODSystem | null = null;

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

    public initializeLOD(camera: THREE.Camera, config?: Partial<import('./LODSystem').LODConfig>): void {
        this.lodSystem = new LODSystem(camera, config);
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

        // Add to scene
        this.scene.add(satellite.getMesh());
        const trail = satellite.getTrail();
        if (trail) {
            this.scene.add(trail);
        }
        const orbit = satellite.getOrbitVisualization();
        if (orbit) {
            this.scene.add(orbit);
        }


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

        // Remove from scene
        this.scene.remove(satellite.getMesh());
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

            // Update LOD system if available
            if (this.lodSystem) {
                this.lodSystem.updateSatellite(satellite.id, satellite.getPosition());
            }
        });

        // Apply LOD visibility if system is available
        if (this.lodSystem) {
            this.applyLODVisibility();
        }

        // Trigger update callback
        if (this.onUpdate) {
            this.onUpdate(this.getAllSatellites());
        }

        this.isUpdating = false;
    }

    private applyLODVisibility(): void {
        if (!this.lodSystem) return;

        const visibleSatellites = this.lodSystem.getVisibleSatellites();
        const lodGroups = this.lodSystem.getLODGroups();

        // Hide all satellites first
        this.satellites.forEach(satellite => {
            satellite.setVisible(false);
        });

        // Process each LOD group for efficient rendering
        lodGroups.forEach((satellites, lodLevel) => {
            if (satellites.length === 0) return;

            // Use instanced rendering for better performance
            if (this.lodSystem!.getRenderingMethod(lodLevel) === 'instanced') {
                this.renderInstancedGroup(satellites, lodLevel);
            } else {
                // Use point cloud for distant satellites
                this.renderPointCloudGroup(satellites, lodLevel);
            }
        });

        // Show only visible satellites
        visibleSatellites.forEach(lodData => {
            const satellite = this.satellites.get(lodData.id);
            if (satellite) {
                satellite.setVisible(true);
                satellite.setLODData(lodData);
            }
        });
    }

    private renderInstancedGroup(satellites: any[], lodLevel: number): void {
        // Create or update instanced mesh for this LOD level
        const instancedMesh = this.lodSystem!.createInstancedMesh(lodLevel, satellites.length);
        if (instancedMesh) {
            this.lodSystem!.updateInstancedMesh(instancedMesh, satellites);
        }
    }

    private renderPointCloudGroup(satellites: any[], lodLevel: number): void {
        // Create or update point cloud for this LOD level
        const pointCloud = this.lodSystem!.createPointCloud(lodLevel, satellites.length);
        if (pointCloud) {
            this.lodSystem!.updatePointCloud(pointCloud, satellites);
        }
    }

    public startAutoUpdate(): void {
        if (this.updateTimer) return;

        this.updateTimer = window.setInterval(() => {
            this.update(new Date());
        }, this.options.updateInterval);
    }

    public stopAutoUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    public setTime(time: Date): void {
        this.currentTime = time;
        this.update(time);
    }

    public getCurrentTime(): Date {
        return new Date(this.currentTime);
    }

    public setUpdateInterval(interval: number): void {
        this.options.updateInterval = interval;
        if (this.updateTimer) {
            this.stopAutoUpdate();
            this.startAutoUpdate();
        }
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

        // Add to scene
        this.scene.add(satellite.getMesh());
        const trail = satellite.getTrail();
        if (trail) {
            this.scene.add(trail);
        }
        const orbit = satellite.getOrbitVisualization();
        if (orbit) {
            this.scene.add(orbit);
        }


        // Trigger callback
        if (this.onSatelliteAdded) {
            this.onSatelliteAdded(satellite);
        }

        return satellite;
    }

    public dispose(): void {
        this.stopAutoUpdate();
        this.clearAll();
        this.satellites.clear();

        if (this.lodSystem) {
            this.lodSystem.dispose();
            this.lodSystem = null;
        }
    }
}
