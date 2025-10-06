import * as THREE from "three";

/**
 * SatPoints - A Three.js Points-based system for rendering individual satellites as circular points
 *
 * This class extends THREE.Points and provides:
 * - Individual satellite rendering with custom shaders for circular points
 * - Per-satellite visibility, color, and size control
 * - Efficient batch updates for large numbers of satellites
 * - Custom fragment shader that creates smooth circular points without requiring textures
 *
 * Usage example:
 * ```typescript
 * // Create SatPoints system
 * const satPoints = new SatPoints(1000); // 1000 max satellites
 * scene.add(satPoints);
 *
 * // Update satellite data
 * satPoints.updateSatellites({
 *   positions: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
 *   colors: [0xff0000, 0x00ff00],
 *   visibility: [1, 1],
 *   sizes: [1, 1.5]
 * });
 * ```
 */
export class SatPoints extends THREE.Points {
    public geo: THREE.BufferGeometry;
    public satPositionAttribute: THREE.BufferAttribute;
    public satColorAttribute: THREE.BufferAttribute;
    public satVisibilityAttribute: THREE.BufferAttribute;
    public satSizeAttribute: THREE.BufferAttribute;

    constructor(N: number, sprite?: THREE.Texture) {
        const colors: number[] = [];
        const vertices: number[] = [];
        const visibility: number[] = [];
        const sizes: number[] = [];

        for (let i = 0; i < N; i++) {
            vertices.push(0, 0, 0);
            colors.push(0, 0, 0);
            visibility.push(1);
            sizes.push(1);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            map: sprite,
            size: 0.06, // Match whatsOverHead size
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            onBeforeCompile: function (shader: any) {
                shader.vertexShader = `
                attribute float sizes;
                attribute float visibility;
                varying float vVisible;
                ${shader.vertexShader}`.replace(
                    `gl_PointSize = size;`,
                    `gl_PointSize = size * sizes;
                    vVisible = visibility;
                    `
                );
                shader.fragmentShader = `
                varying float vVisible;
                ${shader.fragmentShader}`.replace(
                    `#include <clipping_planes_fragment>`,
                    `
                    if (vVisible < 0.5) discard;
                    #include <clipping_planes_fragment>`
                );
            },
        } as any);

        super(geometry, material);

        this.geo = geometry;
        this.satPositionAttribute = this.geo.getAttribute("position") as THREE.BufferAttribute;
        this.satColorAttribute = this.geo.getAttribute("color") as THREE.BufferAttribute;

        this.geo.setAttribute("visibility", new THREE.Float32BufferAttribute(visibility, 1));
        this.satVisibilityAttribute = this.geo.getAttribute("visibility") as THREE.BufferAttribute;

        this.geo.setAttribute("sizes", new THREE.Float32BufferAttribute(sizes, 1));
        this.satSizeAttribute = this.geo.getAttribute("sizes") as THREE.BufferAttribute;
    }

    /**
     * Direct buffer access for maximum performance (like whatsOverHead)
     * These are the core arrays that can be manipulated directly
     */
    public get satArray(): Float32Array {
        return this.satPositionAttribute.array as Float32Array;
    }

    public get satColor(): Float32Array {
        return this.satColorAttribute.array as Float32Array;
    }

    public get visibilityArray(): Float32Array {
        return this.satVisibilityAttribute.array as Float32Array;
    }

    public get sizeArray(): Float32Array {
        return this.satSizeAttribute.array as Float32Array;
    }

    /**
     * Mark attributes as needing update (like whatsOverHead)
     */
    public markAttributesForUpdate(): void {
        this.satPositionAttribute.needsUpdate = true;
        this.satColorAttribute.needsUpdate = true;
        this.satVisibilityAttribute.needsUpdate = true;
        this.satSizeAttribute.needsUpdate = true;
    }

    /**
     * Set the base size for all circles
     */
    public setBaseSize(size: number): void {
        (this.material as THREE.PointsMaterial).size = size;
    }

    /**
     * Get the current base size
     */
    public getBaseSize(): number {
        return (this.material as THREE.PointsMaterial).size;
    }
}
