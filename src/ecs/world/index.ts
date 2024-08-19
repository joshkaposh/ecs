import { ExactSizeDoubleEndedIterator, ExactSizeIterator, Iterator, from_fn, iter, once } from "joshkaposh-iterator";
import { TODO } from "joshkaposh-iterator/src/util";
import { Err, Option, Result, is_error, is_none, is_some, ErrorExt } from 'joshkaposh-option';
import { UNIT, Unit } from '../../util';
import { ArchetypeComponentId, Archetypes } from "../archetype";
import { Component, ComponentId, ComponentInfo, Components, Resource, TypeId } from "../component";
import { Storages } from "../storage";
import { AllocAtWithoutReplacement, Entities, Entity, EntityLocation } from "../entity";
import { Bundle, BundleInserter, Bundles, DynamicBundle } from "../bundle";
import { QueryData, QueryEntityError, QueryFilter, QueryState } from "../query";
import { RemovedComponentEvents } from "../removal-detection";
import { Event, EventId, Events, SendBatchIds } from "../event";
import { Schedule, ScheduleLabel, Schedules } from "../schedule";
import { EntityRef, EntityMut, EntityWorldMut } from './entity-ref'
import { SpawnBatchIter } from "./spawn-batch";
import { UnsafeEntityCell } from "./unsafe-world-cell";

export { EntityRef, EntityWorldMut, EntityMut }

// export * from './entity-ref';
// export * from './spawn-batch';

type TryRunScheduleError = any;

export type WorldId = number;

export class World {
    #id: WorldId;
    #entities: Entities;
    #components: Components;
    #archetypes: Archetypes;
    #storage: Storages;
    #bundles: Bundles;
    #removed_components: RemovedComponentEvents;
    // #archetype_component_access: ArchetypeComponentAccess

    private constructor(id: number, entities: Entities, components: Components, archetypes: Archetypes, storages: Storages, bundles: Bundles, removed_components: RemovedComponentEvents) {
        this.#id = id; // WorldId.new().expect("...")
        this.#entities = entities;
        this.#components = components;
        this.#archetypes = archetypes;
        this.#storage = storages;
        this.#bundles = bundles;
        this.#removed_components = removed_components;
    }

    static default() {
        return new World(0,
            new Entities(),
            Components.default(),
            new Archetypes(),
            Storages.default(),
            new Bundles(),
            RemovedComponentEvents.default()
        )
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
        return this.#storage;
    }

    bundles(): Bundles {
        return this.#bundles;
    }

    removed_components(): RemovedComponentEvents {
        return this.#removed_components;
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
        return this.#components.init_component(component, this.#storage);
    }

    component_id(component: Component): Option<ComponentId> {
        return this.#components.component_id(component)
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

    many_entities(entities: Entity[]): EntityRef[] {
        const refs = this.get_many_entities(entities);
        if (is_error(refs)) {
            throw new Error(`Entity ${refs.get()} does not exist`)
        }

        return refs as EntityRef[];
    }

    many_entities_mut(entities: Entity[]): EntityWorldMut[] {
        const refs = this.get_many_entities_mut(entities);
        if (is_error(refs)) {
            throw new Error(`Entity ${refs.get()} does not exist`)
        }

        return refs as EntityWorldMut[];
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

    get_or_spawn(entity: Entity): Option<EntityWorldMut> {
        this.flush();
        const m = this.#entities.__alloc_at_without_replacement(entity);
        if (m === AllocAtWithoutReplacement.DidNotExist) {
            return this.#spawn_at_empty_internal(entity);
        } else if (typeof m === 'object') {
            return new EntityWorldMut(this, entity, m)
        }

        return;
    }

    get_entity(entity: Entity): Option<EntityRef> {
        const location = this.#entities.get(entity);
        if (!location) {
            return
        }
        // ! Safety: if the Entity is invalid, the function returns early.
        // ! Additionally, Entities.get() returns the correct EntityLocation if the Entity exists.
        // UnsafeEntityCell // { self.as_unsafe_world_cell_readonly, entity, location }
        return new EntityRef(new UnsafeEntityCell(this, entity, location))
    }

    get_many_entities(entities: Entity[]): Result<EntityRef[], Err<Entity>> {
        const refs: EntityRef[] = [];
        for (let i = 0; i < entities.length; i++) {
            const ref = this.get_entity(entities[i]);
            if (is_none(ref)) {
                return new ErrorExt(entities[i]);
            }
            refs[i] = ref;
        }
        return refs;
    }

    /**
 *@summary
 Returns an Iterator (element type = Entity) of current entities.

 This is useful in contexts where you have read-only access to the World
 */
    iter_entities(): Iterator<EntityRef> {
        return this.#archetypes.iter().flat_map(archetype => {
            return iter(archetype.entities())
                .enumerate()
                .map(([archetype_row, archetype_entity]) => {
                    const entity = archetype_entity.id();
                    const location = {
                        archetype_id: archetype.id(),
                        archetype_row: archetype_row,
                        table_id: archetype.table_id(),
                        table_row: archetype_entity.table_row
                    }
                    return new EntityRef(new UnsafeEntityCell(this, entity, location));
                })
        }) as any
    }

