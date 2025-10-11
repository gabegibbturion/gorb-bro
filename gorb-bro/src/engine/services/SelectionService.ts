// Service for managing entity selection

import type { Service, EntityId } from "../types";

export interface SelectionService extends Service {
    getSelectedEntity(): EntityId | null;
    selectEntity(entityId: EntityId): void;
    deselectEntity(): void;
    isSelected(entityId: EntityId): boolean;
    onSelectionChange(callback: (entityId: EntityId | null) => void): () => void;
}

export class SelectionServiceImpl implements SelectionService {
    private selectedEntity: EntityId | null = null;
    private callbacks: Set<(entityId: EntityId | null) => void> = new Set();

    /**
     * Get the currently selected entity
     */
    getSelectedEntity(): EntityId | null {
        return this.selectedEntity;
    }

    /**
     * Select an entity
     */
    selectEntity(entityId: EntityId): void {
        if (this.selectedEntity === entityId) return;

        this.selectedEntity = entityId;
        this.notifyCallbacks();
    }

    /**
     * Deselect the current entity
     */
    deselectEntity(): void {
        if (this.selectedEntity === null) return;

        this.selectedEntity = null;
        this.notifyCallbacks();
    }

    /**
     * Check if an entity is selected
     */
    isSelected(entityId: EntityId): boolean {
        return this.selectedEntity === entityId;
    }

    /**
     * Register a callback for selection changes
     * Returns an unsubscribe function
     */
    onSelectionChange(callback: (entityId: EntityId | null) => void): () => void {
        this.callbacks.add(callback);
        return () => {
            this.callbacks.delete(callback);
        };
    }

    /**
     * Notify all callbacks of selection change
     */
    private notifyCallbacks(): void {
        this.callbacks.forEach((callback) => callback(this.selectedEntity));
    }

    cleanup(): void {
        this.selectedEntity = null;
        this.callbacks.clear();
    }
}

