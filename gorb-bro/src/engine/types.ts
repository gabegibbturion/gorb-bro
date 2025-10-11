// Core Type Definitions and Enums for Gorb Bro ECS

import * as THREE from "three";

// ============================================================================
// Entity Types
// ============================================================================

export type EntityId = number;

// ============================================================================
// Enums
// ============================================================================

export enum ComponentType {
    POSITION = "position",
    VELOCITY = "velocity",
    ORBITAL_ELEMENTS = "orbitalElements",
    PROPAGATOR = "propagator",
    BILLBOARD = "billboard",
    MESH = "mesh",
    LABEL = "label",
    TIME_VISIBILITY = "timeVisibility",
    LOD = "lod",
    TRANSFORM = "transform",
}

export enum ReferenceFrame {
    ECI = "eci", // Earth-Centered Inertial
    ECEF = "ecef", // Earth-Centered Earth-Fixed
    J2000 = "j2000", // J2000 Inertial
    TEME = "teme", // True Equator Mean Equinox
    RENDER = "render", // Render coordinate system
}

export enum OrbitalFormat {
    KEPLERIAN = "keplerian",
    TLE = "tle",
    CARTESIAN = "cartesian",
}

export enum PropagatorAlgorithm {
    SGP4 = "sgp4",
    KEPLER = "kepler",
    CUSTOM = "custom",
}

export enum LODStrategy {
    DISTANCE = "distance",
    SCREEN_SIZE = "screenSize",
    DENSITY = "density",
}

export enum TimeSystem {
    UTC = "utc",
    TAI = "tai",
    GPS = "gps",
    UNIX = "unix",
    JULIAN = "julian",
}

// ============================================================================
// Component Interfaces
// ============================================================================

export interface BaseComponent {
    type: ComponentType;
}

export interface PositionComponent extends BaseComponent {
    type: ComponentType.POSITION;
    x: number;
    y: number;
    z: number;
    frame: ReferenceFrame;
}

export interface VelocityComponent extends BaseComponent {
    type: ComponentType.VELOCITY;
    vx: number;
    vy: number;
    vz: number;
    frame: ReferenceFrame;
}

export interface KeplerianElements {
    a: number; // Semi-major axis (km)
    e: number; // Eccentricity
    i: number; // Inclination (rad)
    omega: number; // Argument of periapsis (rad)
    Omega: number; // Right ascension of ascending node (rad)
    M: number; // Mean anomaly (rad)
}

export interface TLE {
    line1: string;
    line2: string;
    name?: string;
}

export interface CartesianElements {
    position: [number, number, number];
    velocity: [number, number, number];
}

export type OrbitalData = KeplerianElements | TLE | CartesianElements;

export interface OrbitalElementsComponent extends BaseComponent {
    type: ComponentType.ORBITAL_ELEMENTS;
    format: OrbitalFormat;
    data: OrbitalData;
    epoch: number;
}

export interface IPropagator {
    // ZERO-COPY: Direct array write (optional, for performance)
    propagateDirect?(elements: OrbitalData, time: number, positionArray: Float32Array, index: number): boolean;

    // Legacy: Returns propagation result
    propagate(elements: OrbitalData, time: number): PropagationResult;
}

export interface PropagationResult {
    position: { x: number; y: number; z: number };
    velocity: { vx: number; vy: number; vz: number };
    frame: ReferenceFrame;
}

export interface PropagatorComponent extends BaseComponent {
    type: ComponentType.PROPAGATOR;
    propagator: IPropagator; // Propagator knows its own algorithm
}

export interface BillboardComponent extends BaseComponent {
    type: ComponentType.BILLBOARD;
    texture?: string;
    size: number;
    color: number;
    sizeAttenuation: boolean;
}

export interface MeshComponent extends BaseComponent {
    type: ComponentType.MESH;
    geometry: string; // Reference to geometry cache
    material: string; // Reference to material cache
    scale: [number, number, number];
}

export interface LabelStyle {
    fontSize: number;
    color: string;
    fontFamily?: string;
    backgroundColor?: string;
    padding?: number;
}

export interface LabelComponent extends BaseComponent {
    type: ComponentType.LABEL;
    text: string;
    offset: [number, number];
    style: LabelStyle;
}

export interface TimeVisibilityComponent extends BaseComponent {
    type: ComponentType.TIME_VISIBILITY;
    startTime: number;
    endTime: number;
}

export interface LODLevel {
    minDistance: number;
    maxDistance: number;
    components: ComponentType[];
}

export interface LODComponent extends BaseComponent {
    type: ComponentType.LOD;
    levels: LODLevel[];
    strategy: LODStrategy;
}

export interface TransformComponent extends BaseComponent {
    type: ComponentType.TRANSFORM;
    matrix: THREE.Matrix4;
}

export type Component =
    | PositionComponent
    | VelocityComponent
    | OrbitalElementsComponent
    | PropagatorComponent
    | BillboardComponent
    | MeshComponent
    | LabelComponent
    | TimeVisibilityComponent
    | LODComponent
    | TransformComponent;

// ============================================================================
// System Interface
// ============================================================================

