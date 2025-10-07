import * as THREE from 'three';

export class DynOrbits extends THREE.Line {
    public N: number;
    public positions: Float32Array;

    constructor(N: number, color: number = 0xffb6c1) {
        const geomOrbit = new THREE.BufferGeometry();
        geomOrbit.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
        const materialOrbit = new THREE.LineBasicMaterial({ color: color });

        super(geomOrbit, materialOrbit);

        this.N = N;
        this.positions = this.geometry.attributes.position.array as Float32Array;
    }

    setLine(data: number[][]) {
        for (let i = 0; i < this.N; i++) {
            const idx = i * 3;
            this.positions[idx] = data[i][0];
            this.positions[idx + 1] = data[i][1];
            this.positions[idx + 2] = data[i][2];
        }
        this.geometry.attributes.position.needsUpdate = true;
    }
}
