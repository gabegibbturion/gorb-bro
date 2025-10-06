import * as THREE from "three";
import { TileProvider } from "./TileProvider";

export interface TileGlobeOptions {
    radius?: number;
    segments?: number;
    tileProvider?: TileProvider;
    customTileUrl?: string;
    enableBumpMap?: boolean;
    bumpScale?: number;
    roughness?: number;
    metalness?: number;
}

export class TileGlobe {
    private group: THREE.Group;
    private mesh: THREE.Mesh;
    private material: THREE.MeshStandardMaterial;
    private options: Required<TileGlobeOptions>;
    private loader: THREE.TextureLoader;
    private camera: THREE.Camera | null = null;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tileCache: Map<string, HTMLImageElement> = new Map();
    private isLoadingTexture: boolean = false;
    private currentZoom: number = 2;
    private tilesPerRow: number = 4; // 2^zoom

    constructor(options: TileGlobeOptions = {}) {
        this.options = {
            radius: 1.0,
            segments: 64,
            tileProvider: TileProvider.OPENSTREETMAP,
            customTileUrl: "",
            enableBumpMap: true,
            bumpScale: 0.02,
            roughness: 0.7,
            metalness: 0.1,
            ...options,
        };

        this.loader = new THREE.TextureLoader();
        this.group = new THREE.Group();
        this.material = new THREE.MeshStandardMaterial();

        // Create canvas for stitching tiles
        this.canvas = document.createElement("canvas");
        this.canvas.width = 2048;
        this.canvas.height = 1024;
        this.ctx = this.canvas.getContext("2d")!;

        this.createGeometry();
        this.createMaterial();
        this.createMesh();
        this.loadAllTiles();
    }

    private createGeometry(): void {
        const geometry = new THREE.SphereGeometry(this.options.radius, this.options.segments, this.options.segments);
        this.group.userData.geometry = geometry;
    }

    private createMaterial(): void {
        this.material = new THREE.MeshStandardMaterial({
            roughness: this.options.roughness,
            metalness: this.options.metalness,
            side: THREE.FrontSide,
        });

        // Create initial placeholder texture
        this.createPlaceholderTexture();
    }

    private createMesh(): void {
        const geometry = this.group.userData.geometry;
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
        this.mesh.userData.isTileGlobe = true;

        this.group.add(this.mesh);
    }

    private getTileProviderUrl(): string {
        switch (this.options.tileProvider) {
            case TileProvider.OPENSTREETMAP:
                return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
            case TileProvider.CARTO:
                return "https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png";
            case TileProvider.STAMEN:
                return "https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png";
            case TileProvider.ESRI:
                return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
            case TileProvider.NASA:
                return "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/2013-12-01/EPSG4326_500m/{z}/{y}/{x}.jpeg";
            case TileProvider.CUSTOM:
                return this.options.customTileUrl || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
            default:
                return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
        }
    }

    private createPlaceholderTexture(): void {
        // Fill with blue (ocean color) initially
        this.ctx.fillStyle = "#1a5f7a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        this.material.map = texture;
        this.material.needsUpdate = true;
    }

    private async loadAllTiles(): Promise<void> {
        if (this.isLoadingTexture) return;
        this.isLoadingTexture = true;

        const zoom = this.currentZoom;
        this.tilesPerRow = Math.pow(2, zoom);
        const tilesPerCol = Math.pow(2, zoom - 1);

        const tileUrl = this.getTileProviderUrl();
        const loadedTiles: Array<{ x: number; y: number; image: HTMLImageElement }> = [];

        console.log(`Loading ${this.tilesPerRow * tilesPerCol} tiles at zoom level ${zoom}`);

        // Load all tiles for this zoom level
        const promises: Promise<void>[] = [];

        for (let y = 0; y < tilesPerCol; y++) {
            for (let x = 0; x < this.tilesPerRow; x++) {
                const tileKey = `${zoom}/${x}/${y}`;

                // Check cache first
                if (this.tileCache.has(tileKey)) {
                    loadedTiles.push({ x, y, image: this.tileCache.get(tileKey)! });
                    continue;
                }

                const url = tileUrl
                    .replace("{z}", zoom.toString())
                    .replace("{x}", x.toString())
                    .replace("{y}", y.toString())
                    .replace("{s}", ["a", "b", "c"][Math.floor(Math.random() * 3)]); // For servers with subdomains

                const promise = new Promise<void>((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";

                    img.onload = () => {
                        this.tileCache.set(tileKey, img);
                        loadedTiles.push({ x, y, image: img });
                        resolve();
                    };

                    img.onerror = () => {
                        console.warn(`Failed to load tile ${tileKey}`);
                        resolve(); // Continue even if tile fails
                    };

                    img.src = url;
                });

                promises.push(promise);
            }
        }

        // Wait for all tiles to load
        await Promise.all(promises);

        // Stitch tiles onto canvas
        this.stitchTiles(loadedTiles, zoom);

        this.isLoadingTexture = false;
        console.log(`Loaded ${loadedTiles.length} tiles successfully`);
    }

