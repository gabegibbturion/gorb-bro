// Main Engine Class - orchestrates the ECS architecture

import type { IEngine, EngineConfig, EntityId, Component, Service, System, IComponentRegistry, IQueryService } from "./types";
import { ComponentType } from "./types";
import { EntityManager } from "./EntityManager";
import { ComponentRegistry } from "./ComponentRegistry";
import { SystemManager } from "./SystemManager";
import { TimeService } from "./services/TimeService";
import { QueryService } from "./services/QueryService";
import { SelectionServiceImpl } from "./services/SelectionService";
import { PositionBufferService } from "./services/PositionBufferService";

export class Engine implements IEngine {
    private entityManager: EntityManager;
    private componentRegistry: ComponentRegistry;
    private systemManager: SystemManager;
    private services: Map<string, Service> = new Map();
    private isRunning: boolean = false; // Animation loop active
    private isPausedState: boolean = false; // Simulation paused (but still rendering)
    private animationFrameId: number | null = null;
    private lastTime: number = 0;
    public lastUpdateTime: number = 0; // Exposed for performance tracking

    constructor(config: EngineConfig = {}) {
        // Initialize core managers
        this.entityManager = new EntityManager(config.maxEntities);
        this.componentRegistry = new ComponentRegistry();
        this.systemManager = new SystemManager();

        // Initialize services
        this.initializeServices(config);

        // Initialize systems
        if (config.systems) {
            for (const system of config.systems) {
                this.addSystem(system);
            }
        }
    }

    private initializeServices(config: EngineConfig): void {
        // Set up default services if not provided
        const services = config.services || {};

        // Time service
        const timeService = services.time || new TimeService();
        this.services.set("time", timeService);

        // Query service
        const queryService = services.query || new QueryService();
        queryService.setComponentRegistry(this.componentRegistry);
        this.services.set("query", queryService as Service);

        // Selection service (always created)
        const selectionService = new SelectionServiceImpl();
        this.services.set("selection", selectionService as Service);

        // Position buffer service for performance
        const positionBuffer = new PositionBufferService(config.maxEntities || 100000);
        this.services.set("positionBuffer", positionBuffer as Service);

        // Rendering service (if provided)
        if (services.rendering) {
            this.services.set("rendering", services.rendering);
        }

        // Add any custom services
        for (const [name, service] of Object.entries(services)) {
            if (!this.services.has(name) && service) {
                this.services.set(name, service);
            }
        }
    }

    // Entity management
    createEntity(): EntityId {
        return this.entityManager.create();
    }

    destroyEntity(entity: EntityId): void {
        if (!this.entityManager.exists(entity)) {
            console.warn(`Attempting to destroy non-existent entity: ${entity}`);
            return;
        }

        this.componentRegistry.removeAllComponents(entity);
        this.entityManager.destroy(entity);
    }

    // Component management
    addComponent(entity: EntityId, component: Component): void {
        if (!this.entityManager.exists(entity)) {
            console.warn(`Attempting to add component to non-existent entity: ${entity}`);
            return;
        }

        this.componentRegistry.addComponent(entity, component);
    }

    removeComponent(entity: EntityId, componentType: ComponentType): void {
        this.componentRegistry.removeComponent(entity, componentType);
    }

    getComponent<T extends Component>(entity: EntityId, type: ComponentType): T | undefined {
        return this.componentRegistry.getComponent<T>(entity, type);
    }

    hasComponent(entity: EntityId, componentType: ComponentType): boolean {
        return this.componentRegistry.hasComponent(entity, componentType);
    }

    getEntitiesWithComponent(componentType: ComponentType): EntityId[] {
        return this.componentRegistry.getEntitiesWithComponent(componentType);
    }

    // System management
    addSystem(system: System): void {
        this.systemManager.add(system);
        system.init(this);
    }

    removeSystem(systemName: string): void {
        this.systemManager.remove(systemName);
    }

    getSystem(systemName: string): System | undefined {
        return this.systemManager.get(systemName);
    }

    // Main update loop
    update(deltaTime: number): void {
        const startTime = performance.now();

        // Update services that have update methods
        this.services.forEach((service) => {
            if ("update" in service && typeof service.update === "function") {
                service.update(deltaTime);
            }
        });

        // Update all systems
        this.systemManager.updateSystems(deltaTime, this.componentRegistry);

        // Clear dirty flags after all systems have run
        this.componentRegistry.clearDirty();

        this.lastUpdateTime = performance.now() - startTime;
    }

    // Service access
    getService<T extends Service>(name: string): T | undefined {
        return this.services.get(name) as T | undefined;
    }

    // ====================================================================
    // Selection Management
    // ====================================================================

    getSelectedEntity(): EntityId | null {
        const selectionService = this.services.get("selection") as SelectionServiceImpl | undefined;
        return selectionService?.getSelectedEntity() ?? null;
    }

    selectEntity(entityId: EntityId): void {
        const selectionService = this.services.get("selection") as SelectionServiceImpl | undefined;
        selectionService?.selectEntity(entityId);
    }

    deselectEntity(): void {
        const selectionService = this.services.get("selection") as SelectionServiceImpl | undefined;
        selectionService?.deselectEntity();
    }

    // Component registry access
    getComponentRegistry(): IComponentRegistry {
        return this.componentRegistry;
    }

    // Query service access
    getQueryService(): IQueryService {
        const queryService = this.services.get("query");
        if (!queryService) {
            throw new Error("QueryService not initialized");
        }
        return queryService as IQueryService;
    }

    // Animation loop management
    start(): void {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPausedState = false;
        this.lastTime = performance.now();

        // Start time service if available
        const timeService = this.getService<TimeService>("time");
        if (timeService && timeService.isPaused()) {
            timeService.play();
        }

        this.animate();
    }

    stop(): void {
        this.isRunning = false;
        this.isPausedState = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Pause time service if available
        const timeService = this.getService<TimeService>("time");
        if (timeService && !timeService.isPaused()) {
            timeService.pause();
        }
    }

    pause(): void {
        // Don't stop animation loop, just pause updates
        this.isPausedState = true;
        const timeService = this.getService<TimeService>("time");
        if (timeService) {
            timeService.pause();
        }
    }

    resume(): void {
        // Resume updates
        this.isPausedState = false;
        this.lastTime = performance.now(); // Reset time to avoid large delta

        const timeService = this.getService<TimeService>("time");
        if (timeService) {
            timeService.play();
        }
    }

    isPaused(): boolean {
        return this.isPausedState;
    }

    private animate = (): void => {
        // Stop animation loop entirely if not running
        if (!this.isRunning) return;

        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Only update engine state if not paused
        if (!this.isPausedState) {
            this.update(deltaTime);
        }

        // Always render, even when paused (so satellites stay visible)
        const renderingService = this.getService("rendering");
        if (renderingService && "render" in renderingService) {
            (renderingService as any).render();
        }

        // Continue animation loop
        this.animationFrameId = requestAnimationFrame(this.animate);
    };

    // Cleanup
    cleanup(): void {
        // Stop animation loop
        this.stop();

        // Cleanup all systems
        for (const system of this.systemManager.getOrderedSystems()) {
            system.cleanup();
        }

        // Cleanup all services
        this.services.forEach((service) => {
            if ("cleanup" in service && typeof service.cleanup === "function") {
                service.cleanup();
            }
        });

        // Clear all data
        this.services.clear();
    }

    // Utility methods
    getEntityCount(): number {
        return this.entityManager.getCount();
    }

    getAllEntities(): EntityId[] {
        return this.entityManager.getAll();
    }

    isEngineRunning(): boolean {
        return this.isRunning;
    }
}
