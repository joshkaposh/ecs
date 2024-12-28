import { Iterator, done, from_fn, iter, once } from "joshkaposh-iterator";
import { assert, TODO } from "joshkaposh-iterator/src/util";
import { Err, Option, Result, is_error, is_none, is_some, ErrorExt } from 'joshkaposh-option';
import { Archetype, ArchetypeComponentId, ArchetypeGeneration, Archetypes } from "../archetype";
import { Component, ComponentId, ComponentInfo, Components, ComponentTicks, Resource, ResourceId, Tick, TypeId } from "../component";
import { Storages } from "../storage";
import { AllocAtWithoutReplacement, Entities, Entity, EntityLocation } from "../entity";
import { Bundle, BundleInserter, Bundles, BundleSpawner, DynamicBundle } from "../bundle";
import { Query, QueryData, QueryEntityError, QueryFilter, QueryState, WorldQuery } from "../query";
import { RemovedComponentEvents } from "../removal-detection";
import { Event, EventId, Events, SendBatchIds } from "../event";
import { EntityMut, EntityRef, EntityWorldMut } from './entity-ref'
import { SpawnBatchIter } from "./spawn-batch";
import { UnsafeEntityCell } from "./unsafe-world-cell";
import { CommandQueue } from "./command_queue";
import { define_component } from "../define";
import { IntoSystemTrait, RunSystemError, System, SystemInput } from "../system";
import { unit } from "../../util";
import { u32 } from "../../Intrinsics";
import { CHECK_TICK_THRESHOLD, TicksMut } from "../change_detection";
import { Schedule, ScheduleLabel, Schedules } from "../schedule";

export type WorldId = number;

type AllTuples<T> = T | T[] | T[][]

export type ON_ADD = typeof ON_ADD;
export const ON_ADD = 0;
export type ON_INSERT = typeof ON_INSERT;
export const ON_INSERT = 1;
export type ON_REPLACE = typeof ON_REPLACE;
export const ON_REPLACE = 2;
export type ON_REMOVE = typeof ON_REMOVE;
export const ON_REMOVE = 3;

type ObserverId = ON_ADD | ON_INSERT | ON_REPLACE | ON_REMOVE;

export class OnAdd { }
export class OnInsert { }
export class OnReplace { }
export class OnRemove { }
define_component(OnAdd);
define_component(OnInsert);
define_component(OnReplace);
define_component(OnRemove);

class TryRunScheduleError extends ErrorExt {

}

export class World {
    #id: WorldId;
    #entities: Entities;
    #components: Components;
    #archetypes: Archetypes;
    #storages: Storages;
    #bundles: Bundles;
    #removed_components: RemovedComponentEvents;
    #change_tick: number;
    #last_change_tick: Tick;
    #last_check_tick: Tick;
    #last_trigger_id: number;
    #command_queue: CommandQueue;
    private constructor(
        id: number,
        entities: Entities,
        components: Components,
        archetypes: Archetypes,
        storages: Storages,
        bundles: Bundles,
        removed_components: RemovedComponentEvents,
        change_tick: number,
        last_change_tick: Tick,
        last_check_tick: Tick,
        last_trigger_id: number,
        command_queue: CommandQueue
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
    }

    static new() {
        return this.default();
    }

    static default() {
        const world = new World(0,
            new Entities(),
            Components.default(),
            new Archetypes(),
            Storages.default(),
            new Bundles(),
            RemovedComponentEvents.default(),
            1,
            new Tick(0),
            new Tick(0),
            0,
            CommandQueue.default()
        )
        world.#bootstrap();
        return world;
    }

    id() {
        return this.#id;
    }

    entities(): Entities {
        return this.#entities
    }

    archetypes(): Archetypes {
        return this.#archetypes;
    }

    components(): Components {
        return this.#components;
    }

    storages(): Storages {
        return this.#storages;
    }

    bundles(): Bundles {
        return this.#bundles;
    }

    removed_components(): RemovedComponentEvents {
        return this.#removed_components;
    }

    commands() {
        // return Commands.new_raw_from_entities(this.#command_queue.clone(), this.#entities);
    }

    register_component(type: Component): number {
        return this.#components.register_component(type, this.#storages)
    }

    register_resource(type: Resource): number {
        return this.#components.register_resource(type);
    }

    // I: SystemInput, system: IntoSystem<I, O, M>
    register_system<I extends any, O, M>(system: any, input: I) {

    }