    iter_entities_mut(): Iterator<EntityWorldMut> {
        return this.archetypes().iter().flat_map(archetype => {
            return iter(archetype.entities())
                .enumerate()
                .map(([archetype_row, archetype_entity]) => {
                    const entity = archetype_entity.id();
                    const location: EntityLocation = {
                        archetype_id: archetype.id(),
                        archetype_row: archetype_row,
                        table_id: archetype.table_id(),
                        table_row: archetype_entity.table_row
                    }
                    return new EntityWorldMut(this, entity, location)
                })
        }) as any
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

    get_many_entities_mut(entities: Entity[]): Result<EntityWorldMut[], QueryEntityError> {
        for (let i = 0; i < entities.length; i++) {
            for (let j = 0; j < i; j++) {
                if (`${entities[i]}` === `${entities[j]}`) {
                    return QueryEntityError.AliasedMutability(entities[i])
                }
            }
        }

        // ! Safety: Each entity is unique.
        return this.#get_entities_mut_unchecked(entities);
    }


    #get_entities_mut_unchecked(entities: Entity[]): Result<EntityWorldMut[], QueryEntityError> {
        const refs: EntityWorldMut[] = []
        const w = this;
        for (let i = 0; i < entities.length; i++) {
            const ref = w.get_entity_mut(entities[i]);
            if (!ref) {
                return QueryEntityError.NoSuchEntity(entities[i])
            }
            refs.push(ref);
        }
        return refs;
    }

    spawn_empty() {
        this.flush();
        const entity = this.#entities.alloc();
        return this.#spawn_at_empty_internal(entity);
    }

    spawn(bundle: any[] | (Bundle & DynamicBundle)): EntityWorldMut {
        this.flush();
        const entity = this.#entities.alloc();
        if (Array.isArray(bundle)) {
            bundle = Bundles.dynamic_bundle(bundle);
        }
        const bundle_info = this.#bundles.__init_info(bundle, this.#components, this.#storage);
        const spawner = bundle_info.__get_bundle_spawner(this.#entities, this.#archetypes, this.#components, this.#storage);
        const entity_location = spawner.spawn_non_existent(entity, bundle);
        return new EntityWorldMut(this, entity, entity_location);
    }

    #spawn_at_empty_internal(entity: Entity): EntityWorldMut {
        const archetype = this.#archetypes.empty_mut();
        const table_row = this.#storage.tables.get(archetype.table_id())!.__allocate(entity);
        const location = archetype.__allocate(entity, table_row);
        this.#entities.__set(entity.index(), location);
        return new EntityWorldMut(this, entity, location);
    }

