import { v4 } from "uuid";
import { iter, Iterator } from "joshkaposh-iterator";
import { TODO } from "joshkaposh-iterator/src/util";
import { type Option, type Result, u32, is_none, ErrorExt } from 'joshkaposh-option';
import { ThinComponent, ThinResource, ComponentRecord, SpawnManyInput } from "define";
import { type ArchetypeComponentId, Archetypes } from "../archetype";
import { type Component, type ComponentId, type ComponentInfo, Components, type Resource, type ResourceId, ComponentTicks, Tick, relative_to, ThinComponents, ComponentMetadata, ThinComponentInfo } from "../component";
import { Storages, StorageType, ThinStorages } from "../storage";
import { type Entity, Entities, EntityDoesNotExistDetails, EntityLocation, index } from "../entity";
import { type Bundle, BundleInserter, Bundles, BundleSpawner, define_thin_bundle, InsertMode, ThinBundle, ThinBundles, ThinBundleSpawner } from "../bundle";
import { QueryState, ThinQueryState, RemapQueryTupleToQueryData, RemapQueryTupleToQueryFilter, Access, FilteredAccess } from "../query";
import { RemovedComponentEntity, RemovedComponentEvents } from "../removal-detection";
import type { Event, EventId, SendBatchIds } from "../event";
import { type BundleInput, EntityRef, EntityWorldMut } from './entity-ref'
import { RawCommandQueue } from "./command-queue";
import { type System, type SystemMeta, RunSystemError, defineParam } from "../system";
import { type Instance, type MutOrReadonlyArray, unit, debug_assert } from "../util";
import { CHECK_TICK_THRESHOLD, Mut, Ref, Ticks, TicksMut } from "../change_detection";
import { type ScheduleLabel, Schedule, Schedules } from "../schedule";
import { TryInsertBatchError, TryRunScheduleError } from "./error";
import { Commands } from '../system/commands';
import { ON_ADD, ON_INSERT, ON_REMOVE, ON_REPLACE } from "./deferred-world";
import type { FromWorld } from "./world.types";
import type { TypeId, Class } from "../util";

export type WorldId = number;

export class OnAdd {
    static readonly type_id = v4() as UUID;
    static readonly storage_type = 1;
}
export class OnInsert {
    static readonly type_id = v4() as UUID;
    static readonly storage_type = 1;
}
export class OnReplace {
    static readonly type_id = v4() as UUID;
    static readonly storage_type = 1;
}
export class OnRemove {
    static readonly type_id = v4() as UUID;
    static readonly storage_type = 1;
}

export const ThinOnAdd = {
    storage_type: 1,
    type_id: v4() as UUID
} as ThinComponent;

export const ThinOnInsert = {
    storage_type: 1,
    type_id: v4() as UUID
} as ThinComponent;

export const ThinOnReplace = {
    storage_type: 1,
    type_id: v4() as UUID
} as ThinComponent

export const ThinOnRemove = {
    storage_type: 1,
    type_id: v4() as UUID
} as ThinComponent


// type UnionToIntersection<U> = (
//     U extends any ? (arg: U) => any : never
// ) extends (arg: infer I) => void
//     ? I
//     : never;

// type UnionToTuple<T> = UnionToIntersection<(T extends any ? (t: T) => T : never)> extends (_: any) => infer W
//     ? [...UnionToTuple<Exclude<T, W>>, W]
//     : [];


// type TupleToNumber<T> = { [K in keyof T]: number }

// type ToTuple<T> = TupleToNumber<UnionToTuple<T[keyof T]>>

export class ThinWorld {
    #id: WorldId;
    #entities: Entities;
    #components: ThinComponents;
    #archetypes: Archetypes;
    #storages: ThinStorages;
    #bundles: ThinBundles;
    #removed_components: RemovedComponentEvents;

    #changeTick: Tick;
    #lastChangeTick: Tick;
    // @ts-expect-error
    #lastCheckTick: Tick;
    // @ts-expect-error
    #lastTriggerId: number;

    #command_queue: RawCommandQueue;

    constructor(
        id?: WorldId,
        entities?: Entities,
        components?: ThinComponents,
        archetypes?: Archetypes,
        storages?: ThinStorages,
        bundles?: ThinBundles,
        removed_components?: RemovedComponentEvents,
        change_tick?: number,
        last_change_tick?: Tick,
        last_check_tick?: Tick,
        last_trigger_id?: number,
        command_queue?: RawCommandQueue
    ) {
        this.#id = id ?? 0;
        this.#entities = entities ?? new Entities();
        this.#components = components ?? new ThinComponents();
        this.#archetypes = archetypes ?? new Archetypes(components as any);
        this.#storages = storages ?? new ThinStorages();
        this.#bundles = bundles ?? new ThinBundles();
        this.#removed_components = removed_components ?? new RemovedComponentEvents();
        this.#changeTick = change_tick ?? 0;
        this.#lastChangeTick = last_change_tick ?? 0;
        this.#lastCheckTick = last_check_tick ?? 0;
        this.#lastTriggerId = last_trigger_id ?? 0;
        this.#command_queue = command_queue ?? new RawCommandQueue();


        this.#bootstrap();
    }

    get id(): WorldId {
        return this.#id;
    }

    get entities(): Entities {
        return this.#entities
    }

    get archetypes(): Archetypes {
        return this.#archetypes;
    }

    get components(): ThinComponents {
        return this.#components;
    }

    get storages(): ThinStorages {
        return this.#storages;
    }

    get bundles(): ThinBundles {
        return this.#bundles;
    }

    get removedComponents(): RemovedComponentEvents {
        return this.#removed_components;
    }

    get changeTick() {
        return this.#changeTick;
    }

    get lastChangeTick(): Tick {
        return this.#lastChangeTick;
    }