    /**
    * @description
    * Initializes a new component and returns the `ComponentId` created for it.
    * 
    * If the component already exists, nothing happens.
    * 
    * @returns ComponentId - A unique identifier for a `Component` T
   */
    init_component(component: Component): ComponentId {
        return this.#components.init_component(component, this.#storages);
    }

    component_id(component: Component): Option<ComponentId> {
        return this.#components.component_id(component)
    }

    resource_id(resource: Resource): Option<ResourceId> {
        return this.#components.get_resource_id(resource);
    }

    /**
     * @description
     * Retrives an [`EntityRef`] that exposes read-only operations for the given `entity`.
     * This will **throw** if the `entity` does not exist. Use [`World.get_entity`] if you want
     * to check for entity existence instead of implicitly throwing.
     */
    entity(entity: Entity): EntityRef {
        const ref = this.get_entity(entity);

        if (!ref) {
            throw new Error(`Entity ${entity} does not exist`)
        }

        return ref;

    }

    /**
 * @description
 * Retrives an [`EntityWorldMut`] that exposes read and write operations for the given `entity`.
 * This will **throw** if the `entity` does not exist. Use [`World.get_entity_mut`] if you want
 * to check for entity existence instead of implicitly throwing.
 */
    entity_mut(entity: Entity): EntityWorldMut {
        const ref = this.get_entity_mut(entity);
        if (!ref) {
            throw new Error(`Entity ${entity} does not exist`)
        }
        return ref;
    }

    component_info(component: Component): Option<ComponentInfo> {
        const id = this.component_id(component);
        return is_some(id) ? this.#components.get_info(id) : null;
    }

