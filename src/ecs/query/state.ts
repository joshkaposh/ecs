import { ErrorExt, Option, Result, is_error, is_none, is_some } from "joshkaposh-option";
import { UNIT, Unit } from "../../util";
import { Archetype, ArchetypeGeneration, ArchetypeId } from "../archetype";
import { ComponentId } from "../component";
import { Entity } from "../entity";
import { Table, TableId } from "../storage/table";
import { World, WorldId } from "../world";
import { FilteredAccess } from "./access";
import { EntityList } from "./query";
import { WorldQuery } from "./world-query";
import { QueryCombinationIter, QueryIter, QueryManyIter } from "./iter";
import { assert } from "joshkaposh-iterator/src/util";
import { FixedBitSet } from "../../fixed-bit-set";
import { QueryEntityError, QuerySingleError } from "./error";
import { QueryData, QueryItem, ROQueryItem } from "./fetch";
import { QueryFilter } from "./filter";
import { QueryBuilder } from "./builder";

export class QueryState<D extends QueryData<{}>, F extends QueryFilter<{}>> {
    #world_id!: WorldId;
    __archetype_generation!: ArchetypeGeneration;
    __matched_tables!: FixedBitSet;
    __matched_archetypes!: FixedBitSet;
    __archetype_component_access!: any //Access<ArchetypeComponentId>;
    __component_access!: any //FilteredAccess<ComponentId>;
    __matched_table_ids!: TableId[];
    __matched_archetype_ids!: ArchetypeId[];
    __fetch_state!: any//D::State,
    __filter_state!: any//F::State,
    #data!: D;
    #filter!: F;

    private constructor() { }

    static new<D extends QueryData<{}>, F extends QueryFilter<{}>>(world: World, data: D, filter: F): QueryState<D, F> {

        const fetch_state = data.init_state(world);
        const filter_state = filter.init_state(world);
        const component_access = FilteredAccess.default();
        data.update_component_access(fetch_state, component_access);
        const filter_component_access = FilteredAccess.default();
        filter.update_component_access(filter_state, filter_component_access);
        component_access.extend(filter_component_access);

        const state = new QueryState<D, F>();
        state.#data = data;
        state.#filter = filter;
        state.#world_id = world.id();
        state.__archetype_generation = ArchetypeGeneration.initial();
        state.__matched_table_ids = [];
        state.__matched_archetype_ids = [];
        state.__fetch_state = fetch_state
        state.__filter_state = filter_state;
        state.__component_access = component_access;
        state.__matched_tables = FixedBitSet.default();
        state.__matched_archetypes = FixedBitSet.default();
        state.__archetype_component_access = undefined; //Access.default<ArchetypeComponentId>()

        state.update_archetypes(world);
        return state;
    }

    static from_world<D extends QueryData<{}>, F extends QueryFilter<{}>>(world: World, data: D, filter: F): QueryState<D, F> {
        return world.query_filtered(data, filter);
    }

    static from<D extends QueryData<{}>, F extends QueryFilter<{}>>(builder: QueryBuilder<D, F>, data: D, filter: F) {
        return QueryState.from_builder(data, filter, builder)
    }

    static from_builder<D extends QueryData<{}>, F extends QueryFilter<{}>>(data: D, filter: F, builder: QueryBuilder<D, F>): QueryState<D, F> {
        const fetch_state = data.init_state(builder.world());
        const filter_state = filter.init_state(builder.world());
        data.set_access(fetch_state, builder.access());

        const state = new QueryState<D, F>();
        state.#world_id = builder.world().id();
        // state.__archetype_generation = ARCHETYPE_GENERATION.initial();
        state.__matched_table_ids = [];
        state.__matched_archetype_ids = [];
        state.__fetch_state = fetch_state;
        state.__filter_state = filter_state;
        state.__component_access = builder.access().clone();
        state.__matched_tables = FixedBitSet.default()
        state.__matched_archetypes = FixedBitSet.default()
        state.__archetype_component_access = undefined // Access.default();

        state.update_archetypes(builder.world());
        return state;
    }

    is_empty(world: World): boolean {
        this.validate_world(world.id());

        return this.__is_empty_unsafe_world_cell(world);
    }

    __is_empty_unsafe_world_cell(world: World): boolean {
        return this.as_nop().__iter_unchecked_manual(world).next().done!
    }

