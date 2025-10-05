import * as THREE from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import type { SatelliteEntity } from "./SatelliteEntity";

export interface GPUSatelliteSystemOptions {
    maxSatellites: number;
    textureSize: number;
    enableOcclusionCulling: boolean;
}

export class GPUSatelliteSystem {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private options: GPUSatelliteSystemOptions;

    // GPU Computation
    private gpuCompute: GPUComputationRenderer | null = null;
    private positionVariable: any = null;
    private velocityVariable: any = null;
    private colorVariable: any = null;

    // Shader uniforms
    private positionUniforms: any = null;
    private velocityUniforms: any = null;
    private colorUniforms: any = null;
    private satelliteUniforms: any = null;

    // Rendering
    private satelliteMesh: THREE.Mesh | null = null;
    private satelliteGeometry: THREE.BufferGeometry | null = null;
    private satelliteMaterial: THREE.ShaderMaterial | null = null;

    // State
    private currentTime: Date = new Date();
    private satellites: Map<string, SatelliteEntity> = new Map();

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options: GPUSatelliteSystemOptions) {
        this.renderer = renderer;
        this.scene = scene;
        this.options = options;

        this.initGPUComputation();
        this.initSatelliteRendering();
    }

    private initGPUComputation(): void {
        console.log('Initializing GPU computation system...');

        try {
            const textureSize = this.options.textureSize;
            console.log('Creating GPU computation renderer with size:', textureSize);

            this.gpuCompute = new GPUComputationRenderer(textureSize, textureSize, this.renderer);

            if (!this.gpuCompute) {
                console.error('Failed to create GPU computation renderer');
                return;
            }

            console.log('Creating textures...');

            // Create textures for position, velocity, and color data
            const dtPosition = this.gpuCompute.createTexture();
            const dtVelocity = this.gpuCompute.createTexture();
            const dtColor = this.gpuCompute.createTexture();

            if (!dtPosition || !dtVelocity || !dtColor) {
                console.error('Failed to create GPU textures');
                this.gpuCompute = null;
                return;
            }

            console.log('Filling textures...');
            this.fillPositionTexture(dtPosition);
            this.fillVelocityTexture(dtVelocity);
            this.fillColorTexture(dtColor);

            console.log('Creating computation variables...');

            // Create computation variables
            this.positionVariable = this.gpuCompute.addVariable(
                'texturePosition',
                this.getPositionShader(),
                dtPosition
            );

            this.velocityVariable = this.gpuCompute.addVariable(
                'textureVelocity',
                this.getVelocityShader(),
                dtVelocity
            );

            this.colorVariable = this.gpuCompute.addVariable(
                'textureColor',
                this.getColorShader(),
                dtColor
            );

            if (!this.positionVariable || !this.velocityVariable || !this.colorVariable) {
                console.error('Failed to create GPU variables');
                this.gpuCompute = null;
                return;
            }

            console.log('Setting dependencies...');

            // Set dependencies
            this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
            this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
            this.gpuCompute.setVariableDependencies(this.colorVariable, [this.colorVariable]);

            console.log('Getting uniforms...');

            // Get uniforms
            this.positionUniforms = this.positionVariable.material.uniforms;
            this.velocityUniforms = this.velocityVariable.material.uniforms;
            this.colorUniforms = this.colorVariable.material.uniforms;

            if (!this.positionUniforms || !this.velocityUniforms || !this.colorUniforms) {
                console.error('Failed to get GPU uniforms');
                this.gpuCompute = null;
                return;
            }

            console.log('Initializing uniforms...');

            // Initialize uniforms
            this.positionUniforms['time'] = { value: 0.0 };
            this.positionUniforms['delta'] = { value: 0.0 };

            this.velocityUniforms['time'] = { value: 0.0 };
            this.velocityUniforms['delta'] = { value: 0.0 };
            this.velocityUniforms['enableOcclusion'] = { value: this.options.enableOcclusionCulling ? 1.0 : 0.0 };

            this.colorUniforms['time'] = { value: 0.0 };
            this.colorUniforms['delta'] = { value: 0.0 };

            console.log('Initializing GPU computation...');

            // Initialize GPU computation
            const error = this.gpuCompute.init();
            if (error !== null) {
                console.error('GPU Computation initialization error:', error);
                this.gpuCompute = null;
                return;
            }

            console.log('GPU system initialized successfully');
        } catch (error) {
            console.error('Failed to initialize GPU system:', error);
            this.gpuCompute = null;
        }
    }

    private initSatelliteRendering(): void {
        // Create satellite geometry (simple cube for each satellite)
        this.satelliteGeometry = new THREE.BufferGeometry();

        const vertices = new Float32Array([
            -0.5, -0.5, -0.5,
            0.5, -0.5, -0.5,
            0.5, 0.5, -0.5,
            -0.5, 0.5, -0.5,
            -0.5, -0.5, 0.5,
            0.5, -0.5, 0.5,
            0.5, 0.5, 0.5,
            -0.5, 0.5, 0.5
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3, // front
            4, 7, 6, 4, 6, 5, // back
            0, 4, 5, 0, 5, 1, // bottom
            2, 6, 7, 2, 7, 3, // top
            0, 3, 7, 0, 7, 4, // left
            1, 5, 6, 1, 6, 2  // right
        ]);

        this.satelliteGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        this.satelliteGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Create satellite material with GPU textures
        this.satelliteUniforms = {
            'texturePosition': { value: null },
            'textureVelocity': { value: null },
            'textureColor': { value: null },
            'time': { value: 0.0 },
            'delta': { value: 0.0 }
        };

        this.satelliteMaterial = new THREE.ShaderMaterial({
            uniforms: this.satelliteUniforms,
            vertexShader: this.getSatelliteVertexShader(),
            fragmentShader: this.getSatelliteFragmentShader(),
            side: THREE.DoubleSide
        });

        // Create instanced mesh
        const maxInstances = this.options.textureSize * this.options.textureSize;
        this.satelliteGeometry.setAttribute('instanceId', new THREE.InstancedBufferAttribute(
            new Float32Array(maxInstances), 1
        ));

        this.satelliteMesh = new THREE.InstancedMesh(
            this.satelliteGeometry,
            this.satelliteMaterial,
            maxInstances
        );

        this.scene.add(this.satelliteMesh);
    }

    private fillPositionTexture(texture: THREE.DataTexture): void {
        const array = texture.image.data;
        const textureSize = this.options.textureSize;
        const maxSatellites = this.options.maxSatellites;

        for (let i = 0; i < textureSize * textureSize; i++) {
            const index = i * 4;

            if (i < maxSatellites) {
                // Initialize with random positions
                array[index + 0] = (Math.random() - 0.5) * 10; // x
                array[index + 1] = (Math.random() - 0.5) * 10; // y
                array[index + 2] = (Math.random() - 0.5) * 10; // z
                array[index + 3] = 1.0; // w
            } else {
                // Hide unused instances
                array[index + 0] = 10000;
                array[index + 1] = 10000;
                array[index + 2] = 10000;
                array[index + 3] = 0.0;
            }
        }
    }

    private fillVelocityTexture(texture: THREE.DataTexture): void {
        const array = texture.image.data;
        const textureSize = this.options.textureSize;
        const maxSatellites = this.options.maxSatellites;

        for (let i = 0; i < textureSize * textureSize; i++) {
            const index = i * 4;

            if (i < maxSatellites) {
                // Initialize with zero velocity
                array[index + 0] = 0.0; // vx
                array[index + 1] = 0.0; // vy
                array[index + 2] = 0.0; // vz
                array[index + 3] = 1.0; // w
            } else {
                array[index + 0] = 0.0;
                array[index + 1] = 0.0;
                array[index + 2] = 0.0;
                array[index + 3] = 0.0;
            }
        }
    }

    private fillColorTexture(texture: THREE.DataTexture): void {
        const array = texture.image.data;
        const textureSize = this.options.textureSize;
        const maxSatellites = this.options.maxSatellites;

        for (let i = 0; i < textureSize * textureSize; i++) {
            const index = i * 4;

            if (i < maxSatellites) {
                // Initialize with random colors
                array[index + 0] = Math.random(); // r
                array[index + 1] = Math.random(); // g
                array[index + 2] = Math.random(); // b
                array[index + 3] = 1.0; // a
            } else {
                array[index + 0] = 0.0;
                array[index + 1] = 0.0;
                array[index + 2] = 0.0;
                array[index + 3] = 0.0;
            }
        }
    }

    public updateSatellites(satellites: SatelliteEntity[], time: Date): void {
        this.currentTime = time;
        this.satellites.clear();

        satellites.forEach((satellite, index) => {
            this.satellites.set(satellite.id, satellite);
        });

        // Only update GPU textures if system is properly initialized
        if (this.gpuCompute && this.positionVariable && this.velocityVariable && this.colorVariable) {
            this.updateGPUTextures(satellites);
        } else {
            console.warn('GPU system not ready, skipping texture update');
        }
    }

    private updateGPUTextures(satellites: SatelliteEntity[]): void {
        if (!this.gpuCompute) {
            console.warn('GPU compute not initialized');
            return;
        }

        if (!this.positionVariable || !this.velocityVariable || !this.colorVariable) {
            console.warn('GPU variables not initialized');
            return;
        }

        try {
            // Update position texture
            const positionRenderTarget = this.gpuCompute.getCurrentRenderTarget(this.positionVariable);
            if (!positionRenderTarget) {
                console.warn('Position render target not available');
                return;
            }

            const positionTexture = positionRenderTarget.texture;
            if (!positionTexture) {
                console.warn('Position texture not available');
                return;
            }

            if (!positionTexture.image) {
                console.warn('Position texture image not available');
                return;
            }

            if (!positionTexture.image.data) {
                console.warn('Position texture data not available');
                return;
            }

            const positionArray = positionTexture.image.data;

            // Update velocity texture
            const velocityRenderTarget = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable);
            if (!velocityRenderTarget || !velocityRenderTarget.texture || !velocityRenderTarget.texture.image || !velocityRenderTarget.texture.image.data) {
                console.warn('Velocity texture not ready');
                return;
            }
            const velocityArray = velocityRenderTarget.texture.image.data;

            // Update color texture
            const colorRenderTarget = this.gpuCompute.getCurrentRenderTarget(this.colorVariable);
            if (!colorRenderTarget || !colorRenderTarget.texture || !colorRenderTarget.texture.image || !colorRenderTarget.texture.image.data) {
                console.warn('Color texture not ready');
                return;
            }
            const colorArray = colorRenderTarget.texture.image.data;
            const textureSize = this.options.textureSize;

            for (let i = 0; i < textureSize * textureSize; i++) {
                const index = i * 4;

                if (i < satellites.length) {
                    const satellite = satellites[i];
                    const position = satellite.getPositionDirect();
                    const color = satellite.getColor();
                    const threeColor = new THREE.Color(color);

                    // Update position
                    positionArray[index + 0] = position.x;
                    positionArray[index + 1] = position.y;
                    positionArray[index + 2] = position.z;
                    positionArray[index + 3] = 1.0;

                    // Update velocity (for animation)
                    velocityArray[index + 0] = 0.0;
                    velocityArray[index + 1] = 0.0;
                    velocityArray[index + 2] = 0.0;
                    velocityArray[index + 3] = 1.0;

                    // Update color
                    colorArray[index + 0] = threeColor.r;
                    colorArray[index + 1] = threeColor.g;
                    colorArray[index + 2] = threeColor.b;
                    colorArray[index + 3] = 1.0;
                } else {
                    // Hide unused instances
                    positionArray[index + 0] = 10000;
                    positionArray[index + 1] = 10000;
                    positionArray[index + 2] = 10000;
                    positionArray[index + 3] = 0.0;

                    velocityArray[index + 0] = 0.0;
                    velocityArray[index + 1] = 0.0;
                    velocityArray[index + 2] = 0.0;
                    velocityArray[index + 3] = 0.0;

                    colorArray[index + 0] = 0.0;
                    colorArray[index + 1] = 0.0;
                    colorArray[index + 2] = 0.0;
                    colorArray[index + 3] = 0.0;
                }
            }

            // Mark textures as needing update
            positionTexture.needsUpdate = true;
            velocityRenderTarget.texture.needsUpdate = true;
            colorRenderTarget.texture.needsUpdate = true;
        } catch (error) {
            console.error('Error updating GPU textures:', error);
        }
    }

    public update(deltaTime: number): void {
        if (!this.gpuCompute) return;

        const now = performance.now();

        // Update uniforms
        this.positionUniforms['time'].value = now;
        this.positionUniforms['delta'].value = deltaTime;

        this.velocityUniforms['time'].value = now;
        this.velocityUniforms['delta'].value = deltaTime;
        this.velocityUniforms['enableOcclusion'].value = this.options.enableOcclusionCulling ? 1.0 : 0.0;

        this.colorUniforms['time'].value = now;
        this.colorUniforms['delta'].value = deltaTime;

        // Update satellite uniforms
        this.satelliteUniforms['time'].value = now;
        this.satelliteUniforms['delta'].value = deltaTime;

        // Run GPU computation
        this.gpuCompute.compute();

        // Update satellite material textures
        this.satelliteUniforms['texturePosition'].value = this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
        this.satelliteUniforms['textureVelocity'].value = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
        this.satelliteUniforms['textureColor'].value = this.gpuCompute.getCurrentRenderTarget(this.colorVariable).texture;

        // Update instance count
        if (this.satelliteMesh) {
            this.satelliteMesh.count = this.satellites.size;
        }
    }

    public setOcclusionCulling(enabled: boolean): void {
        this.options.enableOcclusionCulling = enabled;
    }

    public dispose(): void {
        if (this.satelliteMesh) {
            this.scene.remove(this.satelliteMesh);
            this.satelliteMesh = null;
        }

        if (this.satelliteGeometry) {
            this.satelliteGeometry.dispose();
        }

        if (this.satelliteMaterial) {
            this.satelliteMaterial.dispose();
        }

        if (this.gpuCompute) {
            // GPU computation cleanup would go here
            this.gpuCompute = null;
        }
    }

    // Shader code
    private getPositionShader(): string {
        return `
            uniform float time;
            uniform float delta;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec4 tmpPos = texture2D(texturePosition, uv);
                vec3 position = tmpPos.xyz;
                vec3 velocity = texture2D(textureVelocity, uv).xyz;
                
                // Simple position update (can be enhanced with orbital mechanics)
                vec3 newPosition = position + velocity * delta;
                
                gl_FragColor = vec4(newPosition, tmpPos.w);
            }
        `;
    }

    private getVelocityShader(): string {
        return `
            uniform float time;
            uniform float delta;
            uniform float enableOcclusion;
            
            const float GLOBE_RADIUS = 1.0;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec3 position = texture2D(texturePosition, uv).xyz;
                vec3 velocity = texture2D(textureVelocity, uv).xyz;
                
                // Occlusion culling
                if (enableOcclusion > 0.5) {
                    float distanceFromOrigin = length(position);
                    if (distanceFromOrigin < GLOBE_RADIUS) {
                        // Hide satellite behind globe
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                        return;
                    }
                }
                
                // Simple velocity update (can be enhanced with orbital mechanics)
                gl_FragColor = vec4(velocity, 1.0);
            }
        `;
    }

    private getColorShader(): string {
        return `
            uniform float time;
            uniform float delta;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec4 color = texture2D(textureColor, uv);
                
                gl_FragColor = color;
            }
        `;
    }

    private getSatelliteVertexShader(): string {
        return `
            attribute float instanceId;
            
            uniform sampler2D texturePosition;
            uniform sampler2D textureVelocity;
            uniform sampler2D textureColor;
            uniform float time;
            uniform float delta;
            
            varying vec3 vColor;
            varying float vInstanceId;
            
            void main() {
                vInstanceId = instanceId;
                
                // Calculate texture coordinates
                float textureSize = ${this.options.textureSize}.0;
                float x = mod(instanceId, textureSize) / textureSize;
                float y = floor(instanceId / textureSize) / textureSize;
                vec2 uv = vec2(x, y);
                
                // Get position from texture
                vec3 position = texture2D(texturePosition, uv).xyz;
                vec3 velocity = texture2D(textureVelocity, uv).xyz;
                vec3 color = texture2D(textureColor, uv).rgb;
                
                vColor = color;
                
                // Transform vertex
                vec3 worldPosition = position + position;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
            }
        `;
    }

    private getSatelliteFragmentShader(): string {
        return `
            varying vec3 vColor;
            varying float vInstanceId;
            
            void main() {
                gl_FragColor = vec4(vColor, 1.0);
            }
        `;
    }
}
