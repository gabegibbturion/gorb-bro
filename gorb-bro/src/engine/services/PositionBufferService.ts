// Shared position buffer service for high-performance satellite rendering

import type { Service, EntityId } from "../types";

/**
 * PositionBufferService manages a shared Float32Array buffer for entity positions
 * This allows zero-copy updates from propagators to renderers
 */
export class PositionBufferService implements Service {
    private buffer: Float32Array;
    private entityToIndex: Map<EntityId, number> = new Map();
    private indexToEntity: Map<number, EntityId> = new Map();
    private nextIndex: number = 0;
    private maxEntities: number;
    private freeIndices: number[] = [];

    constructor(maxEntities: number = 100000) {
        this.maxEntities = maxEntities;
        // Each entity needs 3 floats (x, y, z)
        this.buffer = new Float32Array(maxEntities * 3);
    }

    /**
     * Register an entity and get its buffer index
     */
    registerEntity(entityId: EntityId): number {
        // Check if already registered
        const existing = this.entityToIndex.get(entityId);
        if (existing !== undefined) {
            return existing;
        }

        // Get index from free list or allocate new
        let index: number;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;
        } else {
            if (this.nextIndex >= this.maxEntities) {
                throw new Error(`Position buffer full: ${this.maxEntities} entities maximum`);
            }
            index = this.nextIndex++;
        }

        this.entityToIndex.set(entityId, index);
        this.indexToEntity.set(index, entityId);

        return index;
    }

    /**
     * Unregister an entity and free its buffer space
     */
    unregisterEntity(entityId: EntityId): void {
        const index = this.entityToIndex.get(entityId);
        if (index === undefined) return;

        this.entityToIndex.delete(entityId);
        this.indexToEntity.delete(index);
        this.freeIndices.push(index);

        // Clear buffer data
        const offset = index * 3;
        this.buffer[offset] = 0;
        this.buffer[offset + 1] = 0;
        this.buffer[offset + 2] = 0;
    }

    /**
     * Get buffer index for an entity
     */
    getIndex(entityId: EntityId): number | undefined {
        return this.entityToIndex.get(entityId);
    }

    /**
     * Get entity ID from buffer index
     */
    getEntity(index: number): EntityId | undefined {
        return this.indexToEntity.get(index);
    }

    /**
     * Write position directly to buffer (fast path)
     */
    writePosition(index: number, x: number, y: number, z: number): void {
        const offset = index * 3;
        this.buffer[offset] = x;
        this.buffer[offset + 1] = y;
        this.buffer[offset + 2] = z;
    }

    /**
     * Read position from buffer
     */
    readPosition(index: number): { x: number; y: number; z: number } {
        const offset = index * 3;
        return {
            x: this.buffer[offset],
            y: this.buffer[offset + 1],
            z: this.buffer[offset + 2],
        };
    }

    /**
     * Get the raw buffer (for Three.js BufferAttribute)
     */
    getBuffer(): Float32Array {
        return this.buffer;
    }

    /**
     * Get the number of registered entities
     */
    getEntityCount(): number {
        return this.entityToIndex.size;
    }

    /**
     * Get the current buffer usage
     */
    getUsedIndices(): number {
        return this.nextIndex - this.freeIndices.length;
    }

    cleanup(): void {
        this.entityToIndex.clear();
        this.indexToEntity.clear();
        this.freeIndices = [];
        this.nextIndex = 0;
        this.buffer.fill(0);
    }
}
