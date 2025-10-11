// System for handling entity selection via raycasting and rendering selection boxes

import * as THREE from "three";
import type { System, EntityId, IEngine } from "../types";
import { ComponentType } from "../types";
import type { RenderingService } from "../services/RenderingService";
import type { SelectionService } from "../services/SelectionService";

export class SelectionSystem implements System {
    name = "selection";
    priority = 1100; // Run after RenderSystem
    requiredComponents = [];

    private engine: IEngine | null = null;
    private renderingService: RenderingService | null = null;
    private selectionService: SelectionService | null = null;
    private raycaster: THREE.Raycaster = new THREE.Raycaster();
    private mouse: THREE.Vector2 = new THREE.Vector2();
    private selectionBox: THREE.BoxHelper | null = null;
    private entityMeshMap: Map<THREE.Object3D, EntityId> = new Map();
    public selectionTime: number = 0; // Exposed for stats

    init(engine: IEngine): void {
        this.engine = engine;
        this.renderingService = engine.getService<RenderingService>("rendering") ?? null;
        this.selectionService = engine.getService<SelectionService>("selection") ?? null;

        if (!this.renderingService) {
            console.warn("SelectionSystem requires RenderingService");
            return;
        }

        if (!this.selectionService) {
            console.warn("SelectionSystem requires SelectionService");
            return;
        }

        // Setup click handler
        this.setupClickHandler();

        // Listen for selection changes
        this.selectionService.onSelectionChange((entityId) => {
            this.updateSelectionBox(entityId);
        });
    }

    /**
     * Setup click event listener for raycasting
     */
    private setupClickHandler(): void {
        if (!this.renderingService) return;

        const renderer = this.renderingService.getRenderer();
        const canvas = renderer.domElement;

        canvas.addEventListener("click", (event) => {
            this.handleClick(event);
        });
    }

    /**
     * Handle click event and perform raycasting
     */
    private handleClick(event: MouseEvent): void {
        if (!this.renderingService || !this.selectionService || !this.engine) return;

        const renderer = this.renderingService.getRenderer();
        const canvas = renderer.domElement;
        const rect = canvas.getBoundingClientRect();

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Setup raycaster
        const camera = this.renderingService.getCamera();
        this.raycaster.setFromCamera(this.mouse, camera);

        // First try manual raycasting for instanced satellites (more reliable)
        const selectedSatellite = this.manualRaycastSatellites();
        if (selectedSatellite !== null) {
            this.logEntityClick(selectedSatellite);
            this.selectionService.selectEntity(selectedSatellite);
            return;
        }

        // Fall back to regular raycasting for other objects (Earth, Sun, Moon)
        const scene = this.renderingService.getScene();
        const intersects = this.raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            // Find the first intersected object that has an associated entity
            for (const intersect of intersects) {
                let obj: THREE.Object3D | null = intersect.object;

                // Check userData first (fast path for direct entity storage)
                if (obj.userData && obj.userData.entityId !== undefined) {
                    const entityId = obj.userData.entityId;
                    this.logEntityClick(entityId);
                    this.selectionService.selectEntity(entityId);
                    return;
                }

                // Traverse up to find an object with an entity mapping
                while (obj) {
                    // Check userData
                    if (obj.userData && obj.userData.entityId !== undefined) {
                        const entityId = obj.userData.entityId;
                        this.logEntityClick(entityId);
                        this.selectionService.selectEntity(entityId);
                        return;
                    }

                    // Check mesh map
                    const entityId = this.entityMeshMap.get(obj);
                    if (entityId !== undefined) {
                        this.logEntityClick(entityId);
                        this.selectionService.selectEntity(entityId);
                        return;
                    }
                    obj = obj.parent;
                }
            }
        }

