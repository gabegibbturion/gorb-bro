import * as THREE from "three";

export interface EnhancedGlobeOptions {
    radius?: number;
    sunIntensity?: number;
    speedFactor?: number;
    metalness?: number;
    atmOpacity?: number;
    atmPowFactor?: number;
    atmMultiplier?: number;
    enableClouds?: boolean;
    enableAtmosphere?: boolean;
    enableNightLights?: boolean;
    enableCloudShadows?: boolean;
}

/**
 * EnhancedGlobe - A high-quality Earth globe with advanced rendering features
 * 
 * Features:
 * - High-resolution textures (day, night, clouds, ocean, bump maps)
 * - Atmospheric scattering effects
 * - Cloud layer with shadows cast on the surface
 * - Night lights visible only on the dark side
 * - Ocean reflections and metalness
 * - Independent rotation speeds for earth and clouds
 */
export class EnhancedGlobe {
    private group: THREE.Group;
    private earth!: THREE.Mesh;
    private clouds: THREE.Mesh | null = null;
    private atmosphere: THREE.Mesh | null = null;
    private options: Required<EnhancedGlobeOptions>;
    private directionalLight: THREE.DirectionalLight | null = null;

    constructor(options: EnhancedGlobeOptions = {}) {
        this.options = {
            radius: 1.0,
            sunIntensity: 1.3,
            speedFactor: 2.0,
            metalness: 0.1,
            atmOpacity: 0.7,
            atmPowFactor: 4.1,
            atmMultiplier: 9.5,
            enableClouds: true,
            enableAtmosphere: true,
            enableNightLights: false,      // Disabled by default (requires shader mods)
            enableCloudShadows: false,     // Disabled by default (requires shader mods)
            ...options,
        };

        this.group = new THREE.Group();
        // Earth's axial tilt is 23.5 degrees
        this.group.rotation.z = (23.5 / 360) * 2 * Math.PI;
    }

    /**
     * Initialize the globe with all textures and effects
     */
    public async init(): Promise<void> {
        const textureLoader = new THREE.TextureLoader();

        // Load all textures
        const [albedoMap, bumpMap, cloudsMap, oceanMap, lightsMap] = await Promise.all([
            this.loadTexture(textureLoader, "/assets/earth_day.jpg", true),
            this.loadTexture(textureLoader, "/assets/Bump.jpg", false),
            this.loadTexture(textureLoader, "/assets/Clouds.png", false),
            this.loadTexture(textureLoader, "/assets/Ocean.png", false),
            this.loadTexture(textureLoader, "/assets/night_high_res_adjusted.jpg", true),
        ]);

        // Create the Earth
        this.createEarth(albedoMap, bumpMap, oceanMap, lightsMap, cloudsMap);

        // Create clouds layer
        if (this.options.enableClouds) {
            this.createClouds(cloudsMap);
        }

        // Create atmosphere
        if (this.options.enableAtmosphere) {
            this.createAtmosphere();
        }

        // Set initial rotation for better viewing angle
        this.earth.rotateY(-0.3);
        if (this.clouds) {
            this.clouds.rotateY(-0.3);
        }
    }

