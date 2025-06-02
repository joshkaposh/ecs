import { FixedBitSet } from "fixed-bit-set";
import { Archetype, ArchetypeGeneration, ArchetypeId, QueryData, QueryFilter, QueryIter, World, QueryDataTuple, All, Tick, Entity, QueryEntityError, QueryCombinationIter, ThinQueryIter, ThinQueryData, ThinQueryFilter, QueryItem, AsQueryState, QueryTupleToQueryData, QueryTupleToQueryFilter } from "ecs";
import { TableId } from "../storage/table";
import { Access, FilteredAccess } from "./access";
import { is_some, Result } from "joshkaposh-option";
import { debug_assert } from "../util";
import { TODO } from "joshkaposh-iterator/src/util";

type ThinWorld = any;

export interface StorageIdTable {
    table_id: TableId;
}

export interface StorageIdArchetype {
    archetype_id: ArchetypeId;
}

export type StorageId = StorageIdTable | StorageIdArchetype;

export function from_tuples<D extends QueryData, F extends QueryFilter>(fetch: readonly any[], filter: readonly any[]): [D, F] {
    return [new QueryDataTuple(fetch) as unknown as D, All(...filter) as unknown as F];
}

export class QueryState<D extends QueryData = QueryData, F extends QueryFilter = QueryFilter> {
    D: D;
    F: F;
    readonly is_dense: boolean;

    #world_id: number;

    private __archetype_generation: ArchetypeGeneration;
    private __matched_tables: FixedBitSet;
    private __matched_archetypes: FixedBitSet;
    private __component_access: FilteredAccess;
    private __matched_storage_ids: StorageId[];
    private __fetch_state: AsQueryState<D>
    private __filter_state: AsQueryState<F>;

    private constructor(
        data: D,
        filter: F,
        world_id: number,
        archetype_generation: ArchetypeGeneration,
        matched_storaged_ids: StorageId[],
        is_dense: boolean,
        fetch_state: AsQueryState<D>,
        filter_state: AsQueryState<F>,
        component_access: FilteredAccess,
        matched_tables: FixedBitSet,
        matched_archetypes: FixedBitSet,
    ) {
        this.#world_id = world_id;
        this.__archetype_generation = archetype_generation;
        this.D = data;
        this.F = filter;
        this.__matched_storage_ids = matched_storaged_ids;
        this.is_dense = is_dense;
        this.__fetch_state = fetch_state;
        this.__filter_state = filter_state;
        this.__component_access = component_access;
        this.__matched_tables = matched_tables;
        this.__matched_archetypes = matched_archetypes;
    }

    static new<Data extends readonly any[], Filter extends readonly any[], D extends QueryTupleToQueryData<Data>, F extends QueryTupleToQueryFilter<Filter>>(data: Data, filter: Filter, world: World): QueryState<D, F> {
        const D = new QueryDataTuple(data);
        const F = All(...filter);

        const state = QueryState.newUninitialized<D, F>(D as any, F as any, world)
        state.update_archetypes(world);
        return state;
    }

    static newWithAccess<D extends QueryData, F extends QueryFilter>(data: D, filter: F, world: World, access: Access): QueryState<D, F> {
        const state = QueryState.newUninitialized<D, F>(data, filter, world);
        for (const archetype of world.archetypes.iter()) {
            state.#new_archetype_internal(archetype);
            state.update_archetype_component_access(archetype, access);

            if (state.#new_archetype_internal(archetype)) {
                state.update_archetype_component_access(archetype, access);
            }
        }

        state.__archetype_generation = world.archetypes.generation;

        if (state.__component_access.access().has_read_all_resources()) {
            access.read_all_resources();
        } else {
            for (const component_id of state.__component_access.access().resource_reads()) {
                access.add_resource_read(world.__initializeResourceInternal(component_id).id)
            }
        }

        debug_assert(!state.__component_access.access().has_any_resource_write(), 'Mutable resource access in queries not allowed')

        return state;

    }

    static newUninitialized<D extends QueryData, F extends QueryFilter>(D: D, F: F, world: World): QueryState<D, F> {
        const fetch_state = D.init_state(world);
        const filter_state = F.init_state(world);

        return QueryState.fromStatesUninitialized<D, F>(D, F, world.id, fetch_state, filter_state);
    }

    static fromStatesUninitialized<D extends QueryData, F extends QueryFilter>(D: D, F: F, world_id: number, fetch_state: any, filter_state: any): QueryState<D, F> {
        const component_access = new FilteredAccess();
        D.update_component_access(fetch_state, component_access);

        const filter_component_access = new FilteredAccess();
        F.update_component_access(filter_state, filter_component_access);

        component_access.extend(filter_component_access);

        const is_dense = D.IS_DENSE && F.IS_DENSE;

        return new QueryState<D, F>(
            D,
            F,
            world_id,
            ArchetypeGeneration.initial(),
            [],
            is_dense,
            fetch_state,
            filter_state,
            component_access,
            FixedBitSet.default(),
            FixedBitSet.default()
        )
    }