    update_archetypes(world: World) {
        this.update_archetypes_unsafe_world_cell(world)
    }

    update_archetypes_unsafe_world_cell(world: World) {
        this.validate_world(world.id());
        const archetypes = world.archetypes();
        const new_generation = archetypes.generation();
        const old_generation = this.__archetype_generation;
        this.__archetype_generation = new_generation;

        archetypes
            .iter()
            .skip(old_generation)
            .for_each(archetype => this.new_archetype(archetype))

    }

    validate_world(world_id: WorldId) {
        const this_id = this.#world_id;
        if (world_id !== this_id) {
            throw new Error(`Encountered a mismatched World. This QueryState was created from ${this_id}, but a method was called using ${world_id}`)
        }
    }

    new_archetype(archetype: Archetype) {
        if (this.#data.matches_component_set(this.__fetch_state, (id: ComponentId) => archetype.contains(id))
            && this.#filter.matches_component_set(this.__filter_state, (id: ComponentId) => archetype.contains(id))
        ) {
            this.update_archetype_component_access(archetype);

            const archetype_index = archetype.id();
            if (!this.__matched_archetypes.contains(archetype_index)) {
                this.__matched_archetypes.grow(archetype_index + 1);
                this.__matched_archetypes.set(archetype_index, true);
                this.__matched_archetype_ids.push(archetype_index);
            }

            const table_index = archetype.table_id();
            if (!this.__matched_tables.contains(table_index)) {
                this.__matched_tables.grow(table_index + 1);
                this.__matched_tables.set(table_index, true);
                this.__matched_table_ids.push(table_index);
            }
        }
    }

    matches_component_set(set_contains_id: (component_id: ComponentId) => boolean): boolean {
        return this.__component_access.filter_sets.iter().any((set: any) => {
            set.__with
                .ones()
                .all((index: number) => set_contains_id(index))
                &&
                set
                    .without
                    .ones()
                    .all((index: number) => !set_contains_id(index))

        })
    }

    update_archetype_component_access(archetype: Archetype) {
        this.__component_access.access.reads().for_each((id: number) => {
            const arch_comp_id = archetype.get_archetype_component_id(id);
            if (is_some(arch_comp_id)) {
                this.__archetype_component_access.add_read(id);
            }
        })

        this.__component_access.access.writes().for_each((id: number) => {
            const arch_comp_id = archetype.get_archetype_component_id(id);
            if (is_some(arch_comp_id)) {
                this.__archetype_component_access.add_write(id);
            }
        })
    }

    transmute<NewD extends QueryData<{}>>(world: World, new_data: NewD): QueryState<NewD, QueryFilter<Unit>> {
        return this.transmute_filtered(world, new_data, UNIT as any);
    }

    transmute_filtered<NewD extends QueryData<{}>, NewF extends QueryFilter<{}>>(world: World, new_data: NewD, new_filter: NewF): QueryState<NewD, NewF> {
        const component_access = FilteredAccess.default();
        const fetch_state = new_data.get_state(world);
        if (is_none(fetch_state)) {
            throw new Error("Could not create fetch_state, Please initialize all referenced components before transmuting.");
        }
        const filter_state = new_filter.get_state(world);
        if (is_none(filter_state)) {
            throw new Error("Could not create filter_state, Please initialize all referenced components before transmuting.");
        }

        new_data.set_access(fetch_state, this.__component_access);
        new_data.update_component_access(fetch_state, component_access);

        const filter_component_access = FilteredAccess.default();
        new_filter.update_component_access(filter_state, filter_component_access);

        component_access.extend(filter_component_access);

        assert(component_access.is_subset(this.__component_access))
        // assert!(component_access.is_subset(&self.component_access), "Transmuted state for {} attempts to access terms that are not allowed by original state {}.", std::any::type_name::<(NewD, NewF)>(), std::any::type_name::<(D, F)>() )

        const state = new QueryState<NewD, NewF>();

        state.#world_id = this.#world_id;
        state.__archetype_generation = this.__archetype_generation;
        state.__matched_table_ids = structuredClone(this.__matched_table_ids);
        state.__matched_archetype_ids = structuredClone(this.__matched_archetype_ids);
        state.__fetch_state = fetch_state;
        state.__filter_state = filter_state;
        state.__component_access = this.__component_access.clone();
        state.__matched_tables = this.__matched_tables.clone();
        state.__matched_archetypes = this.__matched_archetypes.clone();
        state.__archetype_component_access = this.__archetype_component_access.clone();

        return state;
    }

