import { FixedBitSet } from "fixed-bit-set";
import { Archetype, ArchetypeGeneration, ArchetypeId, ComponentId, QueryData, QueryFilter, QueryIter, World, QueryDataTuple, ArchetypeComponentId, All } from "..";
import { TableId } from "../storage/table";
import { Access, FilteredAccess } from "./access";
import { is_some } from "joshkaposh-option";
import { assert } from "joshkaposh-iterator/src/util";

export type StorageIdTable = {
    table_id: TableId;
}
export type StorageIdArchetype = {
    archetype_id: ArchetypeId;
}
export type StorageId = StorageIdTable | StorageIdArchetype

function from_tuples(fetch: any[], filter: any[]) {
    return [QueryDataTuple.from_data(fetch), All(...filter)]
}

export class QueryState<D extends QueryData<any, any, any>, F extends QueryFilter<any, any, any>> {
    #world_id: number;
    private __archetype_generation: ArchetypeGeneration;
    private __matched_tables: FixedBitSet;
    private __matched_archetypes: FixedBitSet;
    private __component_access: FilteredAccess<ComponentId>;
    private __matched_storage_ids: StorageId[];
    private __fetch_state: D['__state'];
    private __filter_state: F['__state'];

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
        fetch_state: D['__state'],
        filter_state: F['__state'],
        component_access: FilteredAccess<ComponentId>,
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

    static new<D extends QueryData, F extends QueryFilter>(data: D, filter: F, world: World): QueryState<D, F> {
        const [D, F] = from_tuples(data as any, filter as any)
        const state = QueryState.new_uninitialized<D, F>(D as any, F as any, world)
        state.update_archetypes(world);
        return state;
    }

    static new_with_access<D extends QueryData<any, any, any>, F extends QueryFilter<any, any, any>>(data: D, filter: F, world: World, access: Access<ArchetypeComponentId>): QueryState<D, F> {
        const state = QueryState.new_uninitialized(data, filter, world);
        for (const archetype of world.archetypes().iter()) {
            state.#new_archetype_internal(archetype);
            state.update_archetype_component_access(archetype, access);

            if (state.#new_archetype_internal(archetype)) {
                state.update_archetype_component_access(archetype, access);
            }
        }

        state.__archetype_generation = world.archetypes().generation();
        return state;

    }

    static new_uninitialized<D extends QueryData, F extends QueryFilter>(D: D, F: F, world: World): QueryState<D, F> {
        const fetch_state = D.init_state(world);
        const filter_state = F.init_state(world);

        return QueryState.from_states_ununitialized(D, F, world.id(), fetch_state, filter_state);
    }

    static from_states_ununitialized<D extends QueryData, F extends QueryFilter>(D: D, F: F, world_id: number, fetch_state: any, filter_state: any): QueryState<D, F> {
        const component_access = FilteredAccess.default();
        D.update_component_access(fetch_state, component_access)

        const filter_component_access = FilteredAccess.default();
        F.update_component_access(filter_state, filter_component_access);

        component_access.extend(filter_component_access);

        const is_dense = D.IS_DENSE && F.IS_DENSE;

        return new QueryState(
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

    join(world: World, other: QueryState<QueryData<any, any, any>, QueryFilter<any, any, any>>) {
        return this.join_filtered(world, other)
    }

    join_filtered<OtherD extends QueryData<any, any, any>, OtherF extends QueryFilter<any, any, any>, NewD extends QueryData<any, any, any>, NewF extends QueryFilter<any, any, any>>(world: World, other: QueryState<OtherD, OtherF>): QueryState<NewD, NewF> {
        if (this.#world_id !== other.#world_id) {
            throw new Error('Join queries initialized on different worlds is not allowed.')
        }
        const new_d = other.D as unknown as NewD;
        const new_f = other.F as unknown as NewF;


        this.validate_world(world.id());
        const component_access = FilteredAccess.default();
        const new_fetch_state = new_d.get_state(world.components());
        if (!is_some(new_fetch_state)) {
            throw new Error('could not creat fetch_state. Initialize all referenced components before joining')
        }

        const new_filter_state = new_f.get_state(world.components());
        if (!is_some(new_filter_state)) {
            throw new Error('could not creat filter_state. Initialize all referenced components before joining')
        }

        new_d.set_access(new_fetch_state, this.__component_access);
        new_d.update_component_access(new_fetch_state, component_access);

        const new_filter_component_access = FilteredAccess.default();
        new_f.update_component_access(new_filter_state, new_filter_component_access);

        component_access.extend(other.__component_access);
        const joined_component_access = this.__component_access.clone();
        joined_component_access.extend(other.__component_access);

        assert(component_access.is_subset(joined_component_access));

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
            new_d,
            new_f,
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

    new_archetype(archetype: Archetype, access: Access) {
        const matches = this.#new_archetype_internal(archetype);
        if (matches) {
            this.update_archetype_component_access(archetype, access);
        }
    }

    update_archetypes(world: World) {
        this.validate_world(world.id())
        if (this.__component_access.__required.is_empty()) {
            const archetypes = world.archetypes();
            const old_generation = this.__archetype_generation;
            this.__archetype_generation = archetypes.generation();

            for (const archetype of archetypes.iter_range(old_generation)) {
                this.#new_archetype_internal(archetype);
            }
        } else {
            if (this.__archetype_generation === world.archetypes().generation()) {
                return
            }
            const potential_archetypes = this.__component_access.__required.ones().filter_map(idx => {
                return world
                    .archetypes()
                    .component_index()
                    .get(idx as any)?.keys()
            }).min()
            if (is_some(potential_archetypes)) {
                // @ts-expect-error
                for (const archetype_id of potential_archetypes) {
                    if (archetype_id < this.__archetype_generation) {
                        continue
                    }
                    const archetype = world.archetypes().get(archetype_id)!;
                    this.#new_archetype_internal(archetype);
                }
            }
        }
        this.__archetype_generation = world.archetypes().generation();
    }

    update_archetype_component_access(archetype: Archetype, access: Access<ArchetypeComponentId>) {
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

    iter(world: World) {
        this.update_archetypes(world);
        return this.iter_unchecked_manual(world);
    }

    iter_unchecked_manual(world: World) {
        return QueryIter.new(world, this, world.last_change_tick(), world.change_tick())
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


    [Symbol.iterator]() {
    }
}