    clone() {
        throw new Error('QueryState.clone()')
        return new QueryState(
            this.D,
            this.F,
            this.#world_id,
            this.__archetype_generation,
            structuredClone(this.__matched_storage_ids),
            this.is_dense,
            // @ts-expect-error
            this.D.__fetch_state,
            // @ts-expect-error
            this.F.__filter_state,
            this.__component_access.clone(),
            this.__matched_tables.clone(),
            this.__matched_archetypes.clone()
        )
    }


    // TODO - remove any mutable querydata
    // as_readonly() {
    //     // return this.as_transmuted_state(D.Readonly, F)
    // }

    // TODO - convert to NoopQuery
    // as_nop() {
    //     // return this.as_transmuted_state(NoopWorldQuery, F)
    // }

    // TODO - implement
    // as_transmuted_state(NewD: QueryData<AsQueryState<D>, NewF: AsQueryState<F>>) {}


    new_archetype(archetype: Archetype, access: Access) {
        if (this.#new_archetype_internal(archetype)) {
            this.update_archetype_component_access(archetype, access);
        }
    }

    update_archetypes(world: World) {
        this.validate_world(world.id);
        const archetypes = world.archetypes;

        if (this.__component_access.__required.is_empty()) {
            const old_generation = this.__archetype_generation;
            this.__archetype_generation = archetypes.generation;

            const archetypes_array = archetypes.inner;
            for (let i = old_generation; i < archetypes_array.length; i++) {
                this.#new_archetype_internal(archetypes_array[i]);
            }

        } else {
            if (this.__archetype_generation === archetypes.generation) {
                return
            }
            const potential_archetypes = this.__component_access.__required.ones().filter_map(idx => {
                const keys = archetypes.componentIndex().get(idx as any)?.keys();
                if (!keys) {
                    return
                }
                return Array.from(keys);

            }).min_by_key('length');

            if (potential_archetypes) {
                for (let i = 0; i < potential_archetypes.length; i++) {
                    const archetype_id = potential_archetypes[i];
                    if (archetype_id < this.__archetype_generation) {
                        continue
                    }

                    this.#new_archetype_internal(archetypes.get(archetype_id)!);
                }
            }
            this.__archetype_generation = archetypes.generation;
        }
    }

    update_archetype_component_access(archetype: Archetype, access: Access) {
        const [component_reads_and_writes, comonent_reads_and_writes_inverted] = this.__component_access.access().component_reads_and_writes();
        const [component_writes, component_writes_inverted] = this.__component_access.access().component_writes();
        if (!comonent_reads_and_writes_inverted && !component_writes_inverted) {
            component_reads_and_writes.for_each(id => {
                id = archetype.getArchetypeComponentId(id)!
                if (is_some(id)) {
                    access.add_component_read(id);
                }
            })

            component_writes.for_each(id => {
                id = archetype.getArchetypeComponentId(id)!
                if (is_some(id)) {
                    access.add_component_write(id);
                }
            })
        }

        for (const [component_id, archetype_component_id] of archetype.__componentsWithArchetypeComponentId()) {
            if (this.__component_access.access().has_component_read(component_id)) {
                access.add_component_read(archetype_component_id);
            }

            if (this.__component_access.access().has_component_write(component_id)) {
                access.add_component_write(archetype_component_id);
            }
        }
    }

