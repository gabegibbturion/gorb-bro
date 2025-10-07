import * as THREE from 'three';

export class SatPoints extends THREE.Points {
    public satPositionAttribute: THREE.BufferAttribute;
    public satArray: Float32Array;
    public satColorAttribute: THREE.BufferAttribute;
    public satColor: Float32Array;
    public satVisibilityAttribute: THREE.BufferAttribute;
    public visibilityArray: Float32Array;
    public satSizeAttribute: THREE.BufferAttribute;
    public sizeArray: Float32Array;
    public geo: THREE.BufferGeometry;

    constructor(N: number, sprite: THREE.Texture) {
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
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            map: sprite,
            size: 0.16,
            vertexColors: true,
            transparent: true,
            depthWrite: false
        });

        // Custom shader modification
        material.onBeforeCompile = function (shader: any) {
            shader.vertexShader = `
                attribute float sizes;
                attribute float visibility;
                varying float vVisible;
                ${shader.vertexShader}`
                .replace(
                    `gl_PointSize = size;`,
                    `gl_PointSize = size * sizes;
                vVisible = visibility;
                `
                );
            shader.fragmentShader = `
                varying float vVisible;
                ${shader.fragmentShader}`
                .replace(
                    `#include <clipping_planes_fragment>`,
                    `
                if (vVisible < 0.5) discard;
                #include <clipping_planes_fragment>`
                );
        };

        super(geometry, material);
        this.geo = geometry;
        this.satPositionAttribute = this.geo.getAttribute('position') as THREE.BufferAttribute;
        this.satArray = this.satPositionAttribute.array as Float32Array;
        this.satColorAttribute = this.geo.getAttribute('color') as THREE.BufferAttribute;
        this.satColor = this.satColorAttribute.array as Float32Array;

        this.geo.setAttribute("visibility", new THREE.Float32BufferAttribute(visibility, 1));
        this.satVisibilityAttribute = this.geo.getAttribute('visibility') as THREE.BufferAttribute;
        this.visibilityArray = this.satVisibilityAttribute.array as Float32Array;

        this.geo.setAttribute("sizes", new THREE.Float32BufferAttribute(sizes, 1));
        this.satSizeAttribute = this.geo.getAttribute('sizes') as THREE.BufferAttribute;
        this.sizeArray = this.satSizeAttribute.array as Float32Array;
    }
}