    /**
     * @description
     * Gets the query result for the given `World` and `Entity`.
     * 
     * This can only be called for read-only queries.
    */
    get(world: World, entity: Entity): Result<ROQueryItem<D>, QueryEntityError> {
        this.update_archetypes(world);
        return this.get_unchecked_manual(world, entity);
    }

    get_many(world: World, entities: Entity[]) {
        this.update_archetypes(world);

        return this.get_many_read_only_manual(world, entities);

    }

    get_mut(world: World, entity: Entity): Result<QueryItem<D>, QueryEntityError> {
        this.update_archetypes(world);
        return this.get_unchecked_manual(world, entity);
    }

    get_many_mut(world: World, entities: Entity[]): Result<QueryItem<D>, QueryEntityError> {
        this.update_archetypes(world);
        return this.get_many_unchecked_manual(world, entities);
    }

    get_manual(world: World, entity: Entity) {
        return this.get_unchecked_manual(world, entity);
    }

    get_unchecked(world: World, entity: Entity) {
        this.update_archetypes_unsafe_world_cell(world);
        return this.get_unchecked_manual(world, entity);
    }

    get_unchecked_manual(world: World, entity: Entity) {
        const location = world.entities().get(entity);
        if (!location) {
            return QueryEntityError.NoSuchEntity(entity);
        }

        if (!this.__matched_archetypes.contains(location.archetype_id)) {
            return new ErrorExt(QueryEntityError.QueryDoesNotMatch(entity), `QueryEntityError.QueryDoesNotMatch(${entity.index()}, ${entity.generation()})`);
        }

        const archetype = world.archetypes().get(location.archetype_id)!;
        const fetch = this.#data.init_fetch(world, this.__fetch_state)
        const filter = this.#filter.init_fetch(world, this.__filter_state)

        const table = world.storages().tables.get(location.table_id)!;
        this.#data.set_archetype(fetch as Unit, this.__fetch_state, archetype, table)
        this.#filter.set_archetype(filter as Unit, this.__filter_state, archetype, table)

        if (this.#filter.filter_fetch(filter as Unit, entity, location.table_row)) {
            return this.#data.fetch(fetch as Unit, entity, location.table_row);
        } else {
            return new ErrorExt(QueryEntityError.QueryDoesNotMatch(entity), `QueryEntityError.QueryDoesNotMatch(${entity.index()}, ${entity.generation()})`)
        }
    }

    get_many_read_only_manual(world: World, entities: Entity[]): Result<ROQueryItem<D>[], QueryEntityError> {
        const N = entities.length;
        const values = new Array(N);
        for (let i = 0; i < N; i++) {
            const item = this.get_unchecked_manual(world, entities[i]);
            if (is_error(item)) {
                return item;
            }
            values[i] = item;
        }

        return values;
    }

    get_many_unchecked_manual(world: World, entities: Entity[]) {
        const N = entities.length;
        for (let i = 0; N; i++) {
            for (let j = 0; j < i; j++) {
                if (Entity.eq(entities[i], entities[j])) {
                    return QueryEntityError.AliasedMutability(entities[i]);
                }
            }
        }

        const values = new Array(N);

        for (let i = 0; i < N; i++) {
            const item = this.get_unchecked_manual(world, entities[i]);
            if (is_error(item)) {
                return item;
            }
            values[i] = item;
        }

        return values;
    }

    iter(world: World) {
        this.update_archetypes(world);
        return this.__iter_unchecked_manual(world);
    }

    iter_mut(world: World) {
        this.update_archetypes(world);
        return this.__iter_unchecked_manual(world);
    }

    iter_manual(world: World) {
        this.validate_world(world.id());

        return this.__iter_unchecked_manual(world);
    }

    __iter_unchecked_manual(world: World): QueryIter<D, F> {
        return new QueryIter(world, this);
    }

    iter_combinations(world: World, k: number) {
        return this.__iter_combinations_unchecked_manual(world, k);
    }