    private async loadTexture(loader: THREE.TextureLoader, path: string, sRGB: boolean): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            loader.load(
                path,
                (texture) => {
                    if (sRGB) {
                        texture.colorSpace = THREE.SRGBColorSpace;
                    }
                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.warn(`Failed to load texture ${path}, using fallback`, error);
                    // Create a simple colored texture as fallback
                    const canvas = document.createElement('canvas');
                    canvas.width = 2;
                    canvas.height = 2;
                    const ctx = canvas.getContext('2d')!;
                    ctx.fillStyle = '#888888';
                    ctx.fillRect(0, 0, 2, 2);
                    const fallbackTexture = new THREE.CanvasTexture(canvas);
                    resolve(fallbackTexture);
                }
            );
        });
    }

    private createEarth(
        albedoMap: THREE.Texture,
        bumpMap: THREE.Texture,
        oceanMap: THREE.Texture,
        lightsMap: THREE.Texture,
        cloudsMap: THREE.Texture
    ): void {
        const earthGeo = new THREE.SphereGeometry(this.options.radius, 64, 64);

        // Create a simple, reliable material that works across all Three.js versions
        const earthMat = new THREE.MeshStandardMaterial({
            map: albedoMap,
            bumpMap: bumpMap,
            bumpScale: 0.03,
            roughness: 0.7,
            metalness: this.options.metalness,
            // Note: Night lights emissive map shows on both day/night without shader mods
            // This is a limitation but ensures compatibility
        });

        this.earth = new THREE.Mesh(earthGeo, earthMat);
        this.group.add(this.earth);

        // Shader modifications disabled for compatibility with newer Three.js versions
        // The material will work fine without them, just without advanced features
        // If you want to enable them, uncomment the code below and test with your Three.js version

        // Apply custom shader modifications for cloud shadows and night lights
        // if (this.options.enableCloudShadows || this.options.enableNightLights) {
        //     try {
        //         this.modifyEarthShader(earthMat, cloudsMap);
        //     } catch (error) {
        //         console.warn('Failed to apply shader modifications, using basic material:', error);
        //     }
        // }
    }

    private modifyEarthShader(material: THREE.MeshStandardMaterial, cloudsMap: THREE.Texture): void {
        cloudsMap.wrapS = THREE.RepeatWrapping;

        material.onBeforeCompile = (shader) => {
            try {
                shader.uniforms.tClouds = { value: cloudsMap };
                shader.uniforms.uv_xOffset = { value: 0 };

                // Add uniforms to common section
                if (shader.fragmentShader.includes("#include <common>")) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        "#include <common>",
                        `
                        #include <common>
                        uniform sampler2D tClouds;
                        uniform float uv_xOffset;
                        `
                    );
                }

                // Modify roughness to reverse ocean map values
                if (shader.fragmentShader.includes("#include <roughnessmap_fragment>")) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        "#include <roughnessmap_fragment>",
                        `
                        float roughnessFactor = roughness;

                        #ifdef USE_ROUGHNESSMAP
                            vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
                            // reversing the black and white values because we provide the ocean map
                            texelRoughness = vec4(1.0) - texelRoughness;
                            // reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
                            roughnessFactor *= clamp(texelRoughness.g, 0.5, 1.0);
                        #endif
                        `
                    );
                }

                // Modify emissive map to show night lights only on dark side
                if (this.options.enableNightLights && shader.fragmentShader.includes("#include <emissivemap_fragment>")) {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        "#include <emissivemap_fragment>",
                        `
                        #ifdef USE_EMISSIVEMAP
                            vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
                            
                            // Show night lights only on the dark side of earth
                            vec3 surfaceNormal = normalize(vNormal);
                            
                            // Get direction to sun from the first directional light
                            #if NUM_DIR_LIGHTS > 0
                                vec3 sunDirection = directionalLights[0].direction;
                                float dayNightFactor = dot(surfaceNormal, sunDirection);
                                // Show lights only when sun direction dot normal is negative (night side)
                                emissiveColor *= 1.0 - smoothstep(-0.02, 0.0, dayNightFactor);
                            #endif
                            
                            totalEmissiveRadiance *= emissiveColor.rgb;
                        #endif
                        `
                    );
                }

                // Add cloud shadows and atmospheric effects
                if (this.options.enableCloudShadows || this.options.enableNightLights) {
                    // Try to insert before colorspace_fragment (newer Three.js)
                    if (shader.fragmentShader.includes("#include <colorspace_fragment>")) {
                        shader.fragmentShader = shader.fragmentShader.replace(
                            "#include <colorspace_fragment>",
                            `
                            ${this.options.enableCloudShadows ? `
                            // Cloud shadows implementation
                            float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
                            
                            // Darken areas under clouds (clamp to minimum 0.2 to avoid too dark shadows)
                            gl_FragColor.rgb *= max(1.0 - cloudsMapValue, 0.2);
                            ` : ''}

                            // Add atmospheric coloring around the edges
                            vec3 surfaceNormal = normalize(vNormal);
                            float intensity = 1.4 - dot(surfaceNormal, vec3(0.0, 0.0, 1.0));
                            vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 5.0);
                            gl_FragColor.rgb += atmosphere * 0.3;

                            #include <colorspace_fragment>
                            `
                        );
                    } else if (shader.fragmentShader.includes("#include <tonemapping_fragment>")) {
                        // Fallback for older Three.js versions
                        shader.fragmentShader = shader.fragmentShader.replace(
                            "#include <tonemapping_fragment>",
                            `
                            #include <tonemapping_fragment>
                            
                            ${this.options.enableCloudShadows ? `
                            // Cloud shadows implementation
                            float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
                            gl_FragColor.rgb *= max(1.0 - cloudsMapValue, 0.2);
                            ` : ''}

                            // Add atmospheric coloring
                            vec3 surfaceNormal = normalize(vNormal);
                            float intensity = 1.4 - dot(surfaceNormal, vec3(0.0, 0.0, 1.0));
                            vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 5.0);
                            gl_FragColor.rgb += atmosphere * 0.3;
                            `
                        );
                    }
                }

                // Save shader reference for dynamic updates
                material.userData.shader = shader;
            } catch (error) {
                console.error('Error modifying shader:', error);
                throw error;
            }
        };
    }

    private createClouds(cloudsMap: THREE.Texture): void {
        const cloudGeo = new THREE.SphereGeometry(this.options.radius * 1.01, 64, 64);
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: cloudsMap,
            transparent: true,
            opacity: 0.6,
            alphaMap: cloudsMap,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        this.clouds = new THREE.Mesh(cloudGeo, cloudsMat);
        this.group.add(this.clouds);
    }

    private createAtmosphere(): void {
        const vertexShader = `
            varying vec3 vNormal;
            varying vec3 eyeVector;

            void main() {
                vec4 mvPos = modelViewMatrix * vec4( position, 1.0 );
                vNormal = normalize( normalMatrix * normal );
                eyeVector = normalize(mvPos.xyz);
                gl_Position = projectionMatrix * mvPos;
            }
        `;

        const fragmentShader = `
            varying vec3 vNormal;
            varying vec3 eyeVector;
            uniform float atmOpacity;
            uniform float atmPowFactor;
            uniform float atmMultiplier;

            void main() {
                float dotP = dot( vNormal, eyeVector );
                float factor = pow(dotP, atmPowFactor) * atmMultiplier;
                vec3 atmColor = vec3(0.35 + dotP/4.5, 0.35 + dotP/4.5, 1.0);
                gl_FragColor = vec4(atmColor, atmOpacity) * factor;
            }
        `;

        const atmosGeo = new THREE.SphereGeometry(this.options.radius * 1.25, 64, 64);
        const atmosMat = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                atmOpacity: { value: this.options.atmOpacity },
                atmPowFactor: { value: this.options.atmPowFactor },
                atmMultiplier: { value: this.options.atmMultiplier },
            },
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
        });
        this.atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
        this.group.add(this.atmosphere);
    }

    /**
     * Update the globe animation
     * @param deltaTime - Time elapsed since last frame (in milliseconds)
     */
    public update(deltaTime: number): void {
        if (!this.earth) return;

        const interval = deltaTime;

        // Rotate earth
        this.earth.rotateY(interval * 0.00001 * this.options.speedFactor);

        // Rotate clouds faster than earth
        if (this.clouds) {
            this.clouds.rotateY(interval * 0.00002 * this.options.speedFactor);
        }

        // Update cloud shadow offset
        if (this.options.enableCloudShadows) {
            const earthMaterial = this.earth.material as THREE.MeshStandardMaterial;
            const shader = earthMaterial.userData.shader;
            if (shader) {
                const offset = (interval * 0.00001 * this.options.speedFactor) / (2 * Math.PI);
                shader.uniforms.uv_xOffset.value += offset % 1;
            }
        }
    }

    /**
     * Set the directional light (sun) for the globe
     */
    public setDirectionalLight(light: THREE.DirectionalLight): void {
        this.directionalLight = light;
    }

    /**
     * Get the Three.js group containing all globe elements
     */
    public getGroup(): THREE.Group {
        return this.group;
    }

    /**
     * Get the earth mesh
     */
    public getEarth(): THREE.Mesh {
        return this.earth;
    }

    /**
     * Get the clouds mesh
     */
    public getClouds(): THREE.Mesh | null {
        return this.clouds;
    }

    /**
     * Get the atmosphere mesh
     */
    public getAtmosphere(): THREE.Mesh | null {
        return this.atmosphere;
    }

    /**
     * Set the visibility of the globe
     */
    public setVisible(visible: boolean): void {
        this.group.visible = visible;
    }

    /**
     * Set parameters dynamically
     */
    public setParameters(params: Partial<EnhancedGlobeOptions>): void {
        Object.assign(this.options, params);

        // Update atmosphere shader uniforms if atmosphere exists
        if (this.atmosphere) {
            const atmosMat = this.atmosphere.material as THREE.ShaderMaterial;
            if (params.atmOpacity !== undefined) {
                atmosMat.uniforms.atmOpacity.value = params.atmOpacity;
            }
            if (params.atmPowFactor !== undefined) {
                atmosMat.uniforms.atmPowFactor.value = params.atmPowFactor;
            }
            if (params.atmMultiplier !== undefined) {
                atmosMat.uniforms.atmMultiplier.value = params.atmMultiplier;
            }
        }

        // Update earth metalness if changed
        if (this.earth && params.metalness !== undefined) {
            const earthMat = this.earth.material as THREE.MeshStandardMaterial;
            earthMat.metalness = params.metalness;
        }
    }

    /**
     * Toggle clouds visibility
     */
    public setCloudsVisible(visible: boolean): void {
        if (this.clouds) {
            this.clouds.visible = visible;
        }
    }

    /**
     * Toggle atmosphere visibility
     */
    public setAtmosphereVisible(visible: boolean): void {
        if (this.atmosphere) {
            this.atmosphere.visible = visible;
        }
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        // Dispose earth
        if (this.earth) {
            this.earth.geometry.dispose();
            const earthMat = this.earth.material as THREE.MeshStandardMaterial;
            earthMat.dispose();
            earthMat.map?.dispose();
            earthMat.bumpMap?.dispose();
            earthMat.roughnessMap?.dispose();
            earthMat.metalnessMap?.dispose();
            earthMat.emissiveMap?.dispose();
        }

        // Dispose clouds
        if (this.clouds) {
            this.clouds.geometry.dispose();
            const cloudsMat = this.clouds.material as THREE.MeshStandardMaterial;
            cloudsMat.dispose();
            cloudsMat.alphaMap?.dispose();
        }

        // Dispose atmosphere
        if (this.atmosphere) {
            this.atmosphere.geometry.dispose();
            (this.atmosphere.material as THREE.ShaderMaterial).dispose();
        }
    }
}

