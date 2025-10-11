// System for handling entity selection via raycasting and rendering selection boxes

import * as THREE from "three";
import type { System, EntityId, IEngine, PositionComponent } from "../types";
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

        // Get all objects in the scene
        const scene = this.renderingService.getScene();
        const intersects = this.raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            // Find the first intersected object that has an associated entity
            for (const intersect of intersects) {
                let obj: THREE.Object3D | null = intersect.object;

                // Traverse up to find an object with an entity mapping
                while (obj) {
                    const entityId = this.entityMeshMap.get(obj);
                    if (entityId !== undefined) {
                        console.log(`🎯 Entity clicked: ${entityId}`);

                        // Log entity components if engine is available
                        if (this.engine) {
                            const position = this.engine.getComponent<PositionComponent>(entityId, ComponentType.POSITION);
                            const mesh = this.engine.getComponent(entityId, ComponentType.MESH);
                            const billboard = this.engine.getComponent(entityId, ComponentType.BILLBOARD);

                            console.log(`   Components:`, {
                                hasPosition: !!position,
                                hasMesh: !!mesh,
                                hasBillboard: !!billboard,
                            });

                            if (position) {
                                console.log(`   Position: [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}]`);
                            }
                        }

                        this.selectionService.selectEntity(entityId);
                        return;
                    }
                    obj = obj.parent;
                }
            }
        }

        // No entity clicked, deselect
        console.log(`❌ Clicked empty space - deselecting`);
        this.selectionService.deselectEntity();
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
                this.selectionBox = new THREE.BoxHelper(mesh, 0x00ff00); // Green box
                scene.add(this.selectionBox);
            }
        }
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        // Update entity-mesh mapping
        this.updateEntityMeshMap(entities);

        // Update selection box position if it exists
        if (this.selectionBox) {
            this.selectionBox.update();
        }
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
