// Earth celestial body

import * as THREE from "three";
import { CelestialBody, type CelestialBodyConfig } from "./CelestialBody";

export interface EarthConfig extends Partial<CelestialBodyConfig> {
    dayTextureUrl?: string;
    nightTextureUrl?: string;
    cloudsTextureUrl?: string;
    bumpMapUrl?: string;
    rotationSpeed?: number; // radians per millisecond
}

export class Earth extends CelestialBody {
    private rotationSpeed: number;
    private cloudsMesh: THREE.Mesh | null = null;

    constructor(config: EarthConfig = {}) {
        super({
            radius: 6371, // km
            segments: 64,
            color: 0x2233ff,
            position: { x: 0, y: 0, z: 0 },
            ...config,
        });

        // Earth rotates once per day (2π radians / 86400000 ms)
        this.rotationSpeed = config.rotationSpeed ?? (2 * Math.PI) / 86400000;
    }

    protected async createMaterial(): Promise<THREE.Material> {
        const config = this.config as EarthConfig;

        const materialConfig: THREE.MeshPhongMaterialParameters = {
            color: this.config.color ?? 0x2233ff,
            shininess: 5,
        };

        // Load day texture if provided
        if (config.dayTextureUrl) {
            materialConfig.map = await this.loadTexture(config.dayTextureUrl);
        }

        // Load night texture (emissive map) if provided
        if (config.nightTextureUrl) {
            materialConfig.emissiveMap = await this.loadTexture(config.nightTextureUrl);
            materialConfig.emissive = new THREE.Color(0xffffff);
            materialConfig.emissiveIntensity = 1.0;
        }

        // Load bump map if provided
        if (config.bumpMapUrl) {
            materialConfig.bumpMap = await this.loadTexture(config.bumpMapUrl);
            materialConfig.bumpScale = 0.05;
        }

        return new THREE.MeshPhongMaterial(materialConfig);
    }

    async create(engine: any): Promise<number> {
        const entity = await super.create(engine);

        // Create clouds layer if texture provided
        const config = this.config as EarthConfig;
        if (config.cloudsTextureUrl && this.mesh) {
            await this.createCloudsLayer(config.cloudsTextureUrl);
        }

        return entity;
    }

    private async createCloudsLayer(textureUrl: string): Promise<void> {
        if (!this.mesh) return;

        const cloudsGeometry = new THREE.SphereGeometry(
            this.config.radius * 1.01, // Slightly larger than Earth
            this.config.segments,
            this.config.segments
        );

        const cloudsTexture = await this.loadTexture(textureUrl);
        const cloudsMaterial = new THREE.MeshPhongMaterial({
            map: cloudsTexture,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
        });

        this.cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
        this.mesh.add(this.cloudsMesh);
    }

    /**
     * Update Earth's rotation based on elapsed time
     */
    updateRotation(deltaTime?: number): void {
        if (!this.mesh) return;

        if (deltaTime !== undefined) {
            // Rotate around Y axis (polar axis)
            this.mesh.rotation.y += this.rotationSpeed * deltaTime;

            // Also rotate clouds slightly faster for effect
            if (this.cloudsMesh) {
                this.cloudsMesh.rotation.y += this.rotationSpeed * deltaTime * 1.2;
            }
        }
    }

    /**
     * Set rotation speed
     */
    setRotationSpeed(speed: number): void {
        this.rotationSpeed = speed;
    }

    destroy(): void {
        if (this.cloudsMesh) {
            this.cloudsMesh.geometry.dispose();
            if (Array.isArray(this.cloudsMesh.material)) {
                this.cloudsMesh.material.forEach((mat) => mat.dispose());
            } else {
                this.cloudsMesh.material.dispose();
            }
            this.cloudsMesh = null;
        }

        super.destroy();
    }
}
