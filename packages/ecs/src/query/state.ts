import { FixedBitSet } from "fixed-bit-set";
import { Archetype, ArchetypeGeneration, ArchetypeId, QueryData, QueryFilter, QueryIter, World, QueryDataTuple, All, Tick, Query, Entity, QueryEntityError, EntitySet, QueryCombinationIter } from "ecs";
import { TableId } from "../storage/table";
import { Access, FilteredAccess } from "./access";
import { is_some, Result } from "joshkaposh-option";
import { debug_assert } from "../util";
import { TODO } from "joshkaposh-iterator/src/util";

export type StorageIdTable = {
    table_id: TableId;
}
export type StorageIdArchetype = {
    archetype_id: ArchetypeId;
}
export type StorageId = StorageIdTable | StorageIdArchetype

export function from_tuples<D extends QueryData, F extends QueryFilter>(fetch: readonly any[], filter: readonly any[]): [D, F] {
    return [QueryDataTuple.from_data(fetch) as unknown as D, All(...filter) as unknown as F]
}

export class QueryState<D extends QueryData, F extends QueryFilter = QueryFilter> {
    #world_id: number;
    private __archetype_generation: ArchetypeGeneration;
    private __matched_tables: FixedBitSet;
    private __matched_archetypes: FixedBitSet;
    private __component_access: FilteredAccess;
    private __matched_storage_ids: StorageId[];
    private __fetch_state: QueryData['__state'];
    private __filter_state: QueryFilter['__state'];

    readonly is_dense: boolean;
    D: D;
    F: F;

