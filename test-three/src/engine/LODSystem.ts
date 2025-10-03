import * as THREE from 'three';

export interface LODConfig {
    lodDistances: number[];
    clusterDistance: number;
    maxVisibleSatellites: number;
    useInstancing: boolean;
}

export interface SatelliteLOD {
    id: string;
    position: THREE.Vector3;
    distance: number;
    lodLevel: number;
    isVisible: boolean;
    isInFrustum: boolean;
    isOccluded: boolean;
    clusterId?: string;
    lastUpdateTime: number;
    lastPosition: THREE.Vector3;
}

export class LODSystem {
    private config: LODConfig;
    private camera: THREE.Camera;
    private frustum: THREE.Frustum;
    private matrix: THREE.Matrix4;
    private satellites: Map<string, SatelliteLOD> = new Map();
    private clusters: Map<string, string[]> = new Map();
    // private lastUpdateTime: number = 0; // Removed unused variable
    private instancedMeshes: Map<number, THREE.InstancedMesh> = new Map();
    private pointClouds: Map<number, THREE.Points> = new Map();
    private lodGeometries: Map<number, THREE.SphereGeometry> = new Map();
    private materials: Map<number, THREE.MeshBasicMaterial> = new Map();
    private pointMaterials: Map<number, THREE.PointsMaterial> = new Map();
    private dummy: THREE.Object3D = new THREE.Object3D();

    constructor(camera: THREE.Camera, config: Partial<LODConfig> = {}) {
        this.camera = camera;
        this.frustum = new THREE.Frustum();
        this.matrix = new THREE.Matrix4();

        this.config = {
            lodDistances: [0.5, 2.0, 5.0, 10.0], // Distance thresholds for LOD levels
            clusterDistance: 1.0, // Distance to group satellites
            maxVisibleSatellites: 1000, // Maximum visible satellites
            useInstancing: true,
            ...config
        };

        this.createLODGeometries();
        this.createMaterials();
    }

    private createLODGeometries(): void {
        // High detail (8x8 sphere) for close satellites
        this.lodGeometries.set(0, new THREE.SphereGeometry(0.01, 8, 8));

        // Medium detail (4x4 sphere) for mid-range
        this.lodGeometries.set(1, new THREE.SphereGeometry(0.01, 4, 4));

        // Low detail (2x2 sphere) for far satellites
        this.lodGeometries.set(2, new THREE.SphereGeometry(0.01, 2, 2));

        // Point sprites for very distant objects
        this.lodGeometries.set(3, new THREE.SphereGeometry(0.005, 2, 2));
    }

