// Main exports for Gorb Bro ECS Engine

// Core Engine
export { Engine } from "./Engine";
export { EntityManager } from "./EntityManager";
export { ComponentRegistry } from "./ComponentRegistry";
export { SystemManager } from "./SystemManager";

// Types and Interfaces
export * from "./types";

// Services
export { TimeService } from "./services/TimeService";
export { RenderingService } from "./services/RenderingService";
export { QueryService } from "./services/QueryService";
export { SelectionServiceImpl, type SelectionService } from "./services/SelectionService";

// Systems
export { PropagationSystem } from "./systems/PropagationSystem";
export { TransformSystem } from "./systems/TransformSystem";
export { RenderSystem } from "./systems/RenderSystem";
export { SelectionSystem } from "./systems/SelectionSystem";
export { CelestialUpdateSystem } from "./systems/CelestialUpdateSystem";

// Utilities
export { ComponentPool } from "./utils/ComponentPool";

// Factories
export * from "./factories/EntityFactories";

// Default Objects
export * from "./objects";
export { createSolarSystem } from "./objects/factories";

// Propagators
export { SGP4Propagator } from "./propagators/SGP4Propagator";
export { HybridK2SGP4Propagator, type HybridK2SGP4Config } from "./propagators/HybridK2SGP4Propagator";

// Utilities
export { TLELoader } from "./utils/TLELoader";
export * from "./utils/OrbitalMath";
