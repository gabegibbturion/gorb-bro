// Propagation System - updates entity positions based on orbital elements

import type { System, EntityId, IEngine, OrbitalElementsComponent, PropagatorComponent, PositionComponent, VelocityComponent } from "../types";
import { ComponentType } from "../types";
import { TimeService } from "../services/TimeService";

export class PropagationSystem implements System {
    name = "propagation";
    priority = 100;
    requiredComponents = [ComponentType.ORBITAL_ELEMENTS, ComponentType.PROPAGATOR];
    optionalComponents = [ComponentType.POSITION, ComponentType.VELOCITY];

    private engine: IEngine | null = null;
    private timeService: TimeService | null = null;

    init(engine: IEngine): void {
        this.engine = engine;
        this.timeService = engine.getService<TimeService>("time") || null;
    }

    update(_deltaTime: number, entities: EntityId[]): void {
        if (!this.engine || !this.timeService) return;

        const currentTime = this.timeService.getCurrentTime();

        for (const entity of entities) {
            const orbital = this.engine.getComponent<OrbitalElementsComponent>(entity, ComponentType.ORBITAL_ELEMENTS);
            const propagator = this.engine.getComponent<PropagatorComponent>(entity, ComponentType.PROPAGATOR);

            if (!orbital || !propagator) continue;

            try {
                // Propagate to current time
                const state = propagator.propagator.propagate(orbital.data, currentTime);

                // Update or create position component
                const existingPos = this.engine.getComponent<PositionComponent>(entity, ComponentType.POSITION);

                const posComponent: PositionComponent = {
                    type: ComponentType.POSITION,
                    x: state.position.x,
                    y: state.position.y,
                    z: state.position.z,
                    frame: state.frame,
                };

                if (existingPos) {
                    // Update existing
                    Object.assign(existingPos, posComponent);
                } else {
                    // Add new
                    this.engine.addComponent(entity, posComponent);
                }

                // Update or create velocity component
                const existingVel = this.engine.getComponent<VelocityComponent>(entity, ComponentType.VELOCITY);

                const velComponent: VelocityComponent = {
                    type: ComponentType.VELOCITY,
                    vx: state.velocity.vx,
                    vy: state.velocity.vy,
                    vz: state.velocity.vz,
                    frame: state.frame,
                };

                if (existingVel) {
                    // Update existing
                    Object.assign(existingVel, velComponent);
                } else {
                    // Add new
                    this.engine.addComponent(entity, velComponent);
                }
            } catch (error) {
                console.error(`Propagation error for entity ${entity}:`, error);
            }
        }
    }

    cleanup(): void {
        this.engine = null;
        this.timeService = null;
    }
}