    validate_world(world_id: number) {
        if (this.#world_id !== world_id) {
            throw new Error('Encountered a mismatched World. This QueryState was created from ' + this.#world_id)
        }
    }

    matched_tables() {
        return this.__matched_tables.ones();
    }

    matched_archetypes() {
        return this.__matched_archetypes.ones();
    }

    matches_component_set(set_contains_id: (id: number) => boolean) {
        return this.__component_access.__filter_sets.length === 0 || this.__component_access.__filter_sets.some(set => (set
            .with
            .ones()
            .all(index => set_contains_id(index))
            && set
                .without
                .ones()
                .all(index => !set_contains_id(index))
        ))
    }

    is_empty(world: World, last_run: Tick, this_run: Tick) {
        this.validate_world(world.id);
        return TODO('QueryState.is_empty()', last_run, this_run);
        // return this.query_unchecked_manual_with_ticks(world, last_run, this_run).is_empty();
    }

    contains(world: World, entity: Entity, last_run: Tick, this_run: Tick): boolean {
        this.validate_world(world.id);

        return TODO('QueryState.contains()', entity, last_run, this_run);
        // return this.query_unchecked_manual_with_ticks(world, last_run, this_run).contains(entity);
    }

    /**
     * Use this method to transform a `QueryState` into a more generic `QueryState`.
     * This can be useful for passing to another function that might take the more general form.
     * See `Query.transmute_lens()` for more details.
     * 
     * You should not call `QueryState.update_archetypes()` on the returned `QueryState` as the result will be unpredictable.
     * You might end of with a mix of archetypes that only matched the original query + archetypes that only match
     * the new `QueryState`. Most of the safe methods on `QueryState` call `QueryState.update_archetypes()` internally, so this is best used through a `Query`.
     */
    transmute<NewD extends QueryData>(new_data: readonly any[], world: World): QueryState<NewD> {
        return this.transmute_filtered(new_data, [], world);
    }

    transmute_filtered<NewD extends QueryData, NewF extends QueryFilter>(new_data: readonly any[], new_filter: readonly any[], world: World): QueryState<NewD, NewF> {
        this.validate_world(world.id);

        const [NewD, NewF] = from_tuples<NewD, NewF>(new_data, new_filter)

        const component_access = new FilteredAccess();
        const fetch_state = NewD.get_state(world.components);
        if (fetch_state == null) {
            throw new Error('Could not create fetch_state, Please initialize all referenced components before transmuting');
        }
        const filter_state = NewF.get_state(world.components);
        if (filter_state == null) {
            throw new Error('Could not create fetch_state, Please initialize all referenced components before transmuting');
        }

        NewD.set_access(fetch_state, this.__component_access);
        NewD.update_component_access(fetch_state, component_access);

        const filter_component_access = new FilteredAccess();
        NewF.update_component_access(filter_state, filter_component_access);

        component_access.extend(filter_component_access);
        debug_assert(component_access.is_subset(this.__component_access), `Transmuted state for [${new_data.constructor.name}, ${new_filter.constructor.name}] attempts to access terms that are not allowed by the original state [${this.D.constructor.name}, ${this.F.constructor.name}]`)

        return new QueryState<NewD, NewF>(
            NewD,
            NewF,
            this.#world_id,
            this.__archetype_generation,
            structuredClone(this.__matched_storage_ids),
            this.is_dense,
            fetch_state,
            filter_state,
            this.__component_access.clone(),
            this.__matched_tables.clone(),
            this.__matched_archetypes.clone()
        )
    }

    /**
     * Use this to combine two queries. The data accessed wil be the intersection
     * of archetypes included in both queries. This can be useful for accessing a
     * subset of the entities between two queries.
     * 
     * You should not call `QueryState.update_archetypes()` on the returned `QueryState`, as the result
     * could be unpredictable. You might end up with a mix of archetypes that only matched
     * the original query + archetypes that only match the new `QueryState`. Most of the
     * safe methods on `QueryState` call `QueryState.update_archetypes()` internally, so
     * this is best used through a `Query`.
     * 
     * Performance
     * 
     * This will have similar performance as constructing a new `QueryState`, since much of the internal state
     * will need to be reconstructed. But it will be a little faster as it only needs to compare the intersection
     * of matching archetypes rather than iterating over all archetypes.
     * 
    * @throws Will throw an error if `NewD` contains accesses not in `Q` or `OtherQ`
     */
    join<OtherD extends QueryData, NewD extends QueryData>(
        world: World,
        NewD: NewD,
        other: QueryState<OtherD, QueryFilter>
    ): QueryState<NewD> {
        return this.join_filtered(world, NewD, All(), other);
    }

    /**
     * Use this to combine two queries. The data accessed will be the intersection
     * of archetypes included in both queries
     * 
     * @throws will throw if `NewD` or `newF` requires accesses not in `Q` or `OtherQ`
     */
    join_filtered<OtherD extends QueryData, OtherF extends QueryFilter, NewD extends QueryData, NewF extends QueryFilter>(
        world: World,
        NewD: NewD,
        NewF: NewF,
        other: QueryState<OtherD, OtherF>
    ): QueryState<NewD, NewF> {
        this.validate_world(world.id);

        const component_access = new FilteredAccess();

        const new_fetch_state = NewD.get_state(world.components);
        if (new_fetch_state == null) {
            throw new Error('could not creat fetch_state. Please initialize all referenced components before joining')
        }

        const new_filter_state = NewF.get_state(world.components);
        if (new_filter_state == null) {
            throw new Error('could not creat filter_state. Please initialize all referenced components before joining')
        }

        NewD.set_access(new_fetch_state, this.__component_access);
        NewD.update_component_access(new_fetch_state, component_access);

        const new_filter_component_access = new FilteredAccess();
        NewF.update_component_access(new_filter_state, new_filter_component_access);

        component_access.extend(other.__component_access);

        const joined_component_access = this.__component_access.clone();
        joined_component_access.extend(other.__component_access);

        debug_assert(
            component_access.is_subset(joined_component_access),
            `Joined state for [${NewD.constructor.name}, ${NewF.constructor.name}] attempts to access terms that are not allowed by state [${this.D.constructor.name}, ${this.F.constructor.name}] joined with [${other.D.constructor.name}, ${other.F.constructor.name}]`
        );

        if (this.__archetype_generation !== other.__archetype_generation) {
            console.warn('You have tried to join queries with different archetype generations. This could lead to unpredictable results.')
        }

        const is_dense = this.is_dense && other.is_dense;

        const matched_tables = this.__matched_tables.clone()
        const matched_archetypes = this.__matched_archetypes.clone()

        matched_tables.intersect_with(other.__matched_tables);
        matched_archetypes.intersect_with(other.__matched_archetypes);

        const matched_storage_ids: StorageId[] = is_dense ?
            matched_tables
                .ones()
                .map(id => ({ table_id: id }))
                .collect() :
            matched_archetypes
                .ones()
                .map(id => ({ archetype_id: id }))
                .collect();

        return new QueryState(
            NewD,
            NewF,
            this.#world_id,
            this.__archetype_generation,
            matched_storage_ids,
            is_dense,
            new_fetch_state,
            new_filter_state,
            joined_component_access,
            matched_tables,
            matched_archetypes
        )
    }

    get(world: World, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        // return this.query(world).get_inner(entity);
        return TODO('QueryState.get()', world, entity)
    }

    get_mut(world: World, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        return TODO('QueryState.get_mut()', world, entity)
        // return this.query_mut(world).get_inner(entity);
    }

    get_manual(world: World, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        return TODO('QueryState.get_manual', world, entity)
        // return this.query_manual(world).get_inner(entity);
    }

    get_unchecked(world: World, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        return TODO('QueryState.get_unchecked', world, entity)
        // return this.query_unchecked(world).get_inner(entity);
    }

    get_many(world: World, entities: Entity[]): Result<QueryItem<D>[], QueryEntityError> {
        return TODO('QueryState.get_many()', world, entities)
        // return this.query(world).get_many_inner(entities);
    }

    get_many_mut(world: World, entities: Entity[]): Result<QueryItem<D>[], QueryEntityError> {
        return TODO('QueryState.get_many_mut()', world, entities);
        // return this.query_mut(world).get_many_inner(entities);
    }

    iter(world: World): QueryIter<QueryItem<D>, F> {
        this.validate_world(world.id);
        return this.iter_unchecked(world);
        // return this.query(world).iter();
    }

    iter_mut(world: World) {
        return TODO('QueryState.iter_mut()', world);
        // return this.query_mut(world).iter_mut();
    }

    iter_manual(world: World) {
        return TODO('QueryState.iter_manual()', world);
        // return this.query_manual(world).iter_manual();
    }

    iter_unchecked(world: World): QueryIter<QueryItem<D>, F> {
        this.update_archetypes(world);
        return this.iter_unchecked_manual(world, world.lastChangeTick, world.changeTick);
    }

    iter_unchecked_manual(world: World, last_run: Tick, this_run: Tick): QueryIter<QueryItem<D>, F> {
        return new QueryIter(world, this as any, last_run, this_run);
    }

    iter_combinations<K extends number>(world: World, size: K): QueryCombinationIter<readonly any[], readonly any[], K> {
        // return this.query(world).iter_combinations_inner(size);
        return TODO('QueryState.iter_combinations', size, world);
    }

    iter_combinations_mut<K extends number>(world: World, size: K): QueryCombinationIter<readonly any[], readonly any[], K> {
        // return this.query_mut(world).iter_combinations_inner(size);
        return TODO('QueryState.iter_combinations_mut', size, world);
    }

    iter_many(world: World, entities: Iterable<Entity>): any {
        // return this.query(world).iter_many_inner(entities);
        return TODO('QueryState.iter_many', world, entities);
    }

    iter_many_manual(world: World, entities: Iterable<Entity>): any {
        // return this.query_manual(world).iter_many_inner(entities);
        return TODO('QueryState.iter_many_manual', world, entities);
    }

    iter_many_mut(world: World, entities: Iterable<Entity>): any {
        // return this.query_mut(world).iter_many_inner(entities);
        return TODO('QueryState.iter_many_mut', world, entities);
    }

    iter_many_unique(world: World, entities: Set<Entity>): any {
        // return this.query(world).iter_many_unique_inner(entities);
        return TODO('QueryState.iter_many_unique', world, entities);
    }

    iter_many_unique_manual(world: World, entities: Set<Entity>): any {
        // return this.query_manual(world).iter_many_unique_inner(entities);
        return TODO('QueryState.iter_many_unique_manual', world, entities);
    }

    iter_many_unique_mut(world: World, entities: Set<Entity>): any {
        return TODO('QueryState.iter_many_unique_mut', world, entities);
        // return this.query_mut(world).iter_many_unique_inner(entities);
    }

    iter_combinations_unchecked<K extends number>(world: World, size: K) {
        return TODO('QueryState.iter_combinations_unchecked()', world, size);

        // return this.query_unchecked(world).iter_combinations_inner(size);
    }

    single(world: World) {
        return TODO('QueryState.single()', world);

        // return this.query(world).single_inner();
    }

    single_mut(world: World) {
        return TODO('QueryState.single_mut()', world);

        // return this.query_mut(world).single_inner();
    }

    get_single(world: World) {
        return TODO('QueryState.get_single()', world);
        // return this.query(world).get_single_inner();
    }

    get_single_mut(world: World) {
        return TODO('QueryState.get_single_mut()', world);
        // return this.query_mut(world).get_single_inner();
    }

    get_single_unchecked(world: World) {
        return TODO('QueryState.get_single_unchecked()', world);
        // return this.query_unchecked(world).get_single_inner();
    }

    get_single_unchecked_manual(world: World, last_run: Tick, this_run: Tick) {
        return TODO('QueryState.get_single_unchecked_manual()', world, last_run, this_run);
        // return this.query_unchecked_manual_with_ticks(world, last_run, this_run).get_single_inner();
    }

    #new_archetype_internal(archetype: Archetype) {
        if (
            this.D.matches_component_set(this.__fetch_state, id => archetype.has(id)) &&
            this.F.matches_component_set(this.__filter_state, id => archetype.has(id)) &&
            this.matches_component_set(id => archetype.has(id))
        ) {
            const archetype_index = archetype.id;
            if (!this.__matched_archetypes.contains(archetype_index)) {

                this.__matched_archetypes.grow_insert(archetype_index);
                if (!this.is_dense) {
                    this.__matched_storage_ids.push({
                        archetype_id: archetype.id
                    })
                }
            }
            const table_index = archetype.tableId;
            if (!this.__matched_tables.contains(table_index)) {
                this.__matched_tables.grow_insert(table_index)
                if (this.is_dense) {
                    this.__matched_storage_ids.push({
                        table_id: table_index
                    })
                }
            }
            return true
        } else {
            return false;
        }
    }
}

