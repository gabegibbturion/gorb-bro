// Component Registry with pooling support

import type { Component, EntityId, IComponentRegistry } from "./types";
import { ComponentType } from "./types";
import { ComponentPool } from "./utils/ComponentPool";

export class ComponentRegistry implements IComponentRegistry {
    private components: Map<ComponentType, Map<EntityId, Component>> = new Map();
    private pools: Map<ComponentType, ComponentPool<any>> = new Map();
    private dirtyFlags: Set<EntityId> = new Set();
    private entityComponents: Map<EntityId, Set<ComponentType>> = new Map();

    constructor() {
        this.initializePools();
    }

    private initializePools(): void {
        // Initialize pools for each component type
        // For now, we'll create them on demand
    }

    private getComponentMap(type: ComponentType): Map<EntityId, Component> {
        if (!this.components.has(type)) {
            this.components.set(type, new Map());
        }
        return this.components.get(type)!;
    }

    addComponent<T extends Component>(entity: EntityId, component: T): void {
        const componentMap = this.getComponentMap(component.type);

        // Store the component
        componentMap.set(entity, component);

        // Track which components this entity has
        if (!this.entityComponents.has(entity)) {
            this.entityComponents.set(entity, new Set());
        }
        this.entityComponents.get(entity)!.add(component.type);

        this.markDirty(entity);
    }

    removeComponent(entity: EntityId, componentType: ComponentType): void {
        const componentMap = this.getComponentMap(componentType);
        const component = componentMap.get(entity);

        if (component) {
            // Release to pool if available
            const pool = this.pools.get(componentType);
            if (pool) {
                pool.release(component);
            }

            componentMap.delete(entity);

            // Update entity component tracking
            const entityComps = this.entityComponents.get(entity);
            if (entityComps) {
                entityComps.delete(componentType);
                if (entityComps.size === 0) {
                    this.entityComponents.delete(entity);
                }
            }

            this.markDirty(entity);
        }
    }

    getComponent<T extends Component>(entity: EntityId, type: ComponentType): T | undefined {
        const componentMap = this.getComponentMap(type);
        return componentMap.get(entity) as T | undefined;
    }

    hasComponent(entity: EntityId, componentType: ComponentType): boolean {
        const entityComps = this.entityComponents.get(entity);
        return entityComps ? entityComps.has(componentType) : false;
    }

    getAllComponents(entity: EntityId): Component[] {
        const entityComps = this.entityComponents.get(entity);
        if (!entityComps) return [];

        const components: Component[] = [];
        for (const type of entityComps) {
            const component = this.getComponent(entity, type);
            if (component) {
                components.push(component);
            }
        }
        return components;
    }

    removeAllComponents(entity: EntityId): void {
        const entityComps = this.entityComponents.get(entity);
        if (!entityComps) return;

        // Remove all components for this entity
        for (const type of entityComps) {
            this.removeComponent(entity, type);
        }

        this.entityComponents.delete(entity);
        this.markDirty(entity);
    }

    markDirty(entity: EntityId): void {
        this.dirtyFlags.add(entity);
    }

    clearDirty(): void {
        this.dirtyFlags.clear();
    }

    getDirtyEntities(): Set<EntityId> {
        return new Set(this.dirtyFlags);
    }

    getEntitiesWithComponent(componentType: ComponentType): EntityId[] {
        const componentMap = this.getComponentMap(componentType);
        return Array.from(componentMap.keys());
    }

    // Utility method to get entities with multiple components
    getEntitiesWithComponents(...componentTypes: ComponentType[]): EntityId[] {
        if (componentTypes.length === 0) return [];

        // Start with entities that have the first component
        const firstType = componentTypes[0];
        const candidates = this.getEntitiesWithComponent(firstType);

        // Filter to only include entities that have all required components
        return candidates.filter((entity) => {
            return componentTypes.every((type) => this.hasComponent(entity, type));
        });
    }
}