    iter_combinations_mut(world: World, k: number) {
        return this.__iter_combinations_unchecked_manual(world, k);
    }

    iter_many(world: World, entities: EntityList) {
        this.update_archetypes(world);

        return this.__iter_many_unchecked_manual(world, entities);
    }

    iter_many_manual(world: World, entities: EntityList) {
        this.validate_world(world.id());

        return this.__iter_many_unchecked_manual(world, entities);
    }

    iter_many_mut(world: World, entities: EntityList) {
        this.update_archetypes(world);

        return this.__iter_many_unchecked_manual(world, entities);
    }

    iter_unchecked(world: World) {
        this.update_archetypes_unsafe_world_cell(world)
        return this.__iter_unchecked_manual(world);
    }

    iter_combinations_unchecked(world: World, k: number) {
        this.update_archetypes_unsafe_world_cell(world);
        return this.__iter_combinations_unchecked_manual(world, k);
    }

    __iter_many_unchecked_manual(world: World, entities: EntityList) {
        return new QueryManyIter(world, this, entities)
    }

    __iter_combinations_unchecked_manual(world: World, k: number) {
        return new QueryCombinationIter(world, this, k)
    }

    single(world: World) {
        const items = this.get_single(world);

        if (is_error(items)) {
            throw new Error(`Cannot get single mutable query result: ${items.get()}`)
        }
        return items;
    }

    get_single(world: World) {
        this.update_archetypes(world);

        return this.get_single_unchecked_manual(world);
    }

    single_mut(world: World) {
        return this.single(world);
    }

    get_single_mut(world: World) {
        return this.get_single_unchecked_manual(world);
    }

    get_single_unchecked(world: World) {
        this.update_archetypes_unsafe_world_cell(world);
        return this.get_single_unchecked_manual(world);
    }

    get_single_unchecked_manual(world: World): Result<ROQueryItem<D>, QuerySingleError> {
        const query = this.__iter_unchecked_manual(world);
        const first = query.next();
        const extra = query.next().done;

        if (!first.done && !extra) {
            return first.value;
        } else if (first.done) {
            return QuerySingleError.NoEntities
        } else if (!first.done) {
            return QuerySingleError.MultipleEntities
        }
    }

    as_nop(): QueryState<NoopWorldQuery<D>, F> {
        return this.__as_transmuted_state(new NoopWorldQuery(this.#data), this.#filter);
    }

    __as_transmuted_state<NewD extends QueryData<{}>, NewF extends QueryFilter<{}>>(new_data: NewD, new_filter: NewF): QueryState<NewD, NewF> {
        this.#data = new_data as unknown as D;
        this.#filter = new_filter as unknown as F;
        return this as unknown as QueryState<NewD, NewF>;
    }

    archetype_component_access() {
        return this.__archetype_component_access;
    }

    matched_tables(): TableId[] {
        return this.__matched_table_ids
    }

    matched_archetypes() {
        return this.__matched_archetypes;
    }

    get __data_type(): D {
        return this.#data;
    }

    get __filter_type(): F {
        return this.#filter;
    }
}

export class NoopWorldQuery<D extends QueryData<{}>> implements WorldQuery<D, Unit, Unit> {
    readonly IS_DENSE: boolean;

    #data: D;

    constructor(data: D) {
        this.#data = data;
        this.IS_DENSE = data.IS_DENSE
    }

    init_fetch(_world: World, _state: Unit): Unit {
        return UNIT;
    }

    set_archetype(_fetch: Unit, _state: Unit, _archetype: Archetype, _table: Table): void { }

    set_table(_fetch: Unit, _state: Unit, _table: Table): void { }

    fetch(_fetch: Unit, _entity: Entity, _table_row: number): D { return undefined as unknown as D }

    update_component_access(_state: Unit, _access: FilteredAccess<ComponentId>): void { }

    init_state(world: World) {
        return this.#data.init_state(world);
    }

    get_state(world: World): Option<Unit> {
        return this.#data.get_state(world);
    }

    matches_component_set(state: Unit, set_contains_id: (component_id: number) => boolean): boolean {
        // return D:: matches_component_set(state, this.set_archetype);
        // return this.#data.matches_component_set(state, this.set_archetype)
        return true
    }

    set_access(_state: typeof UNIT, _access: FilteredAccess<number>): void { }


}