export class ThinQueryState<D extends ThinQueryData, F extends ThinQueryFilter = ThinQueryFilter> {
    D: D;
    F: F;
    readonly is_dense: boolean;

    #world_id: number;

    private __archetype_generation: ArchetypeGeneration;
    private __matched_tables: FixedBitSet;
    private __matched_archetypes: FixedBitSet;
    private __component_access: FilteredAccess;
    private __matched_storage_ids: StorageId[];
    private __fetch_state: AsQueryState<D>;
    private __filter_state: AsQueryState<F>;

    private constructor(
        data: D,
        filter: F,
        world_id: number,
        archetype_generation: ArchetypeGeneration,
        matched_storaged_ids: StorageId[],
        is_dense: boolean,
        fetch_state: AsQueryState<D>,
        filter_state: AsQueryState<F>,
        component_access: FilteredAccess,
        matched_tables: FixedBitSet,
        matched_archetypes: FixedBitSet,
    ) {
        this.#world_id = world_id;
        this.__archetype_generation = archetype_generation;
        this.D = data;
        this.F = filter;
        this.__matched_storage_ids = matched_storaged_ids;
        this.is_dense = is_dense;
        this.__fetch_state = fetch_state;
        this.__filter_state = filter_state;
        this.__component_access = component_access;
        this.__matched_tables = matched_tables;
        this.__matched_archetypes = matched_archetypes;
    }

