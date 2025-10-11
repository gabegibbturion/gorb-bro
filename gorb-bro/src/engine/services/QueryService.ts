// Query Service - advanced entity querying capabilities

import * as THREE from "three";
import type { IQueryService, EntityId, IComponentRegistry, PositionComponent, TimeVisibilityComponent } from "../types";
import { ComponentType, ReferenceFrame } from "../types";

export class QueryService implements IQueryService {
    private componentRegistry: IComponentRegistry | null = null;
    private indices: Map<string, Map<string, Set<EntityId>>> = new Map();
    private typeIndex: Map<string, Set<EntityId>> = new Map();

    setComponentRegistry(registry: IComponentRegistry): void {
        this.componentRegistry = registry;
    }

    private ensureRegistry(): IComponentRegistry {
        if (!this.componentRegistry) {
            throw new Error("ComponentRegistry not set in QueryService");
        }
        return this.componentRegistry;
    }

    // Type-based queries
    findByComponents(...componentTypes: ComponentType[]): EntityId[] {
        const registry = this.ensureRegistry();

        if (componentTypes.length === 0) return [];

        // Start with entities that have the first component
        let candidates = registry.getEntitiesWithComponent(componentTypes[0]);

        // Filter to only include entities that have all required components
        for (let i = 1; i < componentTypes.length; i++) {
            candidates = candidates.filter((entity) => registry.hasComponent(entity, componentTypes[i]));
        }

        return candidates;
    }

    findByEntityType(type: string): EntityId[] {
        return Array.from(this.typeIndex.get(type) || []);
    }

    // Property-based queries
    findByProperty<T>(componentType: ComponentType, property: string, value: T): EntityId[] {
        const registry = this.ensureRegistry();
        const entities = registry.getEntitiesWithComponent(componentType);

        return entities.filter((entity) => {
            const component = registry.getComponent(entity, componentType);
            return component && (component as any)[property] === value;
        });
    }

    findByPredicate(predicate: (entity: EntityId) => boolean): EntityId[] {
        const registry = this.ensureRegistry();
        const allEntities = registry.getEntitiesWithComponent(ComponentType.POSITION);
        return allEntities.filter(predicate);
    }

    // Time-based queries
    findVisibleAt(time: number): EntityId[] {
        const registry = this.ensureRegistry();
        const entitiesWithTimeVisibility = registry.getEntitiesWithComponent(ComponentType.TIME_VISIBILITY);

        return entitiesWithTimeVisibility.filter((entity) => {
            const visibility = registry.getComponent<TimeVisibilityComponent>(entity, ComponentType.TIME_VISIBILITY);
            if (!visibility) return false;
            return time >= visibility.startTime && time <= visibility.endTime;
        });
    }

    findInTimeRange(start: number, end: number): EntityId[] {
        const registry = this.ensureRegistry();
        const entitiesWithTimeVisibility = registry.getEntitiesWithComponent(ComponentType.TIME_VISIBILITY);

        return entitiesWithTimeVisibility.filter((entity) => {
            const visibility = registry.getComponent<TimeVisibilityComponent>(entity, ComponentType.TIME_VISIBILITY);
            if (!visibility) return false;

            // Check if visibility range overlaps with query range
            return !(visibility.endTime < start || visibility.startTime > end);
        });
    }

    // Spatial queries
    findInRadius(center: THREE.Vector3, radius: number, frame?: ReferenceFrame): EntityId[] {
        const registry = this.ensureRegistry();
        const entities = registry.getEntitiesWithComponent(ComponentType.POSITION);

        const radiusSquared = radius * radius;

        return entities.filter((entity) => {
            const position = registry.getComponent<PositionComponent>(entity, ComponentType.POSITION);
            if (!position) return false;

            // If frame is specified, filter by frame
            if (frame && position.frame !== frame) return false;

            const dx = position.x - center.x;
            const dy = position.y - center.y;
            const dz = position.z - center.z;
            const distSquared = dx * dx + dy * dy + dz * dz;

            return distSquared <= radiusSquared;
        });
    }

    findInFrustum(frustum: THREE.Frustum): EntityId[] {
        const registry = this.ensureRegistry();
        const entities = registry.getEntitiesWithComponent(ComponentType.POSITION);

        const point = new THREE.Vector3();

        return entities.filter((entity) => {
            const position = registry.getComponent<PositionComponent>(entity, ComponentType.POSITION);
            if (!position) return false;

            point.set(position.x, position.y, position.z);
            return frustum.containsPoint(point);
        });
    }

    // Index management
    createIndex(name: string, indexFn: (entity: EntityId) => string): void {
        const registry = this.ensureRegistry();
        const index = new Map<string, Set<EntityId>>();

        // Build index for all entities with position component
        const entities = registry.getEntitiesWithComponent(ComponentType.POSITION);

        for (const entity of entities) {
            const key = indexFn(entity);
            if (!index.has(key)) {
                index.set(key, new Set());
            }
            index.get(key)!.add(entity);
        }

        this.indices.set(name, index);
    }

    queryIndex(indexName: string, key: string): EntityId[] {
        const index = this.indices.get(indexName);
        if (!index) return [];

        const entities = index.get(key);
        return entities ? Array.from(entities) : [];
    }

    // Helper method to tag entity types
    tagEntityType(entity: EntityId, type: string): void {
        if (!this.typeIndex.has(type)) {
            this.typeIndex.set(type, new Set());
        }
        this.typeIndex.get(type)!.add(entity);
    }

    untagEntityType(entity: EntityId, type: string): void {
        const typeSet = this.typeIndex.get(type);
        if (typeSet) {
            typeSet.delete(entity);
        }
    }
}
