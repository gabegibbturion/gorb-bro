// Propagation System - updates entity positions based on orbital elements

import type { System, EntityId, IEngine, OrbitalElementsComponent, PropagatorComponent, PositionComponent, VelocityComponent } from "../types";
import { ComponentType } from "../types";
import { TimeService } from "../services/TimeService";
import type { PositionBufferService } from "../services/PositionBufferService";

export class PropagationSystem implements System {
    name = "propagation";
    priority = 100;
    requiredComponents = [ComponentType.ORBITAL_ELEMENTS, ComponentType.PROPAGATOR];
    optionalComponents = [ComponentType.POSITION, ComponentType.VELOCITY];

    private engine: IEngine | null = null;
    private timeService: TimeService | null = null;
    private positionBuffer: PositionBufferService | null = null;
    public propagationTime: number = 0; // Exposed for stats

    init(engine: IEngine): void {
        this.engine = engine;
        this.timeService = engine.getService<TimeService>("time") || null;
        this.positionBuffer = engine.getService<PositionBufferService>("positionBuffer") || null;
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        if (!this.engine || !this.timeService) return;

        const startTime = performance.now();
        const currentTime = this.timeService.getCurrentTime();

        for (const entity of entities) {
            const orbital = this.engine.getComponent<OrbitalElementsComponent>(entity, ComponentType.ORBITAL_ELEMENTS);
            const propagator = this.engine.getComponent<PropagatorComponent>(entity, ComponentType.PROPAGATOR);

            if (!orbital || !propagator) continue;

            try {
                // Propagate to current time
                const state = propagator.propagator.propagate(orbital.data, currentTime);

                // Fast path: Write directly to position buffer if available
                if (this.positionBuffer) {
                    let bufferIndex = this.positionBuffer.getIndex(entity);
                    if (bufferIndex === undefined) {
                        bufferIndex = this.positionBuffer.registerEntity(entity);
                    }
                    this.positionBuffer.writePosition(bufferIndex, state.position.x, state.position.y, state.position.z);
                }

                // Also update position component for compatibility
                const existingPos = this.engine.getComponent<PositionComponent>(entity, ComponentType.POSITION);

                if (existingPos) {
                    // Update existing (fast)
                    existingPos.x = state.position.x;
                    existingPos.y = state.position.y;
                    existingPos.z = state.position.z;
                    existingPos.frame = state.frame;
                } else {
                    // Add new
                    this.engine.addComponent(entity, {
                        type: ComponentType.POSITION,
                        x: state.position.x,
                        y: state.position.y,
                        z: state.position.z,
                        frame: state.frame,
                    });
                }

                // Update velocity (less critical for rendering)
                const existingVel = this.engine.getComponent<VelocityComponent>(entity, ComponentType.VELOCITY);

                if (existingVel) {
                    existingVel.vx = state.velocity.vx;
                    existingVel.vy = state.velocity.vy;
                    existingVel.vz = state.velocity.vz;
                    existingVel.frame = state.frame;
                } else {
                    this.engine.addComponent(entity, {
                        type: ComponentType.VELOCITY,
                        vx: state.velocity.vx,
                        vy: state.velocity.vy,
                        vz: state.velocity.vz,
                        frame: state.frame,
                    });
                }
            } catch (error) {
                // Silently skip entities with propagation errors to avoid console spam
                // Only log occasionally
                if (Math.random() < 0.001) {
                    // 0.1% chance
                    console.warn(`Propagation error for entity ${entity}:`, error);
                }
            }
        }

        this.propagationTime = performance.now() - startTime;
    }

    cleanup(): void {
        this.engine = null;
        this.timeService = null;
    }
}