        // No entity clicked, deselect
        this.selectionService.deselectEntity();
    }

    /**
     * Manual raycasting for instanced satellites
     * Three.js raycaster doesn't handle instanced meshes well, so we do it manually
     */
    private manualRaycastSatellites(): EntityId | null {
        if (!this.engine) return null;

        // Get the InstancedSatelliteSystem
        const instancedSatelliteSystem = this.engine.getSystem("instancedSatellite");
        if (!instancedSatelliteSystem || !("getPositionArray" in instancedSatelliteSystem)) {
            return null;
        }

        // Get all entities with billboards (satellites)
        const satelliteEntities = this.engine.getEntitiesWithComponent(ComponentType.BILLBOARD);
        if (satelliteEntities.length === 0) {
            return null;
        }

        // Get position array and entity-to-index mapping
        const positions = (instancedSatelliteSystem as any).getPositionArray() as Float32Array;
        const getEntityIndex = (instancedSatelliteSystem as any).getEntityIndex.bind(instancedSatelliteSystem) as (entity: EntityId) => number | undefined;

        // Manual raycasting for each satellite
        let closestEntity: EntityId | null = null;
        let closestDistance = Infinity;
        const selectionThreshold = 300; // 300 km threshold (adjust based on satellite size)

        const rayOrigin = this.raycaster.ray.origin;
        const rayDirection = this.raycaster.ray.direction;

        for (const entity of satelliteEntities) {
            const index = getEntityIndex(entity);
            if (index === undefined) continue;

            const i3 = index * 3;
            const satellitePosition = new THREE.Vector3(
                positions[i3],
                positions[i3 + 1],
                positions[i3 + 2]
            );

            // Skip hidden/invalid positions
            if (satellitePosition.length() > 9000) continue;

            // Vector from ray origin to satellite
            const toSatellite = satellitePosition.clone().sub(rayOrigin);

            // Project toSatellite onto ray direction
            const projectionLength = toSatellite.dot(rayDirection);

            // Only consider satellites in front of the camera
            if (projectionLength <= 0) continue;

            // Closest point on ray to satellite
            const closestPointOnRay = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(projectionLength));

            // Distance from satellite to closest point on ray (in km, since positions are in km)
            const distanceToRay = satellitePosition.distanceTo(closestPointOnRay);

            // Check if within threshold and closer than previous best
            if (distanceToRay < selectionThreshold && distanceToRay < closestDistance) {
                closestDistance = distanceToRay;
                closestEntity = entity;
            }
        }

        return closestEntity;
    }

    /**
     * Log entity click information (now silent)
     */
    private logEntityClick(_entityId: EntityId): void {
        // Silently select entity without logging
    }

    /**
     * Update the entity-mesh mapping
     */
    private updateEntityMeshMap(entities: EntityId[]): void {
        this.entityMeshMap.clear();

        for (const entity of entities) {
            if (!this.engine) continue;

            // Check for mesh component
            const meshComponent = this.engine.getComponent(entity, ComponentType.MESH);
            if (meshComponent && "mesh" in meshComponent && meshComponent.mesh) {
                this.entityMeshMap.set(meshComponent.mesh as THREE.Object3D, entity);
            }

            // Check for billboard component (if it has a mesh representation)
            const billboardComponent = this.engine.getComponent(entity, ComponentType.BILLBOARD);
            if (billboardComponent && "mesh" in billboardComponent && billboardComponent.mesh) {
                this.entityMeshMap.set(billboardComponent.mesh as THREE.Object3D, entity);
            }
        }
    }

    /**
     * Update the selection box around the selected entity
     */
    private updateSelectionBox(entityId: EntityId | null): void {
        if (!this.renderingService) return;

        const scene = this.renderingService.getScene();

        // Remove existing selection box
        if (this.selectionBox) {
            scene.remove(this.selectionBox);
            this.selectionBox.dispose();
            this.selectionBox = null;
        }

        // Create new selection box if an entity is selected
        if (entityId !== null && this.engine) {
            const meshComponent = this.engine.getComponent(entityId, ComponentType.MESH);

            if (meshComponent && "mesh" in meshComponent && meshComponent.mesh) {
                const mesh = meshComponent.mesh as THREE.Mesh;
                this.selectionBox = new THREE.BoxHelper(mesh, 0xff0000); // Red box
                scene.add(this.selectionBox);
            }
        }
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        const startTime = performance.now();

        // Update entity-mesh mapping
        this.updateEntityMeshMap(entities);

        // Update selection box position if it exists
        if (this.selectionBox) {
            this.selectionBox.update();
        }

        this.selectionTime = performance.now() - startTime;
    }

    cleanup(): void {
        if (this.selectionBox && this.renderingService) {
            const scene = this.renderingService.getScene();
            scene.remove(this.selectionBox);
            this.selectionBox.dispose();
            this.selectionBox = null;
        }

        this.entityMeshMap.clear();
        this.engine = null;
        this.renderingService = null;
        this.selectionService = null;
    }
}