    spawn_batch(...iterable: ((Bundle & DynamicBundle) | any)[]): SpawnBatchIter {
        let it: ExactSizeIterator<Bundle & DynamicBundle>, item;
        if (Array.isArray(iterable[0])) {
            it = iter(iterable).map(arr => Bundles.dynamic_bundle(arr)) as ExactSizeDoubleEndedIterator<Bundle & DynamicBundle>;
            item = Bundles.dynamic_bundle(iterable[0]);
        } else {
            it = iter(iterable);
            item = iterable[0];
        }
        return new SpawnBatchIter(this, it, item);
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

    despawn(entity: Entity): boolean {
        const e = this.get_entity_mut(entity);
        if (e) {
            e.despawn();
            return true;
        }
        return false;
    }

    query<const D extends QueryData<{}>>(data: D): QueryState<D, QueryFilter<Unit>> {
        // @ts-expect-error
        return this.query_filtered(data, UNIT);
    }

    query_filtered<const D extends QueryData<{}>, const F extends QueryFilter<{}>>(data: D, filter: F): QueryState<D, F> {
        return QueryState.new(this, data, filter as any);
    }

    removed(type: Component) {
        const id = this.#components.get_id(type);
        if (is_some(id)) {
            return this.removed_with_id(id)
                .into_iter()
                .flatten()
        }

        return from_fn(() => { })
    }

    removed_with_id(component_id: ComponentId): Iterator<any> {
        const removed = this.#removed_components.get(component_id);

        if (removed) {
            return removed.iter_current_update_events()
                .into_iter()
                .flatten()
                // TODO
                // @ts-expect-error
                .map(e => e.into())
        }

        return from_fn(() => { })
    }

    insert_resource(resource: Resource<Component>): void {
        const component_id = this.#components.init_resource(resource);
        this.insert_resource_by_id(component_id, resource);
    }

    remove_resource<R extends Resource<Component>>(resource: R): Option<R> {
        const component_id = this.#components.get_resource_id(resource);
        if (is_none(component_id)) {
            return null
        }

        const res = this.#storage.resources.get(component_id)?.remove()
        return res;
    }

    contains_resource(resource: Resource<Component>): boolean {
        const id = this.#components.get_resource_id(resource);
        if (is_none(id)) {
            return false
        }
        return this.#storage.resources.get(id)?.is_present() ?? false;
    }

    resource<R extends Resource<Component>>(resource: R): InstanceType<R> {
        const res = this.get_resource(resource);
        if (!res) {
            throw new Error("Requested resource does not exist in the `World`. Did you forget to add it using `app.insert_resource` / `app.init_resource`? Resource<Component>s are also implicitly added via `app.add_event and can be added by plugins.`")
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
    init_resource(resource: Resource<Component>): ComponentId {
        const component_id = this.#components.init_resource(resource);
        const r = this.#storage.resources.get(component_id)
        if (!r || !r.is_present()) {
            const v = resource.from_world(this);
            this.insert_resource_by_id(component_id, v);
        }
        return component_id;
    }

    insert_resource_by_id(component_id: ComponentId, value: TypeId) {
        this.#initialize_resource_internal(component_id).insert(value)
    }

    #initialize_resource_internal(component_id: ComponentId) {
        const archetypes = this.#archetypes;
        return this.#storage.resources.__initialize_with(component_id, this.#components, () => archetypes.__new_archetype_component_id())
    }

    get_resource<R extends Resource<Component>>(resource: R): Option<InstanceType<R>> {
        return this.#storage.resources.get(this.#components.component_id(resource)!) as Option<InstanceType<R>>;
    }

    get_resource_or_insert_with<R extends Resource<Component>>(resource: R, func: () => R): R {
        const component_id = this.#components.init_resource(resource);
        const data = this.#initialize_resource_internal(component_id);
        if (!data.is_present()) {
            data.insert(func())
        }

        return data.get_data();
    }

    __get_resource_archetype_component_id(component_id: ComponentId): Option<ArchetypeComponentId> {
        const resource = this.#storage.resources.get(component_id);
        return is_none(resource) ? null : resource.id();
    }

    insert_or_spawn_batch(iterable: Iterable<[Entity, Bundle]> & ArrayLike<[Entity, Bundle]>) {
        const bundle_info = this.#bundles.__init_info(iterable[0][1], this.#components, this.#storage);

        const spawn_or_insert = bundle_info.__get_bundle_spawner(
            this.#entities,
            this.#archetypes,
            this.#components,
            this.#storage
        )

        const invalid_entities: any[] = [];

        for (const [entity, bundle] of iterable) {
            const alloc = spawn_or_insert.__entities.__alloc_at_without_replacement(entity);
            // TODO: double check
            if (typeof alloc === 'object') {
                if (spawn_or_insert instanceof BundleInserter) {
                    // if (alloc.archetype_id == ) {

                    // }
                }
            }
        }
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

    /**
     * @description
     * Empties queued entities and adds them to the empty [`Archetype`](module/archetype::Archetype).
     * This should be called before doing operations that might operate on queued entities,
     * such as inserting a [`Component`]
     */
    flush() {
        const empty_archetype = this.#archetypes.empty_mut();
        const table = this.#storage.tables.get(empty_archetype.table_id())!;
        this.#entities.flush((entity, location) => {
            // ! SAFETY: no components are allocated by archetype.allocate because the archetype is empty.
            const { archetype_id, archetype_row, table_id, table_row } = empty_archetype.__allocate(entity, table.__allocate(entity))
            location.archetype_id = archetype_id;
            location.archetype_row = archetype_row;
            location.table_id = table_id;
            location.table_row = table_row;
        })
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


    /**
     * @description Despawns all entities in this [`World`].
     */
    clear_entities() {
        this.#storage.tables.clear();
        this.#storage.sparse_sets.__clear_entities();
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

    }

    try_schedule_scope<Fn extends (world: World, schedule: Schedule) => any>(label: ScheduleLabel, fn: Fn): Result<ReturnType<Fn>, TryRunScheduleError> {
        const s = this.get_resource(Schedules as Resource<Component>);
        let schedule;
        if (s) {
            schedule = s.remove(label)
        } else {
            // @ts-expect-error
            return new ErrorExt(TryRunScheduleError(label));
        }

        const value = fn(this, schedule);

        const old = this.resource(Schedules as Resource<Component>).insert(schedule);
        if (is_some(old)) {
            console.warn(`Schedule ${label} was inserted during a call to World.schedule_scope: its value has been overwritten.`)
        }

        return value;
    }

    schedule_scope(label: ScheduleLabel, fn: (world: World, schedule: Schedule) => any) {
        const r = this.try_schedule_scope(label, fn);
        if (is_error(r)) {
            throw new Error(r.get());
        }
    }

    try_run_schedule(label: ScheduleLabel) {
        return this.try_schedule_scope(label, (world, sched) => sched.run(world))
    }

    run_schedule(label: ScheduleLabel) {
        this.schedule_scope(label, (world, sched) => sched.run(world))
    }
}