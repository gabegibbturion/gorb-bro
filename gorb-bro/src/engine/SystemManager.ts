// System Manager - orchestrates system execution

import type { System, ISystemManager, IComponentRegistry } from "./types";

export class SystemManager implements ISystemManager {
    private systems: Map<string, System> = new Map();
    private orderedSystems: System[] = [];

    add(system: System): void {
        if (this.systems.has(system.name)) {
            console.warn(`System ${system.name} already exists. Replacing.`);
        }

        this.systems.set(system.name, system);
        this.updateSystemOrder();
    }

    remove(systemName: string): void {
        const system = this.systems.get(systemName);
        if (system) {
            system.cleanup();
            this.systems.delete(systemName);
            this.updateSystemOrder();
        }
    }

    get(systemName: string): System | undefined {
        return this.systems.get(systemName);
    }

    getOrderedSystems(): System[] {
        return this.orderedSystems;
    }

    private updateSystemOrder(): void {
        // Sort systems by priority (lower priority runs first)
        this.orderedSystems = Array.from(this.systems.values()).sort((a, b) => a.priority - b.priority);
    }

    updateSystems(deltaTime: number, componentRegistry: IComponentRegistry): void {
        for (const system of this.orderedSystems) {
            // Query entities that have all required components
            const entities = this.queryEntitiesForSystem(system, componentRegistry);
            system.update(deltaTime, entities);
        }
    }

    private queryEntitiesForSystem(system: System, componentRegistry: IComponentRegistry): number[] {
        if (system.requiredComponents.length === 0) {
            return [];
        }

        // Get entities with all required components
        const candidates = componentRegistry.getEntitiesWithComponent(system.requiredComponents[0]);

        // Filter by remaining required components
        return candidates.filter((entity) => {
            return system.requiredComponents.every((compType) => componentRegistry.hasComponent(entity, compType));
        });
    }
}
