import * as THREE from "three";
import type { SatelliteEntity } from "./SatelliteEntity";

export interface WebGPUSatelliteRendererOptions {
    maxSatellites: number;
    enableOcclusionCulling: boolean;
    particleSize: number;
    useInstancedRendering: boolean;
}

export class WebGPUSatelliteRenderer {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private options: WebGPUSatelliteRendererOptions;

    // WebGPU device and resources
    private device: GPUDevice | null = null;
    private adapter: GPUAdapter | null = null;
    private context: GPUCanvasContext | null = null;

    // Buffers and bind groups
    private satelliteBuffer: GPUBuffer | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private bindGroup: GPUBindGroup | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    // Shaders
    private computeShader: GPUShaderModule | null = null;
    private renderShader: GPUShaderModule | null = null;

    // Compute pipeline
    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;

    // State
    private satellites: Map<string, SatelliteEntity> = new Map();
    private currentTime: Date = new Date();
    private isInitialized: boolean = false;

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, options: WebGPUSatelliteRendererOptions) {
        this.renderer = renderer;
        this.scene = scene;
        this.options = options;

        this.initializeWebGPU();
    }

    private async initializeWebGPU(): Promise<void> {
        try {
            console.log('Initializing WebGPU satellite renderer...');

            // Check WebGPU support
            if (!navigator.gpu) {
                throw new Error('WebGPU not supported in this browser');
            }

            // Try to get adapter with fallback options
            this.adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance',
                forceFallbackAdapter: false
            });

            if (!this.adapter) {
                // Try with fallback adapter
                console.log('Trying fallback adapter...');
                this.adapter = await navigator.gpu.requestAdapter({
                    powerPreference: 'low-power',
                    forceFallbackAdapter: true
                });

                if (!this.adapter) {
                    throw new Error('No WebGPU adapter available (try enabling experimental features)');
                }
            }

            // Get device with minimal requirements
            this.device = await this.adapter.requestDevice({
                requiredFeatures: [], // Remove timestamp-query requirement
                requiredLimits: {
                    maxStorageBufferBindingSize: Math.min(this.adapter.limits.maxStorageBufferBindingSize, 134217728), // 128MB
                    maxBufferSize: Math.min(this.adapter.limits.maxBufferSize, 134217728) // 128MB
                }
            });

            // Get WebGL context for fallback
            const canvas = this.renderer.domElement;
            this.context = canvas.getContext('webgpu') as GPUCanvasContext;

            if (!this.context) {
                throw new Error('WebGPU context not available');
            }

            // Configure canvas
            this.context.configure({
                device: this.device,
                format: 'bgra8unorm',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
            });

            // Create shaders
            await this.createShaders();

            // Create buffers
            this.createBuffers();

            // Create pipelines
            this.createPipelines();

            this.isInitialized = true;
            console.log('WebGPU satellite renderer initialized successfully');

        } catch (error) {
            console.error('Failed to initialize WebGPU:', error);
            this.isInitialized = false;
        }
    }

    private async createShaders(): Promise<void> {
        if (!this.device) return;

        // Compute shader for satellite position updates
        const computeShaderCode = `
            struct Satellite {
                position: vec3<f32>,
                velocity: vec3<f32>,
                color: vec3<f32>,
                size: f32,
                visible: f32,
            }
            
            struct Uniforms {
                time: f32,
                deltaTime: f32,
                globeRadius: f32,
                enableOcclusion: f32,
                satelliteCount: u32,
                _padding: vec3<f32>,
            }
            
            @group(0) @binding(0) var<storage, read_write> satellites: array<Satellite>;
            @group(0) @binding(1) var<uniform> uniforms: Uniforms;
            
            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                if (index >= uniforms.satelliteCount) { return; }
                
                var satellite = satellites[index];
                
                // Update position based on velocity
                satellite.position += satellite.velocity * uniforms.deltaTime;
                
                // Occlusion culling
                if (uniforms.enableOcclusion > 0.5) {
                    let distance = length(satellite.position);
                    if (distance < uniforms.globeRadius) {
                        satellite.visible = 0.0;
                    } else {
                        satellite.visible = 1.0;
                    }
                } else {
                    satellite.visible = 1.0;
                }
                
                satellites[index] = satellite;
            }
        `;

        this.computeShader = this.device.createShaderModule({
            code: computeShaderCode
        });

        // Render shader for drawing satellites
        const renderShaderCode = `
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) color: vec3<f32>,
                @location(1) size: f32,
            }
            
            struct Uniforms {
                time: f32,
                deltaTime: f32,
                globeRadius: f32,
                enableOcclusion: f32,
                satelliteCount: u32,
                _padding: vec3<f32>,
            }
            
            @group(0) @binding(0) var<storage, read> satellites: array<Satellite>;
            @group(0) @binding(1) var<uniform> uniforms: Uniforms;
            
            struct Satellite {
                position: vec3<f32>,
                velocity: vec3<f32>,
                color: vec3<f32>,
                size: f32,
                visible: f32,
            }
            
            @vertex
            fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
                let index = vertex_index / 6u; // 6 vertices per quad
                let quad_vertex = vertex_index % 6u;
                
                var output: VertexOutput;
                
                if (index >= uniforms.satelliteCount) {
                    output.position = vec4<f32>(0.0, 0.0, -1000.0, 1.0);
                    output.color = vec3<f32>(0.0, 0.0, 0.0);
                    output.size = 0.0;
                    return output;
                }
                
                let satellite = satellites[index];
                
                if (satellite.visible < 0.5) {
                    output.position = vec4<f32>(0.0, 0.0, -1000.0, 1.0);
                    output.color = vec3<f32>(0.0, 0.0, 0.0);
                    output.size = 0.0;
                    return output;
                }
                
                // Create quad vertices
                let quad_positions = array<vec2<f32>, 6>(
                    vec2<f32>(-0.5, -0.5),
                    vec2<f32>(0.5, -0.5),
                    vec2<f32>(-0.5, 0.5),
                    vec2<f32>(0.5, -0.5),
                    vec2<f32>(0.5, 0.5),
                    vec2<f32>(-0.5, 0.5),
                );
                
                let quad_pos = quad_positions[quad_vertex];
                let world_pos = satellite.position + vec3<f32>(quad_pos * satellite.size, 0.0);
                
                output.position = vec4<f32>(world_pos, 1.0);
                output.color = satellite.color;
                output.size = satellite.size;
                
                return output;
            }
            
            @fragment
            fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
                return vec4<f32>(input.color, 1.0);
            }
        `;

        this.renderShader = this.device.createShaderModule({
            code: renderShaderCode
        });
    }

    private createBuffers(): void {
        if (!this.device) return;

        // Create satellite buffer
        const satelliteSize = 32; // 8 floats * 4 bytes each
        this.satelliteBuffer = this.device.createBuffer({
            size: this.options.maxSatellites * satelliteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // Create uniform buffer
        this.uniformBuffer = this.device.createBuffer({
            size: 32, // 8 floats * 4 bytes each
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    private createPipelines(): void {
        if (!this.device || !this.computeShader || !this.renderShader) return;

        // Create bind group layout
        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: {
                        type: 'storage'
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: {
                        type: 'uniform'
                    }
                }
            ]
        });

        // Create compute pipeline
        this.computePipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            }),
            compute: {
                module: this.computeShader,
                entryPoint: 'main'
            }
        });

        // Create render pipeline
        this.renderPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            }),
            vertex: {
                module: this.renderShader,
                entryPoint: 'vs_main'
            },
            fragment: {
                module: this.renderShader,
                entryPoint: 'fs_main',
                targets: [{
                    format: 'bgra8unorm'
                }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        // Create bind group
        this.bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.satelliteBuffer
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.uniformBuffer
                    }
                }
            ]
        });
    }

    public updateSatellites(satellites: SatelliteEntity[], time: Date): void {
        if (!this.isInitialized || !this.device || !this.satelliteBuffer || !this.uniformBuffer) {
            return;
        }

        this.currentTime = time;
        this.satellites.clear();

        satellites.forEach(satellite => {
            this.satellites.set(satellite.id, satellite);
        });

        // Update satellite buffer
        this.updateSatelliteBuffer(satellites);

        // Update uniform buffer
        this.updateUniformBuffer();
    }

    private updateSatelliteBuffer(satellites: SatelliteEntity[]): void {
        if (!this.device || !this.satelliteBuffer) return;

        const bufferSize = this.options.maxSatellites * 32; // 8 floats * 4 bytes
        const buffer = new ArrayBuffer(bufferSize);
        const view = new Float32Array(buffer);

        for (let i = 0; i < this.options.maxSatellites; i++) {
            const offset = i * 8; // 8 floats per satellite

            if (i < satellites.length) {
                const satellite = satellites[i];
                const position = satellite.getPositionDirect();
                const velocity = satellite.getVelocity();
                const color = new THREE.Color(satellite.getColor());

                // Position (3 floats)
                view[offset + 0] = position.x;
                view[offset + 1] = position.y;
                view[offset + 2] = position.z;

                // Velocity (3 floats)
                view[offset + 3] = velocity.x;
                view[offset + 4] = velocity.y;
                view[offset + 5] = velocity.z;

                // Color (3 floats)
                view[offset + 6] = color.r;
                view[offset + 7] = color.g;
                view[offset + 8] = color.b;

                // Size (1 float)
                view[offset + 9] = this.options.particleSize;

                // Visible (1 float)
                view[offset + 10] = 1.0;
            } else {
                // Hide unused satellites
                for (let j = 0; j < 8; j++) {
                    view[offset + j] = 0.0;
                }
            }
        }

        this.device.queue.writeBuffer(this.satelliteBuffer, 0, buffer);
    }

    private updateUniformBuffer(): void {
        if (!this.device || !this.uniformBuffer) return;

        const buffer = new ArrayBuffer(32);
        const view = new Float32Array(buffer);

        view[0] = this.currentTime.getTime() / 1000.0; // time
        view[1] = 0.016; // deltaTime (60 FPS)
        view[2] = 1.0; // globeRadius
        view[3] = this.options.enableOcclusionCulling ? 1.0 : 0.0; // enableOcclusion
        view[4] = this.satellites.size; // satelliteCount

        this.device.queue.writeBuffer(this.uniformBuffer, 0, buffer);
    }

    public render(commandEncoder: GPUCommandEncoder): void {
        if (!this.isInitialized || !this.device || !this.computePipeline || !this.renderPipeline) {
            return;
        }

        // Run compute pass
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.bindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.satellites.size / 64));
        computePass.end();

        // Run render pass
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context!.getCurrentTexture().createView(),
                loadOp: 'load',
                storeOp: 'store'
            }]
        });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.draw(6 * this.satellites.size); // 6 vertices per quad

        renderPass.end();
    }

    public setOcclusionCulling(enabled: boolean): void {
        this.options.enableOcclusionCulling = enabled;
    }

    public getOcclusionCulling(): boolean {
        return this.options.enableOcclusionCulling;
    }

    public setParticleSize(size: number): void {
        this.options.particleSize = size;
    }

    public getParticleSize(): number {
        return this.options.particleSize;
    }

    public dispose(): void {
        if (this.satelliteBuffer) {
            this.satelliteBuffer.destroy();
            this.satelliteBuffer = null;
        }

        if (this.uniformBuffer) {
            this.uniformBuffer.destroy();
            this.uniformBuffer = null;
        }

        this.device = null;
        this.adapter = null;
        this.context = null;
        this.isInitialized = false;
    }

    public isReady(): boolean {
        return this.isInitialized;
    }

    public getSatelliteCount(): number {
        return this.satellites.size;
    }
}
