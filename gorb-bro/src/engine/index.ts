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

// Systems
export { PropagationSystem } from "./systems/PropagationSystem";
export { TransformSystem } from "./systems/TransformSystem";
export { RenderSystem } from "./systems/RenderSystem";

// Utilities
export { ComponentPool } from "./utils/ComponentPool";

// Factories
export * from "./factories/EntityFactories";

// Default Objects
export * from "./objects";

// Propagators
export { SGP4Propagator } from "./propagators/SGP4Propagator";

// Additional Systems
export { CelestialUpdateSystem } from "./systems/CelestialUpdateSystem";

// Utilities
export { TLELoader } from "./utils/TLELoader";
