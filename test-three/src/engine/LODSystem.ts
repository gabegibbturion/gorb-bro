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
    private lastUpdateTime: number = 0;
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
        // Simple materials for different LOD levels
        this.materials.set(0, new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        this.materials.set(1, new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        this.materials.set(2, new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        this.materials.set(3, new THREE.MeshBasicMaterial({ color: 0xffff00 }));

        // Point materials for distant satellites with smaller sizes
        this.pointMaterials.set(0, new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        }));
        this.pointMaterials.set(1, new THREE.PointsMaterial({
            size: 0.04,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        }));
        this.pointMaterials.set(2, new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true,
            transparent: true,
            opacity: 0.6
        }));
        this.pointMaterials.set(3, new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            transparent: true,
            opacity: 0.4
        }));
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
        // Simple occlusion test - check if satellite is behind Earth
        const earthCenter = new THREE.Vector3(0, 0, 0);
        const earthRadius = 1.0;

        const direction = position.clone().sub(earthCenter).normalize();
        const cameraDirection = this.camera.position.clone().sub(earthCenter).normalize();

        // If satellite is on the opposite side of Earth from camera
        return direction.dot(cameraDirection) < 0 && position.length() > earthRadius;
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

    public createInstancedBufferGeometry(lodLevel: number, count: number): THREE.InstancedBufferGeometry | null {
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

        // Create buffer geometry for points with positions and colors
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3); // x, y, z for each point
        const colors = new Float32Array(count * 3); // r, g, b for each point

        // Initialize with random colors
        for (let i = 0; i < count; i++) {
            colors[i * 3] = Math.random();     // r
            colors[i * 3 + 1] = Math.random(); // g
            colors[i * 3 + 2] = Math.random(); // b
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
