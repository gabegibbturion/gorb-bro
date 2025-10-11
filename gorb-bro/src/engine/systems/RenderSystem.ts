// Render System - manages visual representation of entities

import * as THREE from "three";
import type { System, EntityId, IEngine, PositionComponent, BillboardComponent, MeshComponent, LabelComponent } from "../types";
import { ComponentType } from "../types";
import { RenderingService } from "../services/RenderingService";

export class RenderSystem implements System {
    name = "render";
    priority = 1000;
    requiredComponents = [ComponentType.POSITION];
    optionalComponents = [ComponentType.BILLBOARD, ComponentType.MESH, ComponentType.LABEL];

    private engine: IEngine | null = null;
    private renderingService: RenderingService | null = null;

    // Object tracking
    private renderObjects: Map<EntityId, THREE.Object3D> = new Map();
    private billboardGeometry: THREE.BufferGeometry | null = null;
    private billboardMaterial: THREE.PointsMaterial | null = null;

    init(engine: IEngine): void {
        this.engine = engine;
        this.renderingService = engine.getService<RenderingService>("rendering") || null;

        // Initialize billboard geometry and material
        this.initializeBillboardRendering();
    }

    private initializeBillboardRendering(): void {
        // Create shared geometry for billboards (points)
        this.billboardGeometry = new THREE.BufferGeometry();

        // Create material for billboards
        this.billboardMaterial = new THREE.PointsMaterial({
            size: 10,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
        });
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        if (!this.engine || !this.renderingService) return;

        for (const entity of entities) {
            const position = this.engine.getComponent<PositionComponent>(entity, ComponentType.POSITION);

            if (!position) continue;

            // Check if entity has billboard component
            const billboard = this.engine.getComponent<BillboardComponent>(entity, ComponentType.BILLBOARD);

            // Check if entity has mesh component
            const mesh = this.engine.getComponent<MeshComponent>(entity, ComponentType.MESH);

            // Update or create render object
            if (billboard && !mesh) {
                this.updateBillboard(entity, position, billboard);
            } else if (mesh) {
                this.updateMesh(entity, position, mesh);
            }

            // Handle labels separately
            const label = this.engine.getComponent<LabelComponent>(entity, ComponentType.LABEL);
            if (label) {
                this.updateLabel(entity, position, label);
            }
        }

        // Remove render objects for entities that no longer exist
        this.cleanupRemovedEntities(entities);
    }

    private updateBillboard(entity: EntityId, position: PositionComponent, billboard: BillboardComponent): void {
        if (!this.renderingService) return;

        let object = this.renderObjects.get(entity);

        if (!object) {
            // Create new sprite
            const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    color: billboard.color,
                    sizeAttenuation: billboard.sizeAttenuation,
                })
            );
            sprite.scale.set(billboard.size, billboard.size, 1);
            object = sprite;

            this.renderObjects.set(entity, object);
            this.renderingService.addObject(object);
        }

        // Update position
        object.position.set(position.x, position.y, position.z);

        // Update scale if changed
        if (object instanceof THREE.Sprite) {
            object.scale.set(billboard.size, billboard.size, 1);
        }
    }

    private updateMesh(entity: EntityId, position: PositionComponent, meshComponent: MeshComponent): void {
        if (!this.renderingService) return;

        let object = this.renderObjects.get(entity);

        if (!object) {
            // Create new mesh
            const geometry = this.renderingService.getGeometry(meshComponent.geometry) || new THREE.BoxGeometry(1, 1, 1);
            const material = this.renderingService.getMaterial(meshComponent.material) || new THREE.MeshStandardMaterial({ color: 0xffffff });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.scale.set(...meshComponent.scale);
            object = mesh;

            this.renderObjects.set(entity, object);
            this.renderingService.addObject(object);
        }

        // Update position
        object.position.set(position.x, position.y, position.z);

        // Update scale if changed
        if (object instanceof THREE.Mesh) {
            object.scale.set(...meshComponent.scale);
        }
    }

    private updateLabel(_entity: EntityId, _position: PositionComponent, _label: LabelComponent): void {
        // Label rendering would require HTML/CSS overlays or sprite text
        // For now, this is a placeholder
        // In a full implementation, this would create DOM elements or canvas sprites
    }

    private cleanupRemovedEntities(activeEntities: EntityId[]): void {
        if (!this.renderingService) return;

        const activeSet = new Set(activeEntities);

        // Find entities that have render objects but are no longer active
        for (const [entity, object] of this.renderObjects.entries()) {
            if (!activeSet.has(entity)) {
                this.renderingService.removeObject(object);
                this.renderObjects.delete(entity);

                // Dispose geometry and material if they're not shared
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material instanceof THREE.Material) {
                        object.material.dispose();
                    }
                }
            }
        }
    }

    cleanup(): void {
        if (this.renderingService) {
            // Remove all render objects
            for (const object of this.renderObjects.values()) {
                this.renderingService.removeObject(object);
            }
        }

        this.renderObjects.clear();

        // Dispose billboard resources
        if (this.billboardGeometry) {
            this.billboardGeometry.dispose();
        }
        if (this.billboardMaterial) {
            this.billboardMaterial.dispose();
        }

        this.engine = null;
        this.renderingService = null;
    }
}
