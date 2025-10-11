// Object pooling for components to reduce garbage collection pressure

import type { Component } from "../types";

export class ComponentPool<T extends Component> {
    private pool: T[] = [];
    private factory: () => T;
    private reset: (obj: T) => void;

    constructor(factory: () => T, reset: (obj: T) => void, initialSize: number = 100) {
        this.factory = factory;
        this.reset = reset;

        // Pre-allocate initial pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.factory());
        }
    }

    acquire(): T {
        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }
        return this.factory();
    }

    release(obj: T): void {
        this.reset(obj);
        this.pool.push(obj);
    }

    getSize(): number {
        return this.pool.length;
    }

    clear(): void {
        this.pool = [];
    }
}