    private createMaterials(): void {
        // Create palette texture for satellite colors
        const paletteTexture = this.createPaletteTexture();

        // Materials with palette texture for different LOD levels
        this.materials.set(0, new THREE.MeshBasicMaterial({
            map: paletteTexture,
            transparent: true,
            opacity: 0.9
        }));
        this.materials.set(1, new THREE.MeshBasicMaterial({
            map: paletteTexture,
            transparent: true,
            opacity: 0.8
        }));
        this.materials.set(2, new THREE.MeshBasicMaterial({
            map: paletteTexture,
            transparent: true,
            opacity: 0.6
        }));
        this.materials.set(3, new THREE.MeshBasicMaterial({
            map: paletteTexture,
            transparent: true,
            opacity: 0.4
        }));

        // Point materials for distant satellites with smaller sizes
        this.pointMaterials.set(0, new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            map: paletteTexture
        }));
        this.pointMaterials.set(1, new THREE.PointsMaterial({
            size: 0.04,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            map: paletteTexture
        }));
        this.pointMaterials.set(2, new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            map: paletteTexture
        }));
        this.pointMaterials.set(3, new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            transparent: true,
            opacity: 0.4,
            map: paletteTexture
        }));
    }

    private createPaletteTexture(): THREE.Texture {
        // Create a 256x1 texture with a color palette
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d')!;

        // Create a gradient with satellite-like colors
        const gradient = ctx.createLinearGradient(0, 0, 255, 0);
        gradient.addColorStop(0, '#ffff00'); // Yellow
        gradient.addColorStop(0.2, '#ff0000'); // Red
        gradient.addColorStop(0.4, '#00ff00'); // Green
        gradient.addColorStop(0.6, '#0000ff'); // Blue
        gradient.addColorStop(0.8, '#ff00ff'); // Magenta
        gradient.addColorStop(1, '#00ffff'); // Cyan

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        return texture;
    }

    public updateSatellite(id: string, position: THREE.Vector3): void {
        const distance = this.camera.position.distanceTo(position);
        const lodLevel = this.getLODLevel(distance);
        const isInFrustum = this.isInFrustum(position);
        const isOccluded = this.isOccluded(position);

        this.satellites.set(id, {
            id,
            position: position.clone(),
            distance,
            lodLevel,
            isVisible: isInFrustum && !isOccluded,
            isInFrustum,
            isOccluded,
            lastUpdateTime: performance.now(),
            lastPosition: position.clone()
        });
    }

    private getLODLevel(distance: number): number {
        for (let i = 0; i < this.config.lodDistances.length; i++) {
            if (distance <= this.config.lodDistances[i]) {
                return i;
            }
        }
        return this.config.lodDistances.length; // Point sprites for very distant
    }

    private isInFrustum(position: THREE.Vector3): boolean {
        this.matrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.matrix);
        return this.frustum.containsPoint(position);
    }

    private isOccluded(position: THREE.Vector3): boolean {
        // Enhanced occlusion test - check if satellite is behind Earth
        const earthCenter = new THREE.Vector3(0, 0, 0);
        const earthRadius = 1.0;

        // Calculate vector from camera to satellite
        const cameraToSatellite = position.clone().sub(this.camera.position);
        const cameraToEarth = earthCenter.clone().sub(this.camera.position);

        // Check if satellite is behind Earth from camera's perspective
        const dotProduct = cameraToSatellite.dot(cameraToEarth);

        // If dot product is positive, satellite is in the same direction as Earth
        if (dotProduct > 0) {
            // Check if satellite is actually behind Earth
            const distanceToEarth = cameraToEarth.length();
            const distanceToSatellite = cameraToSatellite.length();

            // If satellite is further than Earth, it might be occluded
            if (distanceToSatellite > distanceToEarth) {
                // More precise test: check if the line from camera to satellite intersects Earth
                const t = cameraToEarth.dot(cameraToSatellite) / cameraToSatellite.lengthSq();
                if (t > 0 && t < 1) {
                    const closestPoint = this.camera.position.clone().add(cameraToSatellite.multiplyScalar(t));
                    return closestPoint.length() < earthRadius;
                }
            }
        }

        return false;
    }

    public getVisibleSatellites(): SatelliteLOD[] {
        const visible = Array.from(this.satellites.values())
            .filter(sat => sat.isVisible)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, this.config.maxVisibleSatellites);

        return visible;
    }

    public getLODGroups(): Map<number, SatelliteLOD[]> {
        const groups = new Map<number, SatelliteLOD[]>();
        const visible = this.getVisibleSatellites();

        visible.forEach(sat => {
            if (!groups.has(sat.lodLevel)) {
                groups.set(sat.lodLevel, []);
            }
            groups.get(sat.lodLevel)!.push(sat);
        });

        return groups;
    }

    public createInstancedMesh(lodLevel: number, count: number): THREE.InstancedMesh | null {
        if (!this.config.useInstancing) return null;

        const geometry = this.lodGeometries.get(lodLevel);
        const material = this.materials.get(lodLevel);

        if (!geometry || !material) return null;

        const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        return instancedMesh;
    }

    public createInstancedBufferGeometry(_lodLevel: number, count: number): THREE.InstancedBufferGeometry | null {
        if (!this.config.useInstancing) return null;

        // Create a simple quad geometry for instanced rendering
        const geometry = new THREE.PlaneGeometry(1, 1);
        const instancedGeometry = new THREE.InstancedBufferGeometry();

        // Copy the base geometry attributes
        instancedGeometry.index = geometry.index;
        instancedGeometry.attributes = geometry.attributes;

        // Add instanced attributes for position, color, and size
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        instancedGeometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(positions, 3));
        instancedGeometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
        instancedGeometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(sizes, 1));

        instancedGeometry.instanceCount = count;

        return instancedGeometry;
    }

    public createPointCloud(lodLevel: number, count: number): THREE.Points | null {
        const material = this.pointMaterials.get(lodLevel);
        if (!material) return null;

        // Create efficient point cloud geometry similar to the provided example
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3); // x, y, z for each point
        const colors = new Float32Array(count * 3); // r, g, b for each point

        // Initialize with optimized color distribution
        const color = new THREE.Color();
        const n = 1000; // Spread factor
        const n2 = n / 2;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;

            // Generate positions in a more controlled manner
            const x = (Math.random() * n - n2) * 0.1; // Scale down for satellite positions
            const y = (Math.random() * n - n2) * 0.1;
            const z = (Math.random() * n - n2) * 0.1;

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            // Generate colors based on position (similar to the example)
            const vx = x / n + 0.5;
            const vy = y / n + 0.5;
            const vz = z / n + 0.5;

            color.setRGB(vx, vy, vz);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();

        const points = new THREE.Points(geometry, material);
        return points;
    }

    public updateInstancedMesh(instancedMesh: THREE.InstancedMesh, satellites: SatelliteLOD[]): void {
        if (!this.config.useInstancing) return;

        satellites.forEach((sat, index) => {
            if (index >= instancedMesh.count) return;

            this.dummy.position.copy(sat.position);
            this.dummy.updateMatrix();
            instancedMesh.setMatrixAt(index, this.dummy.matrix);
        });

        instancedMesh.instanceMatrix.needsUpdate = true;
    }

    public updateInstancedBufferGeometry(instancedGeometry: THREE.InstancedBufferGeometry, satellites: SatelliteLOD[]): void {
        const positions = instancedGeometry.getAttribute('instancePosition').array as Float32Array;
        const colors = instancedGeometry.getAttribute('instanceColor').array as Float32Array;
        const sizes = instancedGeometry.getAttribute('instanceSize').array as Float32Array;

        satellites.forEach((sat, index) => {
            const i = index * 3;

            // Set position
            positions[i] = sat.position.x;
            positions[i + 1] = sat.position.y;
            positions[i + 2] = sat.position.z;

            // Set color (random for now, could be based on satellite properties)
            colors[i] = Math.random();
            colors[i + 1] = Math.random();
            colors[i + 2] = Math.random();

            // Set size based on distance
            sizes[index] = Math.max(0.01, 0.1 / sat.distance);
        });

        instancedGeometry.getAttribute('instancePosition').needsUpdate = true;
        instancedGeometry.getAttribute('instanceColor').needsUpdate = true;
        instancedGeometry.getAttribute('instanceSize').needsUpdate = true;
    }

    public updatePointCloud(pointCloud: THREE.Points, satellites: SatelliteLOD[]): void {
        const positions = pointCloud.geometry.attributes.position.array as Float32Array;
        const colors = pointCloud.geometry.attributes.color?.array as Float32Array;

        satellites.forEach((sat, index) => {
            const i = index * 3;
            positions[i] = sat.position.x;
            positions[i + 1] = sat.position.y;
            positions[i + 2] = sat.position.z;

            // Update colors if they exist
            if (colors) {
                // Generate color based on satellite properties or use existing
                colors[i] = Math.random();     // r
                colors[i + 1] = Math.random(); // g
                colors[i + 2] = Math.random(); // b
            }
        });

        pointCloud.geometry.attributes.position.needsUpdate = true;
        if (colors) {
            pointCloud.geometry.attributes.color.needsUpdate = true;
        }
    }


    public removeSatellite(id: string): void {
        this.satellites.delete(id);
    }

    public clear(): void {
        this.satellites.clear();
        this.clusters.clear();
    }

    public dispose(): void {
        this.lodGeometries.forEach(geometry => geometry.dispose());
        this.materials.forEach(material => material.dispose());
        this.pointMaterials.forEach(material => material.dispose());

        this.instancedMeshes.forEach(mesh => {
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => mat.dispose());
            } else {
                mesh.material.dispose();
            }
        });

        this.pointClouds.forEach(points => {
            points.geometry.dispose();
            if (Array.isArray(points.material)) {
                points.material.forEach(mat => mat.dispose());
            } else {
                points.material.dispose();
            }
        });
    }

    public getConfig(): LODConfig {
        return { ...this.config };
    }

    public updateConfig(newConfig: Partial<LODConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    public shouldUsePointCloud(lodLevel: number): boolean {
        // Use point clouds for distant LOD levels (1, 2, and 3) for better performance
        return lodLevel >= 1;
    }

    public getRenderingMethod(lodLevel: number): 'instanced' | 'points' {
        return this.shouldUsePointCloud(lodLevel) ? 'points' : 'instanced';
    }

    public getClusterSize(lodLevel: number): number {
        // Larger clusters for lower LOD levels
        switch (lodLevel) {
            case 0: return 1;      // No clustering for highest detail
            case 1: return 2;     // Small clusters
            case 2: return 5;     // Medium clusters
            case 3: return 10;    // Large clusters
            default: return 1;
        }
    }
}