    static new<D extends ThinQueryData, F extends ThinQueryFilter>(world: ThinWorld, data: readonly any[], filter: readonly any[]) {
        const D = new QueryDataTuple(data) as unknown as D;
        const F = All(...filter) as unknown as F;

        const state = ThinQueryState.newUninitialized(world, D, F)
        state.update_archetypes(world);
        return state;
    }

    static newWithAccess<D extends ThinQueryData, F extends ThinQueryFilter>(world: ThinWorld, access: Access, data: D, filter: F) {
        const state = ThinQueryState.newUninitialized(world, data, filter);
        for (const archetype of world.archetypes.iter()) {
            state.#new_archetype_internal(archetype);
            state.update_archetype_component_access(archetype, access);

            if (state.#new_archetype_internal(archetype)) {
                state.update_archetype_component_access(archetype, access);
            }
        }

        state.__archetype_generation = world.archetypes.generation;

        if (state.__component_access.access().has_read_all_resources()) {
            access.read_all_resources();
        } else {
            for (const component_id of state.__component_access.access().resource_reads()) {
                access.add_resource_read(world.__initializeResourceInternal(component_id).id)
            }
        }

        debug_assert(!state.__component_access.access().has_any_resource_write(), 'Mutable resource access in queries not allowed')

        return state;
    }

    static newUninitialized<D extends ThinQueryData, F extends ThinQueryFilter>(world: ThinWorld, D: D, F: F) {
        const fetch_state = D.init_state(world);
        const filter_state = F.init_state(world);

        return ThinQueryState.fromStatesUninitialized(world.id, D, F, fetch_state, filter_state);
    }

    static fromStatesUninitialized<D extends ThinQueryData, F extends ThinQueryFilter>(world_id: number, D: D, F: F, fetch_state: any, filter_state: any): ThinQueryState<D, F> {
        const component_access = new FilteredAccess();
        D.update_component_access(fetch_state, component_access);

        const filter_component_access = new FilteredAccess();
        F.update_component_access(filter_state, filter_component_access);

        component_access.extend(filter_component_access);

        const is_dense = D.IS_DENSE && F.IS_DENSE;

        return new ThinQueryState(
            D,
            F,
            world_id,
            ArchetypeGeneration.initial(),
            [],
            is_dense,
            fetch_state,
            filter_state,
            component_access,
            FixedBitSet.default(),
            FixedBitSet.default()
        )
    }

    clone(): ThinQueryState<D, F> {
        throw new Error('ThinQueryState.clone()')
        // return new ThinQueryState(
        //     this.D,
        //     this.F,
        //     this.#world_id,
        //     this.__archetype_generation,
        //     structuredClone(this.__matched_storage_ids),
        //     this.is_dense,
        //     // this.D.__state,
        //     // this.F.__state,
        //     this.__component_access.clone(),
        //     this.__matched_tables.clone(),
        //     this.__matched_archetypes.clone()
        // )
    }


    // TODO - remove any mutable querydata
    // as_readonly() {
    //     // return this.as_transmuted_state(D.Readonly, F)
    // }

    // TODO - convert to NoopQuery
    // as_nop() {
    //     // return this.as_transmuted_state(NoopWorldQuery, F)
    // }

    // TODO - implement
    // as_transmuted_state(NewD: QueryData<AsQueryState<D>, NewF: AsQueryState<F>>) {}