    inspect_entity(entity: Entity): ComponentInfo[] {
        const location = this.#entities.get(entity);
        if (!location) {
            throw new Error(`Entity ${entity} does not exist`)
        }

        const archetype = this.#archetypes.get(location.archetype_id);
        if (!archetype) {
            throw new Error(`Archetype ${location.archetype_id} does not exist`)
        }

        return archetype.components().filter_map(id => this.#components.get_info(id)).collect();
    }

    get_or_spawn(entity: Entity): EntityWorldMut {
        this.flush();
        // @ts-expect-error
        const m = this.#entities.__alloc_at_without_replacement(entity);
        if (m === AllocAtWithoutReplacement.DidNotExist) {
            return this.#spawn_at_empty_internal(entity);
        } else if (typeof m === 'object') {
            return new EntityWorldMut(this, entity, m)
        }
        return undefined as unknown as EntityWorldMut;
    }

    get_entity(entity: Entity): Option<EntityRef> {
        const location = this.#entities.get(entity);
        if (!location) {
            return
        }
        // ! Safety: if the Entity is invalid, the function returns early.
        // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
        return new EntityRef(new UnsafeEntityCell(this, entity, location))

    }

    get_entity_mut(entity: Entity): Option<EntityWorldMut> {
        const location = this.#entities.get(entity);
        if (!location) {
            return null
        }
        // ! Safety: if the Entity is invalid, the function returns early.
        // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
        // UnsafeEntityCell // { self.as_unsafe_world_cell_readonly, entity, location }
        return new EntityWorldMut(this, entity, location);
    }

    spawn_empty() {
        this.flush();
        const entity = this.#entities.alloc();
        return this.#spawn_at_empty_internal(entity);
    }

    spawn(bundle: InstanceType<Component>[] | (Bundle & DynamicBundle)): EntityWorldMut {
        if (Array.isArray(bundle)) {
            bundle = Bundles.dynamic_bundle(bundle, this);
        }

        this.flush();
        const change_tick = this.change_tick();
        const entity = this.#entities.alloc();
        const bundle_spawner = BundleSpawner.new(bundle, this, change_tick)
        const entity_location = bundle_spawner.spawn_non_existent(entity, bundle);

        return new EntityWorldMut(this, entity, entity_location);
    }

    spawn_batch(...bundle: (any[] | (Bundle & DynamicBundle))[]): SpawnBatchIter {
        this.flush();
        const len = bundle.length;
        this.#entities.reserve(len);
        if (Array.isArray(bundle)) {
            // @ts-expect-error
            bundle = Bundles.dynamic_bundle(bundle[0], this);
        }
        const bundle_info = this.#bundles.__init_info(bundle as any, this.#components, this.#storages);
        // const spawner = new BundleSpawner(this)
        // spawner.reserve_storage(len)
        // for (let i = 0; i < len; i++) {
        //     spawner.spawn(bundle[i] as any)
        // }
        return iter([]) as any;
    }

    despawn(entity: Entity): boolean {
        const e = this.get_entity_mut(entity);
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
    import { register_component, World } from 'ecs'

    class Position {
    
        constructor(public x: number, public y: number) {}
    }

    const world = new World();
    const entity = world.spawn(new Position(0, 0)).id();
    const position = world.get(entity, Position);
    console.log(position.x, position.y) // 0 0
    */
    get<T extends Component>(entity: Entity, component: T): Option<InstanceType<T>> {
        return this.get_entity(entity)?.get(component);
    }

    get_mut<T extends Component>(entity: Entity, component: T) {
        return this.get_entity_mut(entity)?.get_mut(component)
    }

    query<const D extends readonly any[]>(data: D): Query<D, []> {
        return this.query_filtered(data, []) as Query<D, []>
    }

    query_filtered<const D extends readonly any[], const F extends readonly any[]>(data: D, filter: F): Query<D, F> {
        return new Query(this, QueryState.new(data as any, filter as any, this) as QueryState<QueryData, QueryFilter>, false);
    }

    removed(type: Component) {
        const id = this.#components.get_id(type);
        if (is_some(id)) {
            return this.removed_with_id(id)
                .into_iter()
                .flatten()
        }

        return from_fn(() => { return done() })
    }

    removed_with_id(component_id: ComponentId): Iterator<any> {
        const removed = this.#removed_components.get(component_id);

        if (removed) {
            return removed.iter_current_update_events()
                .into_iter()
                .flatten()
                // TODO
                .map(e => e)
        }

        return from_fn(() => { return done() })
    }


    trigger_on_add(archetype: Archetype, entity: Entity, archetype_after_insert: any) { }
    trigger_on_insert(archetype: Archetype, entity: Entity, archetype_after_insert: any) { }
    trigger_on_replace(archetype: Archetype, entity: Entity, archetype_after_insert: any) { }
    trigger_on_remove(archetype: Archetype, entity: Entity, archetype_after_insert: any) { }

    trigger_observers(type: ObserverId, entity: Entity, archetype_after_insert: any) {

    }

    insert_resource(resource: Resource): void {
        const component_id = this.#components.init_resource(resource);
        this.insert_resource_by_id(component_id, resource);
    }

    remove_resource<R extends Resource>(resource: R): Option<R> {
        const component_id = this.#components.get_resource_id(resource);
        if (is_none(component_id)) {
            return null
        }

        const res = this.#storages.resources.get(component_id)?.remove() as Option<R>
        return res;
    }

    contains_resource(resource: Resource): boolean {
        const id = this.#components.get_resource_id(resource);
        if (is_none(id)) {
            return false
        }
        return this.#storages.resources.get(id)?.is_present() ?? false;
    }

    resource<R extends Resource>(resource: R): InstanceType<R> {
        const res = this.get_resource(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resources are also implicitly added via `app.add_event and can be added by plugins.`")
        }
        return res;
    }

    resource_mut<R extends Resource>(resource: R): InstanceType<R> {
        const res = this.get_resource_mut(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resources are also implicitly added via `app.add_event and can be added by plugins.`")
        }
        return res;
    }

    /**
     * @description
    Initializes a new resource and returns the [`ComponentId`] created for it.
        
    If the resource already exists, nothing happens.
        
    The value given by the [`FromWorld::from_world`] method will be used.
    Note that any resource with the [`Default`] trait automatically implements [`FromWorld`],
    and those default values will be here instead.
     */
    init_resource(resource: Resource): ComponentId {
        const component_id = this.#components.init_resource(resource);

        const r = this.#storages.resources.get(component_id)
        if (!r || !r.is_present()) {
            const v = resource.from_world(this);
            this.insert_resource_by_id(component_id, v);
        }
        return component_id;
    }

    get_resource<R extends Resource>(resource: R): Option<InstanceType<R>> {
        const id = this.#components.resource_id(resource);
        if (!is_some(id)) {
            return
        }

        return this.#storages.resources.get(id)?.get()
    }

    get_resource_mut<R extends Resource>(resource: R): Option<InstanceType<R>> {
        const id = this.#components.resource_id(resource);
        if (is_none(id)) {
            return
        }

        return this.#storages.resources.get(id)?.get_mut(this.last_change_tick(), this.change_tick());

    }

    get_resource_by_id<R extends Resource>(component_id: ComponentId): Option<InstanceType<R>> {
        return this.#storages.resources.get(component_id)?.get()
    }

    get_resource_mut_by_id<R extends Resource>(component_id: ComponentId): Option<[InstanceType<R>, TicksMut]> {
        return this.#storages.resources.get(component_id)?.get_mut(this.last_change_tick(), this.change_tick())
    }

    get_resource_with_ticks<R extends Resource>(component_id: ComponentId): Option<[InstanceType<R>, ComponentTicks]> {
        return this.#storages.resources.get(component_id)?.get_with_ticks();
    }

    get_resource_or_insert_with<R extends Resource>(resource: R, func: () => R): R {
        const component_id = this.#components.init_resource(resource);
        const data = this.__initialize_resource_internal(component_id);
        if (!data.is_present()) {
            data.insert(func(), this.change_tick())
        }

        return data.get() as R;
    }

    insert_resource_by_id(component_id: ComponentId, value: TypeId) {
        this.__initialize_resource_internal(component_id).insert(value, this.change_tick());
    }

    get_resource_or_init<R extends Resource>(resource: R): InstanceType<R> {
        const change_tick = this.change_tick();
        const last_change_tick = this.last_change_tick();

        const component_id = this.register_resource(resource);
        if (!this.#storages.resources.get(component_id)) {
            const ptr = resource.from_world(this);
            this.insert_resource_by_id(component_id, ptr)
        }

        const data = this.#storages.resources.get(component_id)!;
        return data.get_mut(last_change_tick, change_tick)
    }

    insert_or_spawn_batch(iterable: Iterable<[Entity, Bundle]> & ArrayLike<[Entity, Bundle]>) {

    }

    send_event<E extends Event>(type: Events<E>, event: E): Option<EventId> {
        return this.send_event_batch(type, once(event))?.next().value
    }

    send_event_default<E extends Event>(type: Events<E>, event: E & { default(): E }): Option<EventId> {
        return this.send_event(type, event.default())
    }

    send_event_batch<E extends Event>(type: Events<E>, events: Iterable<E>): SendBatchIds<E> {
        const events_resource = this.get_resource(type as any)
        return TODO('World::send_event_batch()', events, events_resource)
    }

    change_tick(): Tick {
        return new Tick(this.#change_tick);
    }

    last_change_tick(): Tick {
        return this.#last_change_tick;
    }

    check_change_ticks() {
        const change_tick = this.change_tick();
        if (change_tick.relative_to(this.#last_change_tick).get() < CHECK_TICK_THRESHOLD) {
            return;
        }

        const { tables,
            sparse_sets,
            resources
        } = this.#storages;

        tables.check_change_ticks(change_tick);
        sparse_sets.check_change_ticks(change_tick);
        resources.check_change_ticks(change_tick);

        this.get_resource_mut(Schedules)?.check_change_ticks(change_tick);
        this.#last_change_tick = change_tick;
    }

    increment_change_tick(): Tick {
        const change_tick = this.#change_tick;
        const prev_tick = change_tick;
        this.#change_tick = u32.wrapping_add(change_tick, 1);

        return new Tick(prev_tick);
    }

    read_change_tick(): Tick {
        return new Tick(this.#change_tick);
    }

    /**
     * @description
     * Empties queued entities and adds them to the empty [`Archetype`](module/archetype::Archetype).
     * This should be called before doing operations that might operate on queued entities,
     * such as inserting a [`Component`]
     */
    flush() {
        this.__flush_entities();
        this.__flush_commands();
    }

    /**
     * @description
     * Runs both [`clear_entities`] and [`clear_resources`],
     * invalidating all [`Entity`] and resource fetches such as [`Res`]
     */
    clear_all() {
        this.clear_entities();
        this.clear_resources();
    }

    clear_trackers() {
        this.#removed_components.update();
        this.#last_change_tick = this.increment_change_tick();
    }

    /**
     * @description Despawns all entities in this [`World`].
     */
    clear_entities() {
        this.#storages.tables.clear();
        this.#storages.sparse_sets.__clear_entities();
        this.#archetypes.__clear_entities();
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
    clear_resources() {
        this.#storages.resources.clear()
    }

    resource_scope() { }

    add_schedule(schedule: Schedule) {
        const schedules = this.get_resource_or_init(Schedules) as Schedules;
        schedules.insert(schedule);
    }

    try_schedule_scope<R>(label: ScheduleLabel, scope: (world: World, schedule: Schedule) => R): Result<R, TryRunScheduleError> {
        const schedule = this.get_resource_mut(Schedules)?.remove(label);
        if (!schedule) {
            return new TryRunScheduleError(label);
        }
        const value = scope(this, schedule);
        const old = this.resource_mut(Schedules)?.insert(schedule);
        if (is_some(old)) {
            console.warn(`Schedule ${label} was inserted during a call to World.try_schedule_scope`);
        }
        return value;
    }

    schedule_scope(label: ScheduleLabel, scope: (world: World, schedule: Schedule) => void) {
        const res = this.try_schedule_scope(label, scope)
        if (res instanceof TryRunScheduleError) {
            throw new Error(res.get())
        }
        return res;
    }

    try_run_schedule(label: ScheduleLabel) {
        return this.try_schedule_scope(label, (world, sched) => sched.run(world))
    }

    run_schedule(label: ScheduleLabel) {
        this.schedule_scope(label, (world, sched) => sched.run(world))
    }

    run_system_once<In extends SystemInput, Out, T extends System<In, Out>>(system: T): Result<Out, RunSystemError> {
        return this.run_system_once_with(system, unit)
    }

    run_system_once_with<In extends SystemInput, Out, Marker, T extends System<In, Out>>(system: T, input: any): Result<Out, RunSystemError> {
        // TODO make function arguments  dynamic
        // TODO instead of statically user defined
        // * See ``
        system = IntoSystemTrait.into_system(system as unknown as IntoSystemTrait<In, Out, Marker>) as T;
        system.initialize(this);
        if (system.validate_param(this)) {
            return system.run(input, this)
        } else {
            return RunSystemError.InvalidParams(system.name())
        }
    }

    __last_trigger_id() {
        return this.#last_trigger_id;
    }

    __flush_entities() {
        const empty_archetype = this.#archetypes.empty();
        const table = this.#storages.tables.get(empty_archetype.table_id())!;
        this.#entities.flush((entity, location) => {
            // @ts-expect-error
            const new_loc = empty_archetype.__allocate(entity, table.__allocate(entity));
            location.archetype_id = new_loc.archetype_id;
            location.archetype_row = new_loc.archetype_row;
            location.table_id = new_loc.table_id;
            location.table_row = new_loc.table_row;
        })
    }

    __flush_commands() {
        if (!this.#command_queue.is_empty()) {
            this.#command_queue.clone().apply_or_drop_queued(this)
        }
    }

    __get_resource_archetype_component_id(component_id: ComponentId): Option<ArchetypeComponentId> {
        return this.#storages.resources.get(component_id)?.id();
    }

    __initialize_resource_internal(component_id: ComponentId) {
        const archetypes = this.#archetypes;
        return this.#storages.resources.__initialize_with(component_id, this.#components, () => archetypes.new_archetype_component_id())
    }

    #bootstrap() {
        assert(ON_ADD === this.register_component(OnAdd as Component))
        assert(ON_INSERT === this.register_component(OnInsert as Component))
        assert(ON_REPLACE === this.register_component(OnReplace as Component))
        assert(ON_REMOVE === this.register_component(OnRemove as Component))
    }

    // @ts-expect-error
    #get_entities_mut_unchecked(entities: Entity[]): Result<EntityWorldMut[], QueryEntityError> {
        const refs: EntityWorldMut[] = []
        const w = this;
        for (let i = 0; i < entities.length; i++) {
            const ref = w.get_entity_mut(entities[i]);
            if (!ref) {
                // @ts-expect-error
                return new ErrorExt(QueryEntityError.NoSuchEntity(entities[i]))
            }
            refs[i] = ref;
        }
        return refs;
    }

    // #spawn_post_flush(bundle: any) {
    //     const entity = this.#entities.alloc();
    //     if (Array.isArray(bundle)) {
    //         bundle = Bundles.dynamic_bundle(bundle, this);
    //     }
    //     const bundle_info = this.#bundles.__init_info(bundle, this.#components, this.#storages);
    //     const spawner = bundle_info.__get_bundle_spawner(this.#entities, this.#archetypes, this.#components, this.#storages, this.change_tick());
    //     const entity_location = spawner.spawn_non_existent(entity, bundle);
    //     return new EntityWorldMut(this, entity, entity_location);
    // }

    #spawn_at_empty_internal(entity: Entity): EntityWorldMut {
        const archetype = this.#archetypes.empty();
        // @ts-expect-error
        const table_row = this.#storages.tables.get(archetype.table_id())!.__allocate(entity);
        // @ts-expect-error
        const location = archetype.__allocate(entity, table_row);
        // @ts-expect-error
        this.#entities.__set(entity.index(), location);
        return new EntityWorldMut(this, entity, location);
    }
}