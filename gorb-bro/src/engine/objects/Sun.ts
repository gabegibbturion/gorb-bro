// Sun celestial body

import * as THREE from "three";
import * as SunCalc from "suncalc";
import { CelestialBody, type CelestialBodyConfig } from "./CelestialBody";
import { ReferenceFrame } from "../types";

export interface SunConfig extends Partial<CelestialBodyConfig> {
    autoPosition?: boolean; // Automatically position based on current time
    useRealDistance?: boolean; // Use actual sun distance (149.6 million km)
    visualDistance?: number; // Distance for visualization (if not using real distance)
}

export class Sun extends CelestialBody {
    private autoPosition: boolean;
    private visualDistance: number;

    constructor(config: SunConfig = {}) {
        super({
            radius: 695700, // km (actual sun radius)
            segments: 32,
            color: 0xffff00,
            emissive: 0xffaa00,
            emissiveIntensity: 1.0,
            frame: ReferenceFrame.ECI,
            ...config,
        });

        this.autoPosition = config.autoPosition ?? true;
        this.visualDistance = config.useRealDistance ? 149600000 : config.visualDistance ?? 200000;
    }

    protected async createMaterial(): Promise<THREE.Material> {
        const materialConfig: THREE.MeshBasicMaterialParameters = {
            color: this.config.color ?? 0xffff00,
        };

        if (this.config.textureUrl) {
            materialConfig.map = await this.loadTexture(this.config.textureUrl);
        }

        // Sun is self-illuminating, use MeshBasicMaterial
        return new THREE.MeshBasicMaterial(materialConfig);
    }

    async create(engine: any): Promise<number> {
        const entity = await super.create(engine);

        // Position sun if auto-positioning is enabled
        if (this.autoPosition) {
            this.updateSunPosition();
        }

        // Add light source at sun's position
        this.addSunLight();

        return entity;
    }

    /**
     * Update sun position based on current time
     */
    updateSunPosition(time?: Date): void {
        if (!this.engine) return;

        const date = time ?? new Date();

        // Get sun position using SunCalc
        // Note: SunCalc gives azimuth and altitude from Earth's perspective
        // We need to convert this to 3D coordinates

        // For simplicity, we'll use a fixed position relative to Earth
        // In a real implementation, you'd want to use proper astronomical calculations
        const sunPosition = SunCalc.getPosition(date, 0, 0); // Latitude, Longitude

        // Convert to Cartesian coordinates
        // Azimuth is measured from south, going west
        // Altitude is angle above horizon
        const azimuth = sunPosition.azimuth;
        const altitude = sunPosition.altitude;

        const x = this.visualDistance * Math.cos(altitude) * Math.sin(azimuth);
        const y = this.visualDistance * Math.sin(altitude);
        const z = this.visualDistance * Math.cos(altitude) * Math.cos(azimuth);

        this.updatePosition(x, y, z);
    }

    /**
     * Add directional light representing sunlight
     */
    private addSunLight(): void {
        if (!this.mesh || !this.engine) return;

        const renderingService = this.engine.getService("rendering");
        if (!renderingService || !("addObject" in renderingService)) return;

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.copy(this.mesh.position);
        sunLight.castShadow = true;

        (renderingService as any).addObject(sunLight);
    }

    /**
     * Get sun position for a specific time and location
     */
    static getSunPosition(date: Date, latitude: number, longitude: number): { azimuth: number; altitude: number } {
        return SunCalc.getPosition(date, latitude, longitude);
    }

    /**
     * Get sunrise and sunset times
     */
    static getSunTimes(date: Date, latitude: number, longitude: number) {
        return SunCalc.getTimes(date, latitude, longitude);
    }
}