    new_archetype(archetype: Archetype, access: Access) {
        const matches = this.#new_archetype_internal(archetype);
        if (matches) {
            this.update_archetype_component_access(archetype, access);
        }
    }

    update_archetypes(world: World) {
        this.validate_world(world.id);
        const archetypes = world.archetypes;

        if (this.__component_access.__required.is_empty()) {
            const old_generation = this.__archetype_generation;
            this.__archetype_generation = archetypes.generation;

            for (const archetype of archetypes.iterRange(old_generation)) {
                this.#new_archetype_internal(archetype);
            }
        } else {
            if (this.__archetype_generation === archetypes.generation) {
                return
            }
            const potential_archetypes = this.__component_access.__required.ones().filter_map(idx => {
                const keys = archetypes.componentIndex().get(idx)?.keys();
                if (!keys) {
                    return
                }
                return Array.from(keys);

            }).min_by_key('length');

            if (potential_archetypes) {
                for (let i = 0; i < potential_archetypes.length; i++) {
                    const archetype_id = potential_archetypes[i];
                    if (archetype_id < this.__archetype_generation) {
                        continue
                    }
                    const archetype = archetypes.get(archetype_id)!;
                    this.#new_archetype_internal(archetype);
                }
            }
            this.__archetype_generation = archetypes.generation;
        }
    }

    update_archetype_component_access(archetype: Archetype, access: Access) {
        const [component_reads_and_writes, comonent_reads_and_writes_inverted] = this.__component_access.access().component_reads_and_writes();
        const [component_writes, component_writes_inverted] = this.__component_access.access().component_writes();
        if (!comonent_reads_and_writes_inverted && !component_writes_inverted) {
            component_reads_and_writes.for_each(id => {
                id = archetype.getArchetypeComponentId(id)!
                if (is_some(id)) {
                    access.add_component_read(id);
                }
            })

            component_writes.for_each(id => {
                id = archetype.getArchetypeComponentId(id)!
                if (is_some(id)) {
                    access.add_component_write(id);
                }
            })

            return;
        }

        for (const [component_id, archetype_component_id] of archetype.__componentsWithArchetypeComponentId()) {
            if (this.__component_access.access().has_component_read(component_id)) {
                access.add_component_read(archetype_component_id);
            }

            if (this.__component_access.access().has_component_write(component_id)) {
                access.add_component_write(archetype_component_id);
            }
        }
    }

