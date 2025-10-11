// Propagation System - updates entity positions based on orbital elements

import type { System, EntityId, IEngine, OrbitalElementsComponent, PropagatorComponent, PositionComponent, VelocityComponent } from "../types";
import { ComponentType } from "../types";
import { TimeService } from "../services/TimeService";
import type { InstancedSatelliteSystem } from "./InstancedSatelliteSystem";

export class PropagationSystem implements System {
    name = "propagation";
    priority = 100;
    requiredComponents = [ComponentType.ORBITAL_ELEMENTS, ComponentType.PROPAGATOR];
    optionalComponents = [ComponentType.POSITION, ComponentType.VELOCITY];

    private engine: IEngine | null = null;
    private timeService: TimeService | null = null;
    private instancedSatelliteSystem: InstancedSatelliteSystem | null = null;
    public propagationTime: number = 0; // Exposed for stats

    init(engine: IEngine): void {
        console.log("[PropagationSystem] Initializing...");
        this.engine = engine;
        this.timeService = engine.getService<TimeService>("time") || null;

        // Get InstancedSatelliteSystem for direct array manipulation
        this.instancedSatelliteSystem = engine.getSystem("instancedSatellite") as InstancedSatelliteSystem | null;

        if (this.instancedSatelliteSystem) {
            console.log("[PropagationSystem] ✅ Direct array manipulation enabled");
        } else {
            console.warn("[PropagationSystem] ⚠️ InstancedSatelliteSystem not found, using fallback");
        }
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
                // ZERO-COPY Fast path: Direct array write if available
                let propagationSuccess = false;

                if (this.instancedSatelliteSystem && propagator.propagator.propagateDirect) {
                    // Get array access and write directly
                    const positionArray = this.instancedSatelliteSystem.getPositionArray();
                    const index = this.instancedSatelliteSystem.getEntityIndex(entity);

                    if (index !== undefined && index >= 0) {
                        propagationSuccess = propagator.propagator.propagateDirect(orbital.data, currentTime, positionArray, index);
                    } else {
                        // Allocate index for new entity
                        const newIndex = this.instancedSatelliteSystem.allocateIndex(entity);
                        if (newIndex >= 0) {
                            propagationSuccess = propagator.propagator.propagateDirect(orbital.data, currentTime, positionArray, newIndex);
                        }
                    }
                }

                // Fallback: Use legacy API if direct write not available or failed
                if (!propagationSuccess) {
                    const state = propagator.propagator.propagate(orbital.data, currentTime);

                    // Try to write via high-level API
                    if (this.instancedSatelliteSystem) {
                        this.instancedSatelliteSystem.writePositionDirect(entity, state.position.x, state.position.y, state.position.z);
                    }

                    // Update position component for compatibility
                    const existingPos = this.engine.getComponent<PositionComponent>(entity, ComponentType.POSITION);

                    if (existingPos) {
                        existingPos.x = state.position.x;
                        existingPos.y = state.position.y;
                        existingPos.z = state.position.z;
                        existingPos.frame = state.frame;
                    } else {
                        this.engine.addComponent(entity, {
                            type: ComponentType.POSITION,
                            x: state.position.x,
                            y: state.position.y,
                            z: state.position.z,
                            frame: state.frame,
                        });
                    }

                    // Update velocity
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
                }
            } catch (error) {
                // Silently skip entities with propagation errors to avoid console spam
                if (Math.random() < 0.001) {
                    console.warn(`[PropagationSystem] Propagation error for entity ${entity}:`, error);
                }
            }
        }

        this.propagationTime = performance.now() - startTime;
    }

    cleanup(): void {
        this.engine = null;
        this.timeService = null;
        this.instancedSatelliteSystem = null;
    }
}
