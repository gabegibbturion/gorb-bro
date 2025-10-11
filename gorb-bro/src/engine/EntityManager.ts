// Entity Manager - handles entity lifecycle

import type { EntityId, IEntityManager } from "./types";

export class EntityManager implements IEntityManager {
    private nextEntityId: EntityId = 1;
    private entities: Set<EntityId> = new Set();
    private recycledIds: EntityId[] = [];
    private maxEntities: number;

    constructor(maxEntities: number = 100000) {
        this.maxEntities = maxEntities;
    }

    create(): EntityId {
        if (this.entities.size >= this.maxEntities) {
            throw new Error(`Maximum entity limit reached: ${this.maxEntities}`);
        }

        let id: EntityId;

        // Reuse recycled IDs if available
        if (this.recycledIds.length > 0) {
            id = this.recycledIds.pop()!;
        } else {
            id = this.nextEntityId++;
        }

        this.entities.add(id);
        return id;
    }

    destroy(entity: EntityId): void {
        if (!this.entities.has(entity)) {
            console.warn(`Attempting to destroy non-existent entity: ${entity}`);
            return;
        }

        this.entities.delete(entity);
        this.recycledIds.push(entity);
    }

    exists(entity: EntityId): boolean {
        return this.entities.has(entity);
    }

    getAll(): EntityId[] {
        return Array.from(this.entities);
    }

    getCount(): number {
        return this.entities.size;
    }
}