    validate_world(world_id: number) {
        if (this.#world_id !== world_id) {
            throw new Error('Encountered a mismatched World. This QueryState was created from ' + this.#world_id)
        }
    }

    matched_tables() {
        return this.__matched_tables.ones();
    }

    matched_archetypes() {
        return this.__matched_archetypes.ones();
    }

    matches_component_set(set_contains_id: (id: number) => boolean) {
        return this.__component_access.__filter_sets.length === 0 || this.__component_access.__filter_sets.some(set => (set
            .with
            .ones()
            .all(index => set_contains_id(index))
            && set
                .without
                .ones()
                .all(index => !set_contains_id(index))
        ))
    }

    is_empty(world: World, last_run: Tick, this_run: Tick) {
        this.validate_world(world.id);
        return TODO('QueryState.is_empty()', last_run, this_run);
        // return this.query_unchecked_manual_with_ticks(world, last_run, this_run).is_empty();
    }

    contains(world: World, entity: Entity, last_run: Tick, this_run: Tick): boolean {
        this.validate_world(world.id);

        return TODO('QueryState.contains()', entity, last_run, this_run);
        // return this.query_unchecked_manual_with_ticks(world, last_run, this_run).contains(entity);
    }

    /**
     * Use this method to transform a `QueryState` into a more generic `QueryState`.
     * This can be useful for passing to another function that might take the more general form.
     * See `Query.transmute_lens()` for more details.
     * 
     * You should not call `QueryState.update_archetypes()` on the returned `QueryState` as the result will be unpredictable.
     * You might end of with a mix of archetypes that only matched the original query + archetypes that only match
     * the new `QueryState`. Most of the safe methods on `QueryState` call `QueryState.update_archetypes()` internally, so this is best used through a `Query`.
     */
    transmute<NewD extends ThinQueryData>(world: ThinWorld, new_data: readonly any[]): ThinQueryState<NewD> {
        return this.transmute_filtered(world, new_data, []);
    }

    transmute_filtered<NewD extends ThinQueryData, NewF extends ThinQueryFilter>(world: ThinWorld, new_data: readonly any[], new_filter: readonly any[]): ThinQueryState<NewD, NewF> {
        this.validate_world(world.id);

        // @ts-expect-error
        const [NewD, NewF] = from_tuples<NewD, NewF>(new_data, new_filter)

        const component_access = new FilteredAccess();
        const fetch_state = NewD.get_state(world.components);
        if (fetch_state == null) {
            throw new Error('Could not create fetch_state, Please initialize all referenced components before transmuting');
        }
        const filter_state = NewF.get_state(world.components);
        if (filter_state == null) {
            throw new Error('Could not create fetch_state, Please initialize all referenced components before transmuting');
        }

        NewD.set_access(fetch_state, this.__component_access);
        NewD.update_component_access(fetch_state, component_access);

        const filter_component_access = new FilteredAccess();
        NewF.update_component_access(filter_state, filter_component_access);

        component_access.extend(filter_component_access);
        debug_assert(component_access.is_subset(this.__component_access), `Transmuted state for [${new_data.constructor.name}, ${new_filter.constructor.name}] attempts to access terms that are not allowed by the original state [${this.D.constructor.name}, ${this.F.constructor.name}]`)

        return TODO('ThinQueryState.transmute_filtered')

        // return new ThinQueryState<NewD, NewF>(
        //     NewD,
        //     NewF,
        //     this.#world_id,
        //     this.__archetype_generation,
        //     structuredClone(this.__matched_storage_ids),
        //     this.is_dense,
        //     fetch_state,
        //     filter_state,
        //     this.__component_access.clone(),
        //     this.__matched_tables.clone(),
        //     this.__matched_archetypes.clone()
        // )
    }

    /**
     * Use this to combine two queries. The data accessed wil be the intersection
     * of archetypes included in both queries. This can be useful for accessing a
     * subset of the entities between two queries.
     * 
     * You should not call `QueryState.update_archetypes()` on the returned `QueryState`, as the result
     * could be unpredictable. You might end up with a mix of archetypes that only matched
     * the original query + archetypes that only match the new `QueryState`. Most of the
     * safe methods on `QueryState` call `QueryState.update_archetypes()` internally, so
     * this is best used through a `Query`.
     * 
     * Performance
     * 
     * This will have similar performance as constructing a new `QueryState`, since much of the internal state
     * will need to be reconstructed. But it will be a little faster as it only needs to compare the intersection
     * of matching archetypes rather than iterating over all archetypes.
     * 
    * @throws Will throw an error if `NewD` contains accesses not in `Q` or `OtherQ`
     */
    join<OtherD extends ThinQueryData, NewD extends ThinQueryData>(
        world: ThinWorld,
        NewD: NewD,
        other: ThinQueryState<OtherD, ThinQueryFilter>
    ): ThinQueryState<NewD> {
        return this.join_filtered(world, NewD, All() as any, other);
    }

    /**
     * Use this to combine two queries. The data accessed will be the intersection
     * of archetypes included in both queries
     * 
     * @throws will throw if `NewD` or `newF` requires accesses not in `Q` or `OtherQ`
     */
    join_filtered<OtherD extends ThinQueryData, OtherF extends ThinQueryFilter, NewD extends ThinQueryData, NewF extends ThinQueryFilter>(
        world: ThinWorld,
        NewD: NewD,
        NewF: NewF,
        other: ThinQueryState<OtherD, OtherF>
    ): ThinQueryState<NewD, NewF> {
        this.validate_world(world.id);

        const component_access = new FilteredAccess();

        const new_fetch_state = NewD.get_state(world.components);
        if (new_fetch_state == null) {
            throw new Error('could not creat fetch_state. Please initialize all referenced components before joining')
        }

        const new_filter_state = NewF.get_state(world.components);
        if (new_filter_state == null) {
            throw new Error('could not creat filter_state. Please initialize all referenced components before joining')
        }

        NewD.set_access(new_fetch_state, this.__component_access);
        NewD.update_component_access(new_fetch_state, component_access);

        const new_filter_component_access = new FilteredAccess();
        NewF.update_component_access(new_filter_state, new_filter_component_access);

        component_access.extend(other.__component_access);

        const joined_component_access = this.__component_access.clone();
        joined_component_access.extend(other.__component_access);

        debug_assert(
            component_access.is_subset(joined_component_access),
            `Joined state for [${NewD.constructor.name}, ${NewF.constructor.name}] attempts to access terms that are not allowed by state [${this.D.constructor.name}, ${this.F.constructor.name}] joined with [${other.D.constructor.name}, ${other.F.constructor.name}]`
        );

        if (this.__archetype_generation !== other.__archetype_generation) {
            console.warn('You have tried to join queries with different archetype generations. This could lead to unpredictable results.')
        }

        // const is_dense = this.is_dense && other.is_dense;

        const matched_tables = this.__matched_tables.clone()
        const matched_archetypes = this.__matched_archetypes.clone()

        matched_tables.intersect_with(other.__matched_tables);
        matched_archetypes.intersect_with(other.__matched_archetypes);

        // const matched_storage_ids: StorageId[] = is_dense ?
        //     matched_tables
        //         .ones()
        //         .map(id => ({ table_id: id }))
        //         .collect() :
        //     matched_archetypes
        //         .ones()
        //         .map(id => ({ archetype_id: id }))
        //         .collect();

        return TODO('ThinQueryState.join_filtered');
        // return new ThinQueryState<NewD, NewF>(
        //     NewD,
        //     NewF,
        //     this.#world_id,
        //     this.__archetype_generation,
        //     matched_storage_ids,
        //     is_dense,
        //     new_fetch_state,
        //     new_filter_state,
        //     joined_component_access,
        //     matched_tables,
        //     matched_archetypes
        // )
    }

    get(world: ThinWorld, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        // return this.query(world).get_inner(entity);
        return TODO('QueryState.get()', world, entity)
    }

    get_mut(world: ThinWorld, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        return TODO('QueryState.get_mut()', world, entity)
        // return this.query_mut(world).get_inner(entity);
    }

    get_manual(world: ThinWorld, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        return TODO('QueryState.get_manual', world, entity)
        // return this.query_manual(world).get_inner(entity);
    }

    get_unchecked(world: ThinWorld, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        return TODO('QueryState.get_unchecked', world, entity)
        // return this.query_unchecked(world).get_inner(entity);
    }

    get_many(world: ThinWorld, entities: Entity[]): Result<QueryItem<D>[], QueryEntityError> {
        return TODO('QueryState.get_many()', world, entities)
        // return this.query(world).get_many_inner(entities);
    }

    get_many_mut(world: ThinWorld, entities: Entity[]): Result<QueryItem<D>[], QueryEntityError> {
        return TODO('QueryState.get_many_mut()', world, entities);
        // return this.query_mut(world).get_many_inner(entities);
    }

    // iter(world: ThinWorld) {
    //     this.validate_world(world.id);
    //     return this.iter_unchecked(world);
    //     // return this.query(world).iter();
    // }

    iter(world: ThinWorld) {
        this.validate_world(world.id);
        return this.iter_unchecked(world);
    }

    iter_unchecked(world: ThinWorld) {
        this.update_archetypes(world);
        return this.iter_unchecked_manual(world, world.lastChangeTick, world.changeTick);
    }

    iter_unchecked_manual(world: ThinWorld, last_run: Tick, this_run: Tick): ThinQueryIter<any[], any[]> {
        return new ThinQueryIter(world, this, last_run, this_run);
    }

    iter_mut(world: ThinWorld) {
        return TODO('QueryState.iter_mut()', world);
        // return this.query_mut(world).iter_mut();
    }

    iter_manual(world: ThinWorld) {
        return TODO('QueryState.iter_manual', world);
        // return this.query_manual(world).iter_manual();
    }

    iter_combinations<K extends number>(world: World, size: K): QueryCombinationIter<readonly any[], readonly any[], K> {
        // return this.query(world).iter_combinations_inner(size);
        return TODO('QueryState.iter_combinations', size, world);
    }

    iter_combinations_mut<K extends number>(world: World, size: K): QueryCombinationIter<readonly any[], readonly any[], K> {
        // return this.query_mut(world).iter_combinations_inner(size);
        return TODO('QueryState.iter_combinations_mut', size, world);

    }

    iter_many(world: World, entities: Iterable<Entity>): any {
        // return this.query(world).iter_many_inner(entities);
        return TODO('QueryState.iter_many', world, entities);
    }

    iter_many_manual(world: World, entities: Iterable<Entity>): any {
        // return this.query_manual(world).iter_many_inner(entities);
        return TODO('QueryState.iter_many_manual', world, entities);

    }

    iter_many_mut(world: World, entities: Iterable<Entity>): any {
        // return this.query_mut(world).iter_many_inner(entities);
        return TODO('QueryState.iter_many_mut', world, entities);
    }

    iter_many_unique(world: World, entities: Set<Entity>): any {
        // return this.query(world).iter_many_unique_inner(entities);
        return TODO('QueryState.iter_many_unique', world, entities);
    }

    iter_many_unique_manual(world: World, entities: Set<Entity>): any {
        // return this.query_manual(world).iter_many_unique_inner(entities);
        return TODO('QueryState.iter_many_unique_manual', world, entities);

    }

    iter_many_unique_mut(world: World, entities: Set<Entity>): any {
        return TODO('QueryState.iter_many_unique_mut', world, entities);
        // return this.query_mut(world).iter_many_unique_inner(entities);
    }

    // iter_combinations_unchecked<K extends number>(world: World, size: K) {
    //     // return this.query_unchecked(world).iter_combinations_inner(size);
    // }

    // single(world: World) {

    //     // return this.query(world).single_inner();
    // }

    // single_mut(world: World) {
    //     // return this.query_mut(world).single_inner();
    // }

    // get_single(world: World) {
    //     // return this.query(world).get_single_inner();
    // }

    // get_single_mut(world: World) {
    //     // return this.query_mut(world).get_single_inner();
    // }

    // get_single_unchecked(world: World) {
    //     // return this.query_unchecked(world).get_single_inner();
    // }

    // get_single_unchecked_manual(world: World, last_run: Tick, this_run: Tick) {
    //     // return this.query_unchecked_manual_with_ticks(world, last_run, this_run).get_single_inner();
    // }

    #new_archetype_internal(archetype: Archetype) {
        if (
            this.D.matches_component_set(this.__fetch_state, id => archetype.has(id)) &&
            this.F.matches_component_set(this.__filter_state, id => archetype.has(id)) &&
            this.matches_component_set(id => archetype.has(id))
        ) {
            const archetype_index = archetype.id;
            if (!this.__matched_archetypes.contains(archetype_index)) {

                this.__matched_archetypes.grow_insert(archetype_index);
                if (!this.is_dense) {
                    this.__matched_storage_ids.push({
                        archetype_id: archetype.id
                    })
                }
            }
            const table_index = archetype.tableId;
            if (!this.__matched_tables.contains(table_index)) {
                this.__matched_tables.grow_insert(table_index)
                if (this.is_dense) {
                    this.__matched_storage_ids.push({
                        table_id: archetype.tableId
                    })
                }
            }
            return true
        } else {
            return false;
        }
    }
}