    private constructor(
        data: D,
        filter: F,
        world_id: number,
        archetype_generation: ArchetypeGeneration,
        matched_storaged_ids: StorageId[],
        is_dense: boolean,
        fetch_state: QueryData['__state'],
        filter_state: QueryFilter['__state'],
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

    static new<D extends QueryData, F extends QueryFilter>(data: readonly any[], filter: readonly any[], world: World): QueryState<D, F> {
        const [D, F] = from_tuples(data, filter)
        const state = QueryState.new_uninitialized<D, F>(D as any, F as any, world)
        state.update_archetypes(world);
        return state;
    }

    static new_with_access<D extends QueryData, F extends QueryFilter>(data: D, filter: F, world: World, access: Access): QueryState<D, F> {
        const state = QueryState.new_uninitialized<D, F>(data, filter, world);
        for (const archetype of world.archetypes().iter()) {
            state.#new_archetype_internal(archetype);
            state.update_archetype_component_access(archetype, access);

            if (state.#new_archetype_internal(archetype)) {
                state.update_archetype_component_access(archetype, access);
            }
        }

        state.__archetype_generation = world.archetypes().generation();

        if (state.__component_access.access().has_read_all_resources()) {
            access.read_all_resources();
        } else {
            for (const component_id of state.__component_access.access().resource_reads()) {
                access.add_resource_read(world.__initialize_resource_internal(component_id).id())
            }
        }

        debug_assert(!state.__component_access.access().has_any_resource_write(), 'Mutable resource access in queries not allowed')

        return state;

    }

    static new_uninitialized<D extends QueryData, F extends QueryFilter>(D: D, F: F, world: World): QueryState<D, F> {
        const fetch_state = D.init_state(world);
        const filter_state = F.init_state(world);

        return QueryState.from_states_ununitialized<D, F>(D, F, world.id(), fetch_state, filter_state);
    }

    static from_states_ununitialized<D extends QueryData, F extends QueryFilter>(D: D, F: F, world_id: number, fetch_state: any, filter_state: any): QueryState<D, F> {
        const component_access = new FilteredAccess();
        D.update_component_access(fetch_state, component_access)

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
        return new QueryState(
            this.D,
            this.F,
            this.#world_id,
            this.__archetype_generation,
            structuredClone(this.__matched_storage_ids),
            this.is_dense,
            this.D.__state,
            this.F.__state,
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
    // as_transmuted_state(NewD: QueryData<D['__state'], NewF: F['__state']>) {}


    new_archetype(archetype: Archetype, access: Access) {
        const matches = this.#new_archetype_internal(archetype);
        if (matches) {
            this.update_archetype_component_access(archetype, access);
        }
    }

    update_archetypes(world: World) {
        this.validate_world(world.id());
        const archetypes = world.archetypes();

        if (this.__component_access.__required.is_empty()) {
            const old_generation = this.__archetype_generation;
            this.__archetype_generation = archetypes.generation();

            for (const archetype of archetypes.iter_range(old_generation)) {
                this.#new_archetype_internal(archetype);
            }
        } else {
            if (this.__archetype_generation === archetypes.generation()) {
                return
            }
            const potential_archetypes = this.__component_access.__required.ones().filter_map(idx => {
                const keys = archetypes.component_index().get(idx as any)?.keys();
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
            this.__archetype_generation = archetypes.generation();
        }
    }

    update_archetype_component_access(archetype: Archetype, access: Access) {
        const [component_reads_and_writes, comonent_reads_and_writes_inverted] = this.__component_access.access().component_reads_and_writes();
        const [component_writes, component_writes_inverted] = this.__component_access.access().component_writes();
        if (!comonent_reads_and_writes_inverted && !component_writes_inverted) {
            component_reads_and_writes.for_each(id => {
                id = archetype.get_archetype_component_id(id)!
                if (is_some(id)) {
                    access.add_component_read(id);
                }
            })

            component_writes.for_each(id => {
                id = archetype.get_archetype_component_id(id)!
                if (is_some(id)) {
                    access.add_component_write(id);
                }
            })

            return;
        }

        for (const [component_id, archetype_component_id] of archetype.__components_with_archetype_component_id()) {
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

    query(world: World) {
        this.update_archetypes(world);
        return this.query_manual(world);
    }


    query_manual(world: World) {
        this.validate_world(world.id());

        // return this.as_readonly().query_unchecked_manual()
        return this.query_unchecked_manual(world);
    }

    query_mut(world: World) {
        const last_run = world.last_change_tick();
        const this_run = world.change_tick();
        return this.query_unchecked_with_ticks(world, last_run, this_run);
    }

    query_unchecked(world: World) {
        this.update_archetypes(world);
        return this.query_unchecked_manual(world);
    }

    query_unchecked_manual(world: World) {
        const last_run = world.last_change_tick();
        const this_run = world.change_tick();

        return this.query_unchecked_manual_with_ticks(world, last_run, this_run);
    }

    query_unchecked_with_ticks(world: World, last_run: Tick, this_run: Tick) {
        this.update_archetypes(world);
        return this.query_unchecked_manual_with_ticks(world, last_run, this_run);
    }

    query_unchecked_manual_with_ticks<QueryD extends readonly any[], QueryF extends readonly any[]>(world: World, last_run: Tick, this_run: Tick) {
        return new Query<QueryD, QueryF>(world, this as any, last_run, this_run);
    }

    is_empty(world: World, last_run: Tick, this_run: Tick) {
        this.validate_world(world.id());
        return this.query_unchecked_manual_with_ticks(world, last_run, this_run).is_empty();
    }

    contains(entity: Entity, world: World, last_run: Tick, this_run: Tick) {
        this.validate_world(world.id());

        return this.query_unchecked_manual_with_ticks(world, last_run, this_run).contains(entity);
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
        this.validate_world(world.id());

        const [NewD, NewF] = from_tuples<NewD, NewF>(new_data, new_filter)

        const component_access = new FilteredAccess();
        const fetch_state = NewD.get_state(world.components());
        if (fetch_state == null) {
            throw new Error('Could not create fetch_state, Please initialize all referenced components before transmuting');
        }
        const filter_state = NewF.get_state(world.components());
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
        this.validate_world(world.id());

        const component_access = new FilteredAccess();

        const new_fetch_state = NewD.get_state(world.components());
        if (new_fetch_state == null) {
            throw new Error('could not creat fetch_state. Please initialize all referenced components before joining')
        }

        const new_filter_state = NewF.get_state(world.components());
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

    get(world: World, entity: Entity): Result<D['__item'], QueryEntityError> {
        return this.query(world).get_inner(entity);
    }

    get_mut(world: World, entity: Entity): Result<D['__item'], QueryEntityError> {
        return this.query_mut(world).get_inner(entity);
    }


    get_many(world: World, entities: Entity[]): Result<D['__item'][], QueryEntityError> {
        return this.query(world).get_many_inner(entities);
    }

    get_many_mut(world: World, entities: Entity[]): Result<D['__item'][], QueryEntityError> {
        return this.query_mut(world).get_many_inner(entities);
    }

    get_manual(world: World, entity: Entity): Result<D['__item'], QueryEntityError> {
        return this.query_manual(world).get_inner(entity);
    }

    get_unchecked(world: World, entity: Entity): Result<D['__item'], QueryEntityError> {
        return this.query_unchecked(world).get_inner(entity);
    }

    iter(world: World, last_run: Tick, this_run: Tick) {
        // return this.query(world).into_iter();
        this.update_archetypes(world);
        return this.iter_unchecked_manual(world, last_run, this_run);
    }

    iter_mut(world: World) {
        return TODO('QueryState.iter_mut()', world)
        // return this.query_mut(world).iter_mut();
    }

    iter_manual(world: World) {
        return TODO('QueryState.iter_manual()', world)
        // return this.query_manual(world).iter_manual();
    }

    iter_combinations<K extends number>(size: K, world: World): QueryCombinationIter<any[], any[], K> {
        return this.query(world).iter_combinations_inner(size);
    }

    iter_combinations_mut<K extends number>(size: K, world: World): QueryCombinationIter<any[], any[], K> {
        return this.query_mut(world).iter_combinations_inner(size);
    }

    iter_many(world: World, entities: Iterable<Entity>) {
        return this.query(world).iter_many_inner(entities);
    }

    iter_many_manual(world: World, entities: Iterable<Entity>) {
        return this.query_manual(world).iter_many_inner(entities);
    }

    iter_many_mut(world: World, entities: Iterable<Entity>) {
        return this.query_mut(world).iter_many_inner(entities);
    }

    iter_many_unique(world: World, entities: EntitySet) {
        return this.query(world).iter_many_unique_inner(entities);
    }

    iter_many_unique_manual(world: World, entities: EntitySet) {
        return this.query_manual(world).iter_many_unique_inner(entities);
    }


    iter_many_unique_mut(world: World, entities: EntitySet) {
        return this.query_mut(world).iter_many_unique_inner(entities);
    }

    iter_unchecked(world: World) {
        return TODO('QueryState.iter_unchecked()', world);
        // return this.query_unchecked(world).iter_unchecked();
    }

    iter_combinations_unchecked<K extends number>(world: World, size: K) {
        return this.query_unchecked(world).iter_combinations_inner(size);
    }


    iter_unchecked_manual(world: World, last_run: Tick, this_run: Tick): QueryIter<any[], any[]> {
        return new QueryIter(world, this, last_run, this_run);
    }

    single(world: World) {
        return this.query(world).single_inner();
    }

    single_mut(world: World) {
        return this.query_mut(world).single_inner();
    }

    get_single(world: World) {
        return this.query(world).get_single_inner();
    }

    get_single_mut(world: World) {
        return this.query_mut(world).get_single_inner();
    }

    get_single_unchecked(world: World) {
        return this.query_unchecked(world).get_single_inner();
    }

    get_single_unchecked_manual(world: World, last_run: Tick, this_run: Tick) {
        return this.query_unchecked_manual_with_ticks(world, last_run, this_run).get_single_inner();
    }

    #new_archetype_internal(archetype: Archetype) {
        if (
            this.D.matches_component_set(this.__fetch_state, id => archetype.contains(id)) &&
            this.F.matches_component_set(this.__filter_state, id => archetype.contains(id)) &&
            this.matches_component_set(id => archetype.contains(id))
        ) {
            const archetype_index = archetype.id()
            if (!this.__matched_archetypes.contains(archetype_index)) {

                this.__matched_archetypes.grow_insert(archetype_index);
                if (!this.is_dense) {
                    this.__matched_storage_ids.push({
                        archetype_id: archetype.id()
                    })
                }
            }
            const table_index = archetype.table_id();
            if (!this.__matched_tables.contains(table_index)) {
                this.__matched_tables.grow_insert(table_index)
                if (this.is_dense) {
                    this.__matched_storage_ids.push({
                        table_id: archetype.table_id()
                    })
                }
            }
            return true
        } else {
            return false;
        }
    }
}