    private stitchTiles(tiles: Array<{ x: number; y: number; image: HTMLImageElement }>, zoom: number): void {
        const tilesPerRow = Math.pow(2, zoom);
        const tilesPerCol = Math.pow(2, zoom - 1);
        const tileWidth = this.canvas.width / tilesPerRow;
        const tileHeight = this.canvas.height / tilesPerCol;

        // Clear canvas
        this.ctx.fillStyle = "#1a5f7a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw each tile
        tiles.forEach(({ x, y, image }) => {
            const canvasX = x * tileWidth;
            const canvasY = y * tileHeight;

            try {
                this.ctx.drawImage(image, canvasX, canvasY, tileWidth, tileHeight);
            } catch (error) {
                console.warn(`Failed to draw tile ${x},${y}:`, error);
            }
        });

        // Update texture
        if (this.material.map) {
            (this.material.map as THREE.CanvasTexture).needsUpdate = true;
        } else {
            const texture = new THREE.CanvasTexture(this.canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            this.material.map = texture;
            this.material.needsUpdate = true;
        }
    }

    public async setTileProvider(provider: TileProvider, customUrl?: string): Promise<void> {
        this.options.tileProvider = provider;
        if (customUrl && provider === TileProvider.CUSTOM) {
            this.options.customTileUrl = customUrl;
        }

        // Clear cache and reload
        this.tileCache.clear();
        await this.loadAllTiles();
    }

    public async setZoomLevel(zoom: number): Promise<void> {
        // Clamp zoom between 0 and 4 for performance
        this.currentZoom = Math.max(0, Math.min(4, zoom));

        // Reload tiles at new zoom level
        await this.loadAllTiles();
    }

    public setCamera(camera: THREE.Camera): void {
        this.camera = camera;
    }

    public async forceLoadTiles(): Promise<void> {
        await this.loadAllTiles();
    }

    public getTileProvider(): TileProvider {
        return this.options.tileProvider;
    }

    public setVisible(visible: boolean): void {
        this.group.visible = visible;
    }

    public getVisible(): boolean {
        return this.group.visible;
    }

    public setPosition(x: number, y: number, z: number): void {
        this.group.position.set(x, y, z);
    }

    public getPosition(): THREE.Vector3 {
        return this.group.position.clone();
    }

    public setRotation(x: number, y: number, z: number): void {
        this.group.rotation.set(x, y, z);
    }

    public getRotation(): THREE.Euler {
        return this.group.rotation.clone();
    }

    public setScale(scale: number): void {
        this.group.scale.setScalar(scale);
    }

    public getScale(): number {
        return this.group.scale.x;
    }

    public getGroup(): THREE.Group {
        return this.group;
    }

    public getMesh(): THREE.Mesh {
        return this.mesh;
    }

    public getMaterial(): THREE.MeshStandardMaterial {
        return this.material;
    }

    public update(_deltaTime: number): void {
        // Could implement dynamic LOD based on camera distance
    }

    public dispose(): void {
        // Clear cache
        this.tileCache.clear();

        // Dispose of material and texture
        if (this.material.map) {
            this.material.map.dispose();
        }
        this.material.dispose();

        // Dispose of geometry
        if (this.group.userData.geometry) {
            this.group.userData.geometry.dispose();
        }

        // Remove from parent
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }

    public getAvailableTileProviders(): { value: TileProvider; label: string; description: string }[] {
        return [
            {
                value: TileProvider.OPENSTREETMAP,
                label: "OpenStreetMap",
                description: "Free, open-source map tiles",
            },
            {
                value: TileProvider.CARTO,
                label: "CartoDB",
                description: "Light, clean map style",
            },
            {
                value: TileProvider.STAMEN,
                label: "Stamen Terrain",
                description: "Terrain-focused map tiles",
            },
            {
                value: TileProvider.ESRI,
                label: "Esri World Imagery",
                description: "Satellite imagery from Esri",
            },
            {
                value: TileProvider.NASA,
                label: "NASA Blue Marble",
                description: "NASA's Blue Marble imagery",
            },
            {
                value: TileProvider.CUSTOM,
                label: "Custom",
                description: "Use your own tile server",
            },
        ];
    }

    public getCurrentZoom(): number {
        return this.currentZoom;
    }
}
