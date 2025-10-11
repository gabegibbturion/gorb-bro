// Transform System - converts positions to render coordinates

import * as THREE from "three";
import type { System, EntityId, IEngine, PositionComponent, TransformComponent } from "../types";
import { ComponentType, ReferenceFrame } from "../types";

export class TransformSystem implements System {
    name = "transform";
    priority = 200;
    requiredComponents = [ComponentType.POSITION];
    optionalComponents = [ComponentType.TRANSFORM];

    private engine: IEngine | null = null;
    private transformCache: Map<EntityId, THREE.Matrix4> = new Map();
    private renderFrame: ReferenceFrame = ReferenceFrame.RENDER;
    public transformTime: number = 0; // Exposed for stats

    init(engine: IEngine): void {
        this.engine = engine;
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        if (!this.engine) return;

        const startTime = performance.now();

        for (const entity of entities) {
            const position = this.engine.getComponent<PositionComponent>(entity, ComponentType.POSITION);

            if (!position) continue;

            // For now, simple pass-through transform
            // In a full implementation, this would convert between reference frames
            const renderPos = this.convertToRenderFrame(position);

            // Get or create transform matrix
            let transform = this.transformCache.get(entity);
            if (!transform) {
                transform = new THREE.Matrix4();
                this.transformCache.set(entity, transform);
            }

            // Update transform matrix
            transform.makeTranslation(renderPos.x, renderPos.y, renderPos.z);

            // Update or create transform component
            const existingTransform = this.engine.getComponent<TransformComponent>(entity, ComponentType.TRANSFORM);

            const transformComponent: TransformComponent = {
                type: ComponentType.TRANSFORM,
                matrix: transform.clone(),
            };

            if (existingTransform) {
                existingTransform.matrix.copy(transform);
            } else {
                this.engine.addComponent(entity, transformComponent);
            }
        }

        this.transformTime = performance.now() - startTime;
    }

    private convertToRenderFrame(position: PositionComponent): {
        x: number;
        y: number;
        z: number;
    } {
        // Simple conversion - in a full implementation this would use a FrameConverter
        if (position.frame === this.renderFrame) {
            return { x: position.x, y: position.y, z: position.z };
        }

        // For now, just pass through
        return { x: position.x, y: position.y, z: position.z };
    }

    cleanup(): void {
        this.transformCache.clear();
        this.engine = null;
    }
}
