import { FixedBitSet } from "fixed-bit-set";
import { Archetype, ArchetypeGeneration, ArchetypeId, ComponentId, Entity, QueryData, QueryComponents, QueryFilter, QueryIter, World, QueryComponentsFilter } from "..";
import { TableId } from "../storage/table";
import { FilteredAccess } from "./access";
import { ErrorExt, is_some } from "joshkaposh-option";

export type StorageIdTable = {
    table_id: TableId;
}
export type StorageIdArchetype = {
    archetype_id: ArchetypeId;
}
export type StorageId = StorageIdTable | StorageIdArchetype


export class QueryState<D extends QueryData<any, any, any>, F extends QueryFilter<any, any, any>> {

    #world_id: number;
    __archetype_generation: ArchetypeGeneration;
    __matched_tables: FixedBitSet;
    __matched_archetypes: FixedBitSet;
    __component_access: FilteredAccess<ComponentId>;
    __matched_storage_ids: StorageId[];
    __fetch_state: D['__state'];
    __filter_state: F['__state'];

    is_dense: boolean;

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

        const D = new QueryComponents(data as any);
        const F = new QueryComponentsFilter(filter as any);

        const state = QueryState.new_uninitialized<D, F>(D as any, F as any, world)

        state.update_archetypes(world);
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
        // F.update_component_access(filter_state, filter_component_access);

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

    get(world: World, entity: Entity) {
        this.update_archetypes(world);

        return this.get_unchecked_manual(world, entity);
    }

    get_unchecked_manual(world: World, entity: Entity) {
        const location = world.entities().get(entity) ?? new ErrorExt(entity, 'No such Entity');
        if (location instanceof ErrorExt) {
            throw location
        }

        if (!this.__matched_archetypes.contains(location.archetype_id)) {
            return new ErrorExt({ entity, world }, 'Query does not match')
        }

        const archetype = world.archetypes().get(location.archetype_id)!;
        const fetch = this.D.init_fetch(world, this.__fetch_state);
        const filter = this.F.init_fetch(world, this.__filter_state);

        const table = world.storages().tables.get(location.table_id)!;
        this.D.set_archetype(fetch, this.__fetch_state, archetype, table)
        this.D.set_archetype(filter, this.__filter_state, archetype, table)
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

    iter(world: World) {
        this.update_archetypes(world);
        return this.iter_unchecked_manual(world);
    }

    iter_unchecked_manual(world: World) {
        return new QueryIter(world, this)
    }
}