    commands() {
        return Commands.new_raw_from_entities(this.#command_queue.clone(), this.#entities);
    }

    getRawCommandQueue(): RawCommandQueue {
        return this.#command_queue.clone();
    }

    /**
    * @description
    * Initializes a new component and returns the `ComponentId` created for it.
    * 
    * If the component already exists, nothing happens.
    * 
    * @returns ComponentId - A unique identifier for a `Component` T
   */
    registerComponent(type: ComponentMetadata): number {
        return this.#components.registerComponent(type);
    }

    registerResource(type: ThinResource): number {
        return this.#components.registerResource(type);
    }

    componentId(component: ComponentMetadata): Option<ComponentId> {
        return this.#components.componentId(component as Component)
    }

    resourceId(resource: Resource): Option<ResourceId> {
        return this.#components.resourceId(resource);
    }

    getResourceById<R extends ThinResource>(component_id: ComponentId): Option<InstanceType<R>> {
        return this.#storages
            .resources
            .get(component_id)
            ?.getData() as Option<InstanceType<R>>
    }

    getResourceMutById<R extends ThinResource>(component_id: ComponentId): Option<Mut<R>> {
        const tuple = this.#storages.resources.get(component_id)?.getWithTicks();
        if (tuple) {
            const [ptr, _ticks] = tuple;
            const ticks = new TicksMut(_ticks, this.#lastChangeTick, this.#changeTick);
            return new Mut<R>(ptr as Instance<R>, ticks);
        }
        return;
    }

    getResourceWithTicks<R extends ThinResource>(component_id: ComponentId): Option<[InstanceType<R>, ComponentTicks]> {
        return this.#storages.resources.get(component_id)?.getWithTicks() as Option<[InstanceType<R>, ComponentTicks]>;
    }

    getResourceOrInsertWith<R extends ThinResource>(resource: R, func: () => InstanceType<R>): Mut<R> {
        const component_id = this.#components.registerResource(resource);
        const change_tick = this.#changeTick;
        const last_change_tick = this.#lastChangeTick;

        const data = this.__initializeResourceInternal<R>(component_id);
        if (!data.isPresent) {
            data.set(func(), change_tick)
        }

        return data.getMut(last_change_tick, change_tick)!;
    }

    insertResourceById(component_id: ComponentId, value: {}) {
        this.__initializeResourceInternal(component_id).set(value, this.#changeTick);
    }

    getResourceOrInit<C extends Class<ThinComponent>, R extends ThinResource<C>>(resource: R & FromWorld<R>): Mut<R> {
        const change_tick = this.#changeTick;
        const last_change_tick = this.#lastChangeTick;

        const component_id = this.registerResource(resource);
        if (!this.#storages.resources.get(component_id)?.isPresent) {
            const value = resource.from_world(this as unknown as World) as InstanceType<R>;
            this.insertResourceById(component_id, value)
        }

        const data = this.#storages.resources.get<R>(component_id)!;
        return data.getMut(last_change_tick, change_tick)!;
    }

    component_info(component: ComponentMetadata): Option<ThinComponentInfo> {
        const id = this.componentId(component);
        return typeof id === 'number' ? this.#components.getInfo(id) : null;
    }

    inspectEntity(entity: Entity): ThinComponentInfo[] {
        const location = this.#entities.get(entity);
        if (!location) {
            throw new Error(`Entity ${entity} does not exist`)
        }

        const archetype = this.#archetypes.get(location.archetype_id);
        if (!archetype) {
            throw new Error(`Archetype ${location.archetype_id} does not exist`)
        }

        return archetype.components().filter_map(id => this.#components.getInfo(id)).collect();
    }

    spawn(...bundle: ThinBundle[]) {
        bundle = define_thin_bundle(bundle) as unknown as ThinBundle[];

        this.flush();
        const entity = this.#entities.alloc();
        const bundle_spawner = ThinBundleSpawner.new(this, bundle as unknown as ThinBundle, this.#changeTick)
        const entity_location = bundle_spawner.spawnNonExistent(entity, bundle as unknown as ThinBundle);

        return new EntityWorldMut(this as unknown as World, entity_location, entity);
    }

    spawnMany<B extends SpawnManyInput<ComponentRecord[]>>(_batch: B) {
        // return new ThinSpawnManyIter(this, batch as any);
    }

    despawn(_entity: Entity): boolean {
        // const e = this.getEntityMut(entity);
        // if (e) {
        //     e.despawn();
        //     return true;
        // }
        return false;
    }

    /**
     * @summary
     * Retrieves a reference to the given entity's ['Component'] of the given type.
     * Returns None if the entity does not have a ['Component'] of the given type.
     
    @example
    import { registerComponent, World } from 'ecs'

    class Position {
    
        constructor(public x: number, public y: number) {}
    }

    const world = new World();
    const entity = world.spawn(new Position(0, 0)).id();
    const position = world.get(entity, Position);
    console.log(position.x, position.y) // 0 0
    */
    get<T extends ThinComponent>(entity: Entity, component: T): Option<T> {
        return this.getEntity(entity)?.get(component as unknown as Component) as T;
    }

    get_mut<T extends ThinComponent>(entity: Entity, component: T) {
        return this.getEntityMut(entity)?.getMut(component as unknown as Component)
    }

    get_by_id<T extends ThinComponent>(entity: Entity, component_id: ComponentId): Option<T> {
        return this.getEntity(entity)?.getById(component_id) as T;
    }

    get_mut_by_id<T extends ThinComponent>(entity: Entity, component_id: ComponentId): Option<Mut<T>> {
        return this.getEntityMut(entity)?.getMutById(component_id) as unknown as Mut<T>;
    }


    /**
     * @description
     * Retrives an [`EntityRef`] that exposes read-only operations for the given `entity`.
     * This will **throw** if the `entity` does not exist. Use [`World.getEntity`] if you want
     * to check for entity existence instead of implicitly throwing.
     */
    entity(entity: Entity): EntityRef {
        const ref = this.getEntity(entity);

        if (!ref) {
            throw new Error(`Entity ${entity} does not exist`)
        }

        return ref;

    }

    /**
 * @description
 * Retrives an [`EntityWorldMut`] that exposes read and write operations for the given `entity`.
 * This will **throw** if the `entity` does not exist. Use [`World.getEntityMut`] if you want
 * to check for entity existence instead of implicitly throwing.
 */
    entity_mut(entity: Entity): EntityWorldMut {
        const ref = this.getEntityMut(entity);
        if (!ref) {
            throw new Error(`Entity ${entity} does not exist`)
        }
        return ref;
    }

    getEntity(entity: Entity): Option<EntityRef> {
        const location = this.#entities.get(entity);
        if (!location) {
            return
        }
        // ! Safety: if the Entity is invalid, the function returns early.
        // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
        return new EntityRef(this as unknown as World, location, entity)

    }

    getEntityMut(entity: Entity): Option<EntityWorldMut> {
        const location = this.#entities.get(entity);
        if (!location) {
            return null
        }
        // ! Safety: if the Entity is invalid, the function returns early.
        // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
        return new EntityWorldMut(this as unknown as World, location, entity);
    }

    query<const D extends any[], const F extends any[] = []>(data: D, filter: F = [] as unknown as F) {
        return ThinQueryState.new(this, data, filter);
    }

    /**
     * Inserts a new resource with the given `Resource`.
     * 
     * Resources are unique data of a given type.
     * If you insert a resource of a type that already exists,
     * you will overwrite any existing data.
     */
    insertResource(value: ThinResource): void {
        const component_id = this.#components.registerResource(value);
        this.insertResourceById(component_id, value);
    }

    removeResource<R extends ThinResource>(resource: R): Option<InstanceType<R>> {
        const component_id = this.#components.getResourceId(resource);
        if (typeof component_id !== 'number') {
            return null
        }

        const res = this.#storages.resources.get(component_id)?.delete();
        return res ? res[0] as InstanceType<R> : undefined;
    }

    containsResource(resource: ThinResource): boolean {
        const id = this.#components.getResourceId(resource);
        if (is_none(id)) {
            return false
        }
        return this.#storages.resources.get(id)?.isPresent ?? false;
    }

    /**
     * @description
    Initializes a new resource and returns the [`ComponentId`] created for it.
        
    If the resource already exists, nothing happens.
        
    The value given by the [`FromWorld::from_world`] method will be used.
    Note that any resource with the [`Default`] trait automatically implements [`FromWorld`],
    and those default values will be here instead.
     */
    initResource(resource: ThinResource): ComponentId {
        const component_id = this.#components.registerResource(resource);
        const r = this.#storages.resources.get(component_id)
        if (!r || !r.isPresent) {
            const ptr = new resource();
            // const v = resource.from_world(this);
            this.insertResourceById(component_id, ptr);
        }
        return component_id;
    }

    resource<R extends ThinResource>(resource: R): Instance<R> {
        const res = this.getResource(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resources are also implicitly added via `app.add_event and can be added by plugins.`")
        }
        return res;
    }

    resourceMut<R extends ThinResource>(resource: R): Mut<R> {
        const res = this.getResourceMut(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resources are also implicitly added via `app.add_event and can be added by plugins.`")
        }
        return res;
    }

    getResource<R extends ThinResource>(resource: R): Option<InstanceType<R>> {
        const id = this.#components.getResourceId(resource);
        if (typeof id !== 'number') {
            return
        }

        return this.getResourceById(id);
    }

    getResourceRef<R extends ThinResource>(resource: R): Option<Ref<R>> {
        const component_id = this.#components.getResourceId(resource);
        if (typeof component_id !== 'number') {
            return;
        }

        const tuple = this.getResourceWithTicks(component_id);
        if (!tuple) {
            return
        }
        const [ptr, cells] = tuple;
        const ticks = new Ticks(cells, this.#lastChangeTick, this.#changeTick);
        return new Ref<R>(ptr as InstanceType<R>, ticks)
    }

    getResourceMut<R extends ThinResource>(resource: R): Option<Mut<R>> {
        const id = this.#components.getResourceId(resource);
        if (typeof id !== 'number') {
            return
        }

        return this.getResourceMutById<R>(id);
    }

    // /**
    //  * @summary
    //  * Retrieves a reference to the given entity's ['Component'] of the given type.
    //  * Returns None if the entity does not have a ['Component'] of the given type.

    // @example
    // import { registerComponent, World } from 'ecs'

    // class Position {

    //     constructor(public x: number, public y: number) {}
    // }

    // const world = new World();
    // const entity = world.spawn(new Position(0, 0)).id();
    // const position = world.get(entity, Position);
    // console.log(position.x, position.y) // 0 0
    // */
    // get<T extends ComponentRecord>(entity: Entity, component: T): Option<ThinComponentTuple<T>> {
    //     return this.getEntity(entity)?.get(component);
    // }

    // get_mut<T extends Component>(entity: Entity, component: T) {
    //     return this.getEntityMut(entity)?.getMut(component)
    // }

    // getEntity(entity: Entity): Option<EntityRef> {
    //     const location = this.#entities.get(entity);
    //     if (!location) {
    //         return
    //     }
    //     // ! Safety: if the Entity is invalid, the function returns early.
    //     // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
    //     return new EntityRef(new UnsafeEntityCell(this, entity, location))

    // }

    // getEntityMut(entity: Entity): Option<EntityWorldMut> {
    //     const location = this.#entities.get(entity);
    //     if (!location) {
    //         return null
    //     }
    //     // ! Safety: if the Entity is invalid, the function returns early.
    //     // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
    //     // UnsafeEntityCell // { self.as_unsafe_world_cell_readonly, entity, location }
    //     return new EntityWorldMut(this, entity, location);
    // }

    checkChangeTicks() {
        const change_tick = this.#changeTick;
        if (relative_to(change_tick, this.#lastChangeTick) < CHECK_TICK_THRESHOLD) {
            return;
        }

        const { tables,
            sparse_sets,
            resources
        } = this.#storages;

        tables.checkChangeTicks(change_tick);
        sparse_sets.checkChangeTicks(change_tick);
        resources.checkChangeTicks(change_tick);

        this.getResourceMut(Schedules as any)?.v.checkChangeTicks(change_tick);
        this.#lastChangeTick = change_tick;
    }

    incrementChangeTick(): Tick {
        const change_tick = this.#changeTick;
        const prev_tick = change_tick;
        this.#changeTick = u32.wrapping_add(change_tick, 1);

        return prev_tick;
    }

    readChangeTick(): Tick {
        return this.#changeTick;
    }

    flush() {
        this.flushEntities();
        this.flushCommands();
    }

    flushEntities() {
        const empty_archetype = this.#archetypes.empty;
        const table = this.#storages.tables.get(empty_archetype.tableId)!;
        this.#entities.flush((entity, location) => {
            const new_loc = empty_archetype.allocate(entity, table.allocate(entity));
            location.archetype_id = new_loc.archetype_id;
            location.archetype_row = new_loc.archetype_row;
            location.table_id = new_loc.table_id;
            location.table_row = new_loc.table_row;
        })
    }

    flushCommands() {
        if (!this.#command_queue.is_empty()) {
            this.#command_queue.clone().apply_or_drop_queued(this as unknown as World)
        }
    }

    /**
 * @description
 * Runs both [`clearEntities`] and [`clearResources`],
 * invalidating all [`Entity`] and resource fetches such as [`Res`]
 */
    clearAll() {
        this.clearEntities();
        this.clearResources();
    }

    clearTrackers() {
        this.#removed_components.update();
        this.#lastChangeTick = this.incrementChangeTick();
    }

    /**
     * @description Despawns all entities in this [`World`].
     */
    clearEntities() {
        this.#storages.tables.clear();
        this.#storages.sparse_sets.clearEntities();
        this.#archetypes.clearEntities();
        this.#entities.clear();
    }

    /**
     * @description
     * Clears all resouces in this [`World`].
     * 
     * **Note::* Any resource fetch to this [`World`] will fail unless they are re-initialized,
     * including engine-internal resources that are only initialized on app/world construction.
     * 
     * This can easily cause systems expecting certain resourcs to immediately start panicking.
     * Use with caution.
     */
    clearResources() {
        this.#storages.resources.clear()
    }

    __getResourceArchetypeComponentId(component_id: ComponentId): Option<ArchetypeComponentId> {
        return this.#storages.resources.get(component_id)?.id;
    }

    __initializeResourceInternal<R extends Resource>(component_id: ComponentId) {
        const archetypes = this.#archetypes;
        return this.#storages.resources.__initializeWith<R>(component_id, this.#components as unknown as Components, () => archetypes.newArchetypeComponentId())
    }

    #bootstrap() {
        const ErrorMessage = 'No components can be added before ComponentHooks';
        debug_assert(ON_ADD === this.registerComponent(ThinOnAdd), ErrorMessage)
        debug_assert(ON_INSERT === this.registerComponent(ThinOnInsert), ErrorMessage)
        debug_assert(ON_REPLACE === this.registerComponent(ThinOnReplace), ErrorMessage)
        debug_assert(ON_REMOVE === this.registerComponent(ThinOnRemove), ErrorMessage)
    }
}

function schedule_run<T extends Schedule>(world: World, schedule: T) {
    schedule.run(world);
    return schedule;
}

class World {
    #id: WorldId;
    #entities: Entities;
    #components: Components;
    #archetypes: Archetypes;
    #storages: Storages;
    #bundles: Bundles;
    #removed_components: RemovedComponentEvents;
    #change_tick: number;
    #last_change_tick: Tick;
    // @ts-ignore
    #last_check_tick: Tick;
    #last_trigger_id: number;
    #command_queue: RawCommandQueue;

    constructor(
        id: number = 0,
        entities: Entities = new Entities(),
        components: Components = new Components(),
        archetypes: Archetypes = new Archetypes(components),
        storages: Storages = new Storages(),
        bundles: Bundles = new Bundles(),
        removed_components: RemovedComponentEvents = new RemovedComponentEvents(),
        change_tick: number = 0,
        last_change_tick: Tick = 0,
        last_check_tick: Tick = 0,
        last_trigger_id: number = 0,
        command_queue: RawCommandQueue = new RawCommandQueue()
    ) {
        this.#id = id;
        this.#entities = entities;
        this.#components = components;
        this.#archetypes = archetypes;
        this.#storages = storages;
        this.#bundles = bundles;
        this.#removed_components = removed_components;
        this.#change_tick = change_tick;
        this.#last_change_tick = last_change_tick;
        this.#last_check_tick = last_check_tick;
        this.#last_trigger_id = last_trigger_id;
        this.#command_queue = command_queue;


        this.#bootstrap();

    }

    static init_state(_world: World, system_meta: SystemMeta) {
        const access = new Access();
        access.read_all();

        if (!system_meta.__archetype_component_access.is_compatible(access)) {
            throw new Error('World conflicts with a previous mutable system parameter.')
        }

        system_meta.__archetype_component_access.extend(access);

        const filtered_access = new FilteredAccess();
        filtered_access.read_all();

        if (!system_meta.__component_access_set.get_conflicts_single(filtered_access).is_empty()) {
            throw new Error('World conflicts with a previous mutable system parameter.')
        }

        system_meta.__component_access_set.add(filtered_access);
    }

    static get_param(_state: any, _system: SystemMeta, world: World, _change_tick: Tick) {
        return world;
    }

    get id() {
        return this.#id;
    }

    get entities(): Entities {
        return this.#entities
    }

    get archetypes(): Archetypes {
        return this.#archetypes;
    }

    get components(): Components {
        return this.#components;
    }

    get storages(): Storages {
        return this.#storages;
    }

    get bundles(): Bundles {
        return this.#bundles;
    }

    get removedComponents(): RemovedComponentEvents {
        return this.#removed_components;
    }

    get commands() {
        return Commands.new_raw_from_entities(this.#command_queue.clone(), this.#entities);
    }

    getRawCommandQueue(): RawCommandQueue {
        return this.#command_queue.clone();
    }

    registerComponent(type: Component): number {
        return this.#components.registerComponent(type);
    }

    registerResource(type: Resource): number {
        return this.#components.registerResource(type);
    }

    // I: SystemInput, system: IntoSystem<I, O, M>
    // @ts-expect-error
    registerSystem<I extends any, O, M>(system: any) {

    }
    // @ts-ignore
    registerRequiredComponents<T extends Component, R extends Component<new () => any>>(component: T, required: R) {
        // this.try_register_required_components(component, required);
    }
    // @ts-ignore
    registerRequiredComponentsWith<T extends Component>(component: T, constructor: new () => any) {
        // this.try_registry_required_components_with(component, constructor);
    }

    // @ts-ignore
    tryRegisterRequiredComponents(component: Component, required: Component<new () => any>) {
        // this.try_register_required_components_with(component, required.constructor);
    }
    // @ts-ignore
    tryRegisterRequiredComponentsWith<T extends Component, R extends Component>(component: T, required: R, constructor: () => InstanceType<R>) {
        // const requiree = this.registerComponent(component);

        // if (this.archetypes().component_index().has(requiree)) {
        //     return RequiredComponentError.ArchetypeExists(requiree)
        // }

        // const req = this.registerComponent(required);
        // return this.#components.register_required_components(requiree, req, constructor);
    }

    //     /**
    //     * @description
    //     * Initializes a new component and returns the `ComponentId` created for it.
    //     * 
    //     * If the component already exists, nothing happens.
    //     * 
    //     * @returns ComponentId - A unique identifier for a `Component` T
    //    */
    //     initComponent(component: Component): ComponentId {
    //         return this.#components.registerComponent(component);
    //     }


    getComponentId(component: Component) {
        return this.#components.getComponentId(component);
    }


    componentId(component: Component) {
        return this.#components.componentId(component)
    }

    getResourceId(resource: Resource) {
        return this.#components.getResourceId(resource);
    }

    resourceId(resource: Resource) {
        return this.#components.resourceId(resource);
    }

    /**
     * @description
     * Retrives an [`EntityRef`] that exposes read-only operations for the given `entity`.
     * This will **throw** if the `entity` does not exist. Use [`World.getEntity`] if you want
     * to check for entity existence instead of implicitly throwing.
     */
    entity(entity: Entity) {
        const ref = this.getEntity(entity);

        if (!ref) {
            throw new Error(`Entity ${entity} does not exist`)
        }

        return ref;

    }

    /**
 * @description
 * Retrives an [`EntityWorldMut`] that exposes read and write operations for the given `entity`.
 * This will **throw** if the `entity` does not exist. Use [`World.getEntityMut`] if you want
 * to check for entity existence instead of implicitly throwing.
 */
    entityMut(entity: Entity) {
        const ref = this.getEntityMut(entity);
        if (!ref) {
            throw new Error(`Entity ${entity} does not exist`)
        }
        return ref;
    }

    componentInfo(component: Component) {
        const id = this.#components.getIdTypeId(component.type_id);
        return typeof id === 'number' ? this.#components.getInfo(id) : null;
    }

    inspectEntity(entity: Entity): ComponentInfo[] {
        const location = this.#entities.get(entity);
        if (!location) {
            throw new Error(`Entity ${entity} does not exist`)
        }

        const archetype = this.#archetypes.get(location.archetype_id);
        if (!archetype) {
            throw new Error(`Archetype ${location.archetype_id} does not exist`)
        }

        return archetype.components().filter_map(id => this.#components.getInfo(id)).collect();
    }

    getEntity(entity: Entity): Option<EntityRef> {
        const location = this.#entities.get(entity);
        if (!location) {
            return
        }
        // ! Safety: if the Entity is invalid, the function returns early.
        // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
        return new EntityRef(this, location, entity)

    }

    getEntityMut(entity: Entity): Option<EntityWorldMut> {
        const location = this.#entities.get(entity);
        if (!location) {
            return null
        }
        return new EntityWorldMut(this, location, entity);
    }

    /**
     * Spawns a new entity and returns a [`EntityWorldMut`] reference.
     * If you intend spawn an Entity with components you should use `World.spawn` as this reduces `Archetype` insertion(s)/removal(s).
     * This method is useful when allocating an Entity that will later have it's components inserted.
     * @returns a [`EntityWorldMut`] reference.
     */
    spawnEmpty() {
        this.flush();
        const entity = this.#entities.alloc();
        return this.#spawnAtEmptyInternal(entity);
    }

    /**
     * Spawns a new Entity with the provided [`Component`]s.
     * Spawns should be as infrequent and as batched as possible. `World.spawnBatch` is optimized for spawning many entities at once
     * and should be used instead of calling `spawn` in a loop.
     * @returns a [`EntityWorldMut`] reference.
     */
    spawn(...bundle: InstanceType<Component>[] | Bundle[]): EntityWorldMut {
        this.flush();
        const change_tick = this.#change_tick;
        const entity = this.#entities.alloc();
        bundle = Bundles.dynamicBundle(bundle) as unknown as Bundle[]
        const bundle_spawner = BundleSpawner.new(bundle as unknown as Bundle, this, change_tick)
        let entity_location = bundle_spawner.spawnNonExistent(entity, bundle as unknown as Bundle);
        if (!this.#command_queue.is_empty()) {
            this.flush();
            entity_location = this.#entities.get(entity) ?? EntityLocation.INVALID;
        }

        return new EntityWorldMut(this, entity_location, entity);
    }

    spawnBatch(batch: BundleInput): Entity[] {
        this.flush();
        const change_tick = this.#change_tick;

        const length = batch.length;
        this.entities.reserve(length);

        const bundle = Bundles.dynamicBundle(batch[0] as Component[]);

        const spawner = BundleSpawner.new(bundle, this, change_tick);
        spawner.reserveStorage(length);


        let index = -1;
        bundle.getComponents = function (func: (storage_type: StorageType, ptr: object) => void) {
            index++;
            const components = batch[index];
            for (let i = 0; i < components.length; i++) {
                const type = components[i];
                func(type.storage_type ?? type.constructor.storage_type, type)
            }
        }

        const ret = new Array(batch.length);
        for (let i = 0; i < batch.length; i++) {
            ret[i] = spawner.spawn(bundle);
        }
        return ret;
    }

    tryInsertBatchIfNew<B extends any[] | Bundle>(...batch: MutOrReadonlyArray<[Entity, B]>) {
        return this.tryInsertBatch(InsertMode.Keep, ...batch)
    }

    /**
     * For a given batch of [Entity, Bundle] pairs,
     * adds the Bundle of components to each Entity.
     * This is faster than doing equivalent operations one-by-one.
     * 
     * A batch can be any type that implements [Symbol.iterator] containing [Entity, Bundle] tuples,
     * such as Array<[Entity, Bundle]>.
     * 
     * This will overwrite any previous values of components shared by the Bundle
     * See `World.tryInsertBatchIfNew()` to keep the old values instead.
     * 
     * Returns a TryInsertBatchError if any of the provided entities do not exist.
     * 
     * For the panicking version, see `World.insert_batch`.
     */
    tryInsertBatch<B extends any[] | Bundle>(insert_mode: InsertMode, ...batch: MutOrReadonlyArray<[Entity, B]>): Result<undefined, TryInsertBatchError> {
        const bundle_type = Bundles.dynamicBundle(batch[0]);

        this.flush();
        const change_tick = this.#change_tick;
        const bundle_id = this.#bundles.registerInfo(bundle_type, this.#components, this.#storages);
        const invalid_entities: Entity[] = [];
        const batch_iter = iter(batch);

        let cache: Record<string, any> = {};
        while (true) {
            const next_batch = batch_iter.next();
            if (!next_batch.done) {
                const [first_entity, first_bundle] = next_batch.value;
                const first_location = this.#entities.get(first_entity);
                if (first_location) {
                    cache.inserter = BundleInserter.newWithId(
                        this,
                        first_location.archetype_id,
                        bundle_id,
                        change_tick
                    );
                    cache.archetype_id = first_location.archetype_id;
                    cache.inserter.insert(
                        first_entity,
                        first_location,
                        first_bundle,
                        insert_mode,
                    );
                    break;
                }
                invalid_entities.push(first_entity);
            } else {
                break;
            }
        }

        for (const [entity, bundle] of batch_iter) {
            const location = cache.inserter.entities().get(entity);
            if (location) {
                if (location.archetype_id !== cache.archetype_id) {
                    cache.inserter = BundleInserter.newWithId(
                        this,
                        location.archetype_id,
                        bundle_id,
                        change_tick
                    );
                    cache.archetype_id = location.archetype_id
                }

                cache.inserter.insert(entity, location, bundle, insert_mode);
            } else {
                invalid_entities.push(entity);
            }
        }

        if (invalid_entities.length === 0) {
            return;
        } else {
            return new TryInsertBatchError(bundle_type.name, invalid_entities);
        }
    }

    insertBatch<B extends MutOrReadonlyArray<any> | Bundle>(batch: MutOrReadonlyArray<[Entity, B]>[], insert_mode: InsertMode = InsertMode.Replace) {
        this.flush();
        const bundle_type = Bundles.dynamicBundle(batch[0][1])
        const change_tick = this.#change_tick;
        const bundle_id = this.#bundles.registerInfo(bundle_type, this.#components, this.#storages);

        const batch_iter = iter(batch);
        const next_batch = batch_iter.next();

        if (!next_batch.done) {
            const [first_entity] = next_batch.value;
            const first_location = this.#entities.get(first_entity);
            if (first_location) {
                let cache = {
                    inserter: BundleInserter.newWithId(
                        this,
                        first_location.archetype_id,
                        bundle_id,
                        change_tick
                    ),
                    archetype_id: first_location.archetype_id
                }

                cache.inserter.insert(
                    first_entity,
                    first_location,
                    bundle_type,
                    insert_mode
                )

                for (const [entity, bundle] of batch_iter) {
                    const location = cache.inserter.entities().get(entity);
                    if (location) {
                        if (location.archetype_id !== cache.archetype_id) {
                            cache.inserter = BundleInserter.newWithId(this, location.archetype_id, bundle_id, change_tick);
                            cache.archetype_id = location.archetype_id;
                        }

                        cache.inserter.insert(
                            entity,
                            location,
                            Bundles.dynamicBundle(bundle),
                            insert_mode
                        )
                    } else {
                        throw new Error(`Could not insert a bundle (of type ${bundle.name}) for entity ${entity}, which ${EntityDoesNotExistDetails}`)
                    }
                }

            } else {
                throw new Error(`Could not insert a bundle (of type ${bundle_type.name}) for entity ${first_entity}, which ${EntityDoesNotExistDetails}`)
            }
        }
    }

    insertBatchIfNew<B extends (any[] | readonly any[]) | Bundle>(batch: ([Entity, B] | readonly [Entity, B])[]) {
        this.insertBatch(batch, InsertMode.Keep)
    }

    /**
     * removes `entity` and all of its components
     * @returns true if `entity` existed.
     */
    despawn(entity: Entity): boolean {
        const e = this.getEntityMut(entity);
        if (e) {
            e.despawn();
            return true;
        }
        return false;
    }

    /**
     * @summary
     * Retrieves a reference to the given entity's ['Component'] of the given type.
     * Returns None if the entity does not have a ['Component'] of the given type.
     
    @example
    const Position = defineComponent(class {
        constructor(public x: number, public y: number) {}
    })

    const world = new World();
    const entity = world.spawn(new Position(0, 0)).id();
    const position = world.get(entity, Position);
    console.log(position.x, position.y) // 0, 0
    */
    get<T extends Component>(entity: Entity, component: T): Option<InstanceType<T>> {
        return this.getEntity(entity)?.get(component);
    }

    getMut<T extends Component>(entity: Entity, component: T) {
        return this.getEntityMut(entity)?.getMut(component)
    }

    getById<T extends Component>(entity: Entity, component_id: ComponentId) {
        return this.getEntity(entity)?.getById<T>(component_id);
    }

    getMutById<T extends Component>(entity: Entity, component_id: ComponentId) {
        return this.getEntityMut(entity)?.getMutById<T>(component_id);
    }

    /**
     * @returns [`QueryState`] with no filter.
     * This method is usually called when constructing a [`System`].
     * @description
     * queries by default are immutable. While there are no safeguards when changing a component value,
     * change detection will **not** work. It is __highly__ recommended to use the `mut` modifier if you want to mutate any component(s).
     * Systems are scheduled in such a way that any mutable access is safe in a multi-threaded environment. Not using `mut` can lead to undefined behaviour.
     * 
     * 
     * @example
     * world.query([ComponentA])
     * // returns an Iterator of any Entity that has `ComponentA`.
     * world.query([mut(ComponentA)])
     * // returns an Iterator of any Entity that has `ComponentA`,
     * // Change detection will update when component values are accessed and/or written to.
     */
    query<const D extends readonly any[]>(data: D): QueryState<RemapQueryTupleToQueryData<D>> {
        return this.queryFiltered(data, []);
    }

    /**
 * @returns [`QueryState`] with a filter.
 * This method is usually called when constructing a [`System`].
 * @description
 * queries by default are immutable. While there are no safeguards when changing a component value,
 * change detection will **not** work. It is __highly__ recommended to use the `mut` modifier if you want to mutate any component(s).
 * Systems are scheduled in such a way that any mutable access is safe in a multi-threaded environment. Not using `mut` can lead to undefined behaviour.
 * 
 * 
 * @example
 * world.queryFiltered([ComponentA], [With(ComponentB)])
 * // returns an Iterator<[ComponentA]> for any Entity that has both `ComponentA` and `ComponentB`.
 * 
 * world.queryFiltered([ComponentA), [With(ComponentB), Without(ComponentC)])
 * // returns an Iterator<[ComponentA]> for any Entity that has both `ComponentA` and `ComponentB` but not `ComponentC`.
 */

    queryFiltered<const D extends readonly any[], const F extends readonly any[]>(data: D, filter: F): QueryState<RemapQueryTupleToQueryData<D>, RemapQueryTupleToQueryFilter<F>> {
        return QueryState.new(data, filter, this);
    }

    removed(type: Component): Iterator<RemovedComponentEntity> {
        const id = this.#components.getId(type);
        return id != null ? this.removedWithId(id) : iter([]) as unknown as Iterator<RemovedComponentEntity>;
    }

    removedWithId(component_id: ComponentId): Iterator<RemovedComponentEntity> {
        const removed = this.#removed_components.get(component_id);
        return removed ? removed.iter_current_update_events().flatten() : iter([]) as unknown as Iterator<RemovedComponentEntity>;
    }

    /**
     * Inserts a new resource with the given `Resource`.
     * 
     * Resources are unique data of a given type.
     * If you insert a resource of a type that already exists,
     * you will overwrite any existing data.
     */
    insertResource(resource: Resource): void {
        const component_id = this.#components.registerResource(resource);
        this.insertResourceById(component_id, resource.from_world(this));
    }

    removeResource<R extends Resource>(resource: R): Option<InstanceType<R>> {
        const component_id = this.#components.getResourceId(resource);
        if (typeof component_id !== 'number') {
            return null
        }

        const res = this.#storages.resources.get(component_id)?.delete();
        return res ? res[0] as InstanceType<R> : undefined;
    }

    hasResource(resource: Resource): boolean {
        const id = this.#components.getResourceId(resource);
        if (is_none(id)) {
            return false
        }
        return this.#storages.resources.get(id)?.isPresent ?? false;
    }

    /**
     * @description
    Initializes a new resource and returns the [`ComponentId`] created for it.
        
    If the resource already exists, nothing happens.
        
    The value given by the [`FromWorld::from_world`] method will be used.
    Note that any resource with the [`Default`] trait automatically implements [`FromWorld`],
    and those default values will be here instead.
     */
    initResource(resource: Resource): ComponentId {
        const component_id = this.#components.registerResource(resource);
        const r = this.#storages.resources.get(component_id)
        if (!r || !r.isPresent) {
            const ptr = resource.from_world(this);
            this.insertResourceById(component_id, ptr as TypeId);
        }
        return component_id;
    }

    resource<R extends Resource>(resource: R): Instance<R> {
        const res = this.getResource(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resources are also implicitly added via `app.add_event and can be added by plugins.`")
        }
        return res;
    }

    resourceMut<R extends Resource>(resource: R): Mut<R> {
        const res = this.getResourceMut(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resources are also implicitly added via `app.add_event and can be added by plugins.`")
        }
        return res;
    }

    getResource<R extends Resource>(resource: R): Option<InstanceType<R>> {
        const id = this.#components.getResourceId(resource);
        return id == null ? undefined : this.getResourceById(id)
    }

    getResourceRef<R extends Resource>(resource: R): Option<Ref<R>> {
        const component_id = this.#components.getResourceId(resource);

        if (component_id == null) {
            return;
        }

        const tuple = this.getResourceWithTicks(component_id);
        return !tuple ? undefined :
            new Ref<R>(tuple[0] as InstanceType<R>, new Ticks(tuple[1], this.#last_change_tick, this.#change_tick))
    }

    getResourceMut<R extends Resource>(resource: R): Option<Mut<R>> {
        const id = this.#components.getResourceId(resource);
        return id == null ? undefined :
            this.#storages.resources.get(id)!.getMut(this.#last_change_tick, this.#change_tick) as Mut<R>;
    }

    getResourceById<R extends Resource>(component_id: ComponentId): Option<InstanceType<R>> {
        return this.#storages
            .resources
            .get(component_id)
            ?.getData() as InstanceType<R>
    }

    getResourceMutById<R extends Resource>(component_id: ComponentId): Option<Mut<R>> {
        const tuple = this.#storages.resources.get(component_id)?.getWithTicks();
        return tuple ?
            new Mut<R>(tuple[0] as Instance<R>, new TicksMut(tuple[1], this.#last_change_tick, this.#change_tick)) :
            undefined
    }

    getResourceWithTicks<R extends Resource>(component_id: ComponentId): Option<[InstanceType<R>, ComponentTicks]> {
        return this.#storages.resources.get(component_id)?.getWithTicks() as Option<[InstanceType<R>, ComponentTicks]>;
    }

    getResourceOrInsertWith<R extends Resource>(resource: R, func: () => InstanceType<R>): Mut<R> {
        const component_id = this.#components.registerResource(resource);
        const change_tick = this.#change_tick;
        const last_change_tick = this.#last_change_tick;

        const data = this.__initializeResourceInternal<R>(component_id);
        if (!data.isPresent) {
            data.set(func(), change_tick);
        }

        return data.getMut(last_change_tick, change_tick)!;
    }

    /**
     * Inserts a type esa
     */
    insertResourceById<R extends Resource>(component_id: ComponentId, value: InstanceType<R>) {
        this.__initializeResourceInternal(component_id).set(value, this.#change_tick);
    }

    /**
     * @returns an instance of the given Resource type. This method inserts a new Resource of the given type if one was not already present.
     */
    getResourceOrInit<C extends Component, R extends Resource<C>>(resource: R & FromWorld<C>): Mut<R> {
        const change_tick = this.#change_tick;
        const last_change_tick = this.#last_change_tick;

        const component_id = this.registerResource(resource);
        if (!this.#storages.resources.get(component_id)?.isPresent) {
            const value = resource.from_world(this) as InstanceType<R>;
            this.insertResourceById(component_id, value as TypeId);
        }

        return this.#storages.resources.get<R>(component_id)!.getMut(last_change_tick, change_tick)!;
    }

    iterResources() {
        return this.#storages.resources.iter().filter_map(([id, data]) => {
            const ptr = data.getData();
            if (!ptr) {
                return
            }

            return [this.#components.getInfo(id)!, ptr] as const;
        })
    }

    iterResourcesMut() {
        return this.#storages.resources.iter().filter_map(([id, data]) => {
            const component_info = this.#components.getInfo(id);
            const tuple = data.getWithTicks();
            if (!tuple) {
                return
            }
            const [ptr, cells] = tuple;
            return [component_info, new Mut(ptr, new TicksMut(
                cells,
                this.#last_change_tick,
                this.readChangeTick()
            ))]
        })
    }

    /**
     * Removes the resource of a given type, if it exists.
     * Return type will be undefined if Resource does not exist, otherwise return type will be unit
     */
    removeResourceById(component_id: ComponentId): Option<unit> {
        return this.#storages.resources.getMut(component_id)?.deleteAndDrop() ?? unit;
    }

    sendEvent<E extends Event>(type: E, event: InstanceType<E>): Option<EventId> {
        return this.sendEventBatch(type, event).next().value
    }

    sendEventDefault<E extends Event<new () => any>>(type: E, event: E): Option<EventId> {
        return this.sendEvent(type, new event())
    }

    sendEventBatch<E extends Event>(_type: E, ...events: InstanceType<E>[]): SendBatchIds {
        // const events_resource = this.get_resource(type);
        // events_resource.send_event()
        // const res = this.getResource(type.ECS_EVENTS_TYPE) as Events<E>;
        // console.log('world.sendEventBatch', res);

        // res.send_batch(events);
        // res
        return TODO('World::send_event_batch()', events);
    }

    get changeTick(): Tick {
        return this.#change_tick;
    }

    get lastChangeTick(): Tick {
        return this.#last_change_tick;
    }

    checkChangeTicks() {
        const change_tick = this.changeTick;
        if (relative_to(change_tick, this.#last_change_tick) < CHECK_TICK_THRESHOLD) {
            return;
        }

        const { tables,
            sparse_sets,
            resources
        } = this.#storages;

        tables.checkChangeTicks(change_tick);
        sparse_sets.checkChangeTicks(change_tick);
        resources.checkChangeTicks(change_tick);

        this.getResourceMut(Schedules)?.v.checkChangeTicks(change_tick);
        this.#last_change_tick = change_tick;
    }

    incrementChangeTick(): Tick {
        const change_tick = this.#change_tick;
        const prev_tick = change_tick;
        this.#change_tick = u32.wrapping_add(change_tick, 1);

        return prev_tick;
    }

    readChangeTick(): Tick {
        return this.#change_tick;
    }

    /**
     * @description
     * Empties queued entities and adds them to the empty [`Archetype`](module/archetype::Archetype).
     * This should be called before doing operations that might operate on queued entities,
     * such as inserting a [`Component`]
     */
    flush() {
        this.__flushEntities();
        this.__flushCommands();
    }

    /**
     * @description
     * Runs both [`clearEntities`] and [`clearResources`],
     * invalidating all [`Entity`] and resource fetches such as [`Res`]
     */
    clearAll() {
        this.clearEntities();
        this.clearResources();
    }

    clearTrackers() {
        this.#removed_components.update();
        this.#last_change_tick = this.incrementChangeTick();
    }

    /**
     * @description Despawns all entities in this [`World`].
     */
    clearEntities() {
        this.#storages.tables.clear();
        this.#storages.sparse_sets.clearEntities();
        this.#archetypes.clearEntities();
        this.#entities.clear();
    }

    /**
     * @description
     * Clears all resouces in this [`World`].
     * 
     * **Note::* Any resource fetch to this [`World`] will fail unless they are re-initialized,
     * including engine-internal resources that are only initialized on app/world construction.
     * 
     * This can easily cause systems expecting certain resourcs to immediately start panicking.
     * Use with caution.
     */
    clearResources() {
        this.#storages.resources.clear()
    }

    tryResourceScope<R extends Resource, U extends Mut<InstanceType<R>>>(resource: R, scope: (world: World, resource: U) => U): Result<U, ErrorExt> {
        const value = this.resourceScope(resource, scope);
        return !value ? new ErrorExt(null, `Resource does not exist: ${resource.name}`) : value;
    }

    resourceScope<R extends Resource, U extends Mut<InstanceType<R>>>(resource: R, scope: (world: World, resource: U) => U): Option<U> {
        const last_change_tick = this.#last_change_tick;
        const change_tick = this.#change_tick;

        const component_id = this.#components.getResourceId(resource);
        if (typeof component_id !== 'number') {
            return;
        }

        const tuple = this
            .#storages
            .resources
            .getMut<R>(component_id)
            ?.delete();

        if (!tuple) {
            return;
        }

        const [ptr, ticks] = tuple;
        const value_mut = new Mut(ptr, new TicksMut(
            ticks,
            last_change_tick,
            change_tick
        )) as U

        const result = scope(this, value_mut);
        debug_assert(!this.hasResource(resource), `Resource ${resource.name} was inserted during a call to World.try_resource_scope()\n This is not allowed as the original resource is reinserted to the world after the closure is invoked.`)

        this.#storages.resources.getMut(component_id)?.setWithTicks(ptr, ticks);
        return result;
    }

    add_schedule(schedule: Schedule) {
        this.getResourceOrInit(Schedules).v.insert(schedule);
    }

    tryScheduleScope<R>(label: ScheduleLabel, scope: (world: World, schedule: Schedule) => R): Result<R, TryRunScheduleError> {
        const result = this.scheduleScope(label, scope);
        return !result ? new TryRunScheduleError(label) : result;
    }

    scheduleScope<R>(label: ScheduleLabel, scope: (world: World, schedule: Schedule) => R): Option<R> {
        const schedule = this.getResourceMut(Schedules)?.v.remove(label);

        if (!schedule) {
            return
        }

        const value = scope(this, schedule);

        const old = this.resourceMut(Schedules)?.v.insert(schedule);
        if (old) {
            console.warn(`Schedule ${label} was inserted during a call to World.try_schedule_scope`);
        }

        return value;
    }

    tryRunSchedule(label: ScheduleLabel) {
        return this.tryScheduleScope(label, schedule_run);
    }

    runSchedule(label: ScheduleLabel) {
        this.scheduleScope(label, schedule_run);
    }

    runSystemOnce<In, Out>(system: System<In, Out>): Result<Out, RunSystemError> {
        return this.runSystemOnceWith(system, unit)
    }

    runSystemOnceWith<In, Out>(system: System<In, Out>, input: any): Result<Out, RunSystemError> {
        system = system.intoSystem();
        system.initialize(this);

        return system.validateParam(this) == null ? system.run(input, this) : RunSystemError.InvalidParams(system.name)
    }

    __lastTriggerId() {
        return this.#last_trigger_id;
    }

    __flushEntities() {
        const empty_archetype = this.#archetypes.empty;
        const table = this.#storages.tables.get(empty_archetype.tableId)!;
        this.#entities.flush((entity, location) => {
            const new_loc = empty_archetype.allocate(entity, table.allocate(entity));
            location.archetype_id = new_loc.archetype_id;
            location.archetype_row = new_loc.archetype_row;
            location.table_id = new_loc.table_id;
            location.table_row = new_loc.table_row;
        })
    }

    __flushCommands() {
        if (!this.#command_queue.is_empty()) {
            this.#command_queue.clone().apply_or_drop_queued(this)
        }
    }

    __getResourceArchetypeComponentId(component_id: ComponentId): Option<ArchetypeComponentId> {
        return this.#storages.resources.get(component_id)?.id;
    }

    __initializeResourceInternal<R extends Resource>(component_id: ComponentId) {
        const archetypes = this.#archetypes;
        return this.#storages.resources.__initializeWith<R>(component_id, this.#components, () => archetypes.newArchetypeComponentId())
    }

    #bootstrap() {
        const error = 'ComponentHook `Component` types must be the first `Component`s added to a `World`';
        debug_assert(ON_ADD === this.registerComponent(OnAdd as Component), error)
        debug_assert(ON_INSERT === this.registerComponent(OnInsert as Component), error)
        debug_assert(ON_REPLACE === this.registerComponent(OnReplace as Component), error)
        debug_assert(ON_REMOVE === this.registerComponent(OnRemove as Component), error)
    }

    #spawnAtEmptyInternal(entity: Entity): EntityWorldMut {
        const archetype = this.#archetypes.empty;
        const table_row = this.#storages.tables.get(archetype.tableId)!.allocate(entity);
        const location = archetype.allocate(entity, table_row);
        // @ts-expect-error
        this.#entities.__set(index(entity), location);
        return new EntityWorldMut(this, location, entity);
    }
}

defineParam(World);

export { World }

export function fetchTable(world: World, location: EntityLocation) {
    return world.storages.tables.get(location.table_id);
}

export function fetchSparseSet(world: World, component_id: ComponentId) {
    return world.storages.sparse_sets.get(component_id);
}