export interface System {
    name: string;
    priority: number;
    requiredComponents: ComponentType[];
    optionalComponents?: ComponentType[];

    init(engine: IEngine): void;
    update(deltaTime: number, entities: EntityId[]): void;
    cleanup(): void;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface TimeConverter {
    convert(time: number, from: TimeSystem, to: TimeSystem): number;
}

export interface ITimeService extends Service {
    getCurrentTime(): number;
    setTime(time: number): void;
    setRate(rate: number): void;
    getRate(): number;
    addTimeSystem(name: TimeSystem, converter: TimeConverter): void;
    convert(time: number, from: TimeSystem, to: TimeSystem): number;
    play(): void;
    pause(): void;
    isPaused(): boolean;
    onTick(callback: (time: number) => void): () => void;
    update(deltaTime: number): void;
}

export interface IRenderingService extends Service {
    getRenderer(): THREE.WebGLRenderer;
    getScene(): THREE.Scene;
    getCamera(): THREE.Camera;
    addObject(object: THREE.Object3D): void;
    removeObject(object: THREE.Object3D): void;
    setTileProvider(provider: any): void;
    registerShader(name: string, shader: THREE.ShaderMaterial): void;
    registerGeometry(name: string, geometry: THREE.BufferGeometry): void;
    registerMaterial(name: string, material: THREE.Material): void;
    getGeometry(name: string): THREE.BufferGeometry | undefined;
    getMaterial(name: string): THREE.Material | undefined;
    render(): void;
    resize(width: number, height: number): void;
}

export interface IQueryService extends Service {
    // Type-based queries
    findByComponents(...componentTypes: ComponentType[]): EntityId[];
    findByEntityType(type: string): EntityId[];

    // Property-based queries
    findByProperty<T>(componentType: ComponentType, property: string, value: T): EntityId[];
    findByPredicate(predicate: (entity: EntityId) => boolean): EntityId[];

    // Time-based queries
    findVisibleAt(time: number): EntityId[];
    findInTimeRange(start: number, end: number): EntityId[];

    // Spatial queries
    findInRadius(center: THREE.Vector3, radius: number, frame?: ReferenceFrame): EntityId[];
    findInFrustum(frustum: THREE.Frustum): EntityId[];

    // Index management
    createIndex(name: string, indexFn: (entity: EntityId) => string): void;
    queryIndex(indexName: string, key: string): EntityId[];

    // Initialization
    setComponentRegistry(registry: IComponentRegistry): void;
}

export interface Service {
    update?(deltaTime: number): void;
    cleanup?(): void;
}

// ============================================================================
// Engine Interfaces
// ============================================================================

export interface IEntityManager {
    create(): EntityId;
    destroy(entity: EntityId): void;
    exists(entity: EntityId): boolean;
    getAll(): EntityId[];
    getCount(): number;
}

export interface IComponentRegistry {
    addComponent<T extends Component>(entity: EntityId, component: T): void;
    removeComponent(entity: EntityId, componentType: ComponentType): void;
    getComponent<T extends Component>(entity: EntityId, type: ComponentType): T | undefined;
    hasComponent(entity: EntityId, componentType: ComponentType): boolean;
    getAllComponents(entity: EntityId): Component[];
    removeAllComponents(entity: EntityId): void;
    markDirty(entity: EntityId): void;
    clearDirty(): void;
    getDirtyEntities(): Set<EntityId>;
    getEntitiesWithComponent(componentType: ComponentType): EntityId[];
}

export interface ISystemManager {
    add(system: System): void;
    remove(systemName: string): void;
    get(systemName: string): System | undefined;
    getOrderedSystems(): System[];
    updateSystems(deltaTime: number, componentRegistry: IComponentRegistry): void;
}

export interface IEngine {
    // Entity management
    createEntity(): EntityId;
    destroyEntity(entity: EntityId): void;

    // Component management
    addComponent(entity: EntityId, component: Component): void;
    removeComponent(entity: EntityId, componentType: ComponentType): void;
    getComponent<T extends Component>(entity: EntityId, type: ComponentType): T | undefined;
    hasComponent(entity: EntityId, componentType: ComponentType): boolean;

    // System management
    addSystem(system: System): void;
    removeSystem(systemName: string): void;
    getSystem(systemName: string): System | undefined;

    // Main update loop
    update(deltaTime: number): void;

    // Animation loop control
    start(): void;
    stop(): void;
    pause(): void;
    resume(): void;
    isPaused(): boolean;

    // Service access
    getService<T extends Service>(name: string): T | undefined;

    // Component registry access
    getComponentRegistry(): IComponentRegistry;

    // Query service access
    getQueryService(): IQueryService;
}

export interface EngineConfig {
    services?: {
        time?: ITimeService;
        rendering?: IRenderingService;
        query?: IQueryService;
    };
    systems?: System[];
    maxEntities?: number;
}

// ============================================================================
// Frame Conversion Interface
// ============================================================================

export interface IFrameConverter {
    convert(position: { x: number; y: number; z: number }, from: ReferenceFrame, to: ReferenceFrame, time?: number): { x: number; y: number; z: number };
}
