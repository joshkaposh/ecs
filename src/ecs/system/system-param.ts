import { assert } from "joshkaposh-iterator/src/util";
import { ComponentId, Resource, Tick } from "..";
import { Archetype } from "../archetype";
import { Res, ResMut, Ticks, TicksMut } from "../change_detection";
import { FilteredAccess, FilteredAccessSet, Query, QueryData, QueryFilter, QueryState } from "../query";
import { World } from "../world";
import { SystemMeta } from './function-system';

export abstract class SystemParam<State extends any, Item extends SystemParam<State, any>> {
    abstract State: State;
    abstract Item: Item;

    abstract init_state(world: World, system_meta: SystemMeta): State;
    abstract get_param(state: State, system_meta: SystemMeta, world: World, change_tick: Tick): Item;

    new_archetype(_state: State, _archetype: Archetype, _system_meta: SystemMeta) { }

    apply(_state: State, _system_meta: SystemMeta, _world: World) { }

    queue(_state: State, _system_meta: SystemMeta, _world: World) { }

    validate_param(_state: State, _system_meta: SystemMeta, _world: World) {
        return true
    }

}

export type SystemParamItem<P extends SystemParam<any, any>> = P['Item'];

export class SystemParamQuery<D extends QueryData<any, any, any>, F extends QueryFilter<any, any, any>> extends SystemParam<QueryState<D, F>, Query<D, F>> {
    D: D;
    F: F;
    State!: QueryState<D, F>;
    Item!: Query<D, F>
    constructor(d: D, f: F) {
        super()
        this.D = d;
        this.F = f;
    }

    init_state(world: World, system_meta: SystemMeta): QueryState<D, F> {
        const state = QueryState.new_with_access(this.D, this.F, world, system_meta.__archetype_component_access);
        init_query_param(world, system_meta, state);
        this.State = state;
        return state;
    }

    new_archetype(state: QueryState<D, F>, archetype: Archetype, system_meta: SystemMeta): void {
        state.new_archetype(archetype, system_meta.__archetype_component_access);
    }

    get_param(state: QueryState<D, F>, system_meta: SystemMeta, world: World, change_tick: Tick): Query<D, F> {
        return new Query(world, state, system_meta.last_run, change_tick)
    }
}

function init_query_param<D extends QueryData, F extends QueryFilter>(world: World, system_meta: SystemMeta, state: QueryState<D, F>) {

    assert_component_access_compatibility

    system_meta.__component_access_set.add(state.__component_access.clone());

}

export function assert_component_access_compatibility(system_name: string, query_type: string, filter_type: string, system_access: FilteredAccessSet<ComponentId>, current: FilteredAccess<ComponentId>, world: World) {
    const conflicts = system_access.get_conflicts_single(current);
    if (conflicts.is_empty()) {
        return;
    }

    const accesses = conflicts.format_conflict_list(world);
    throw new Error(`Query in system ${system_name} accesses component(s) accesses in a way that conflicts with a previous system parameter. Consider using "Without<T>" to create disjoint Queries or merging conflicting Queries into a "ParamSet"`)
}

export class SystemParamRes<T extends Resource> extends SystemParam<ComponentId, Res<T>> {
    #type: T
    constructor(type: T) {
        super();
        this.#type = type;
    }
    init_state(world: World, system_meta: SystemMeta): number {
        const component_id = world.components().register_resource(this.#type);
        const archetype_component_id = world.__initialize_resource_internal(component_id).id();

        const combined_access = system_meta.__component_access_set.combined_access();
        assert(!combined_access.has_resource_write(component_id));

        system_meta.__component_access_set.__add_unfiltered_resource_read(component_id);
        system_meta.__archetype_component_access.add_resource_read(archetype_component_id);

        return component_id;
    }

    validate_param(component_id: number, system_meta: SystemMeta, world: World): boolean {
        const is_valid = world.storages().resources.get(component_id)?.is_present() ?? false;
        if (!is_valid) {
            system_meta.try_warn_param(this);
        }
        return is_valid;
    }

    get_param(component_id: number, system_meta: SystemMeta, world: World, change_tick: Tick): Res<T> {
        const param = world.get_resource_with_ticks(component_id);
        if (!param) {
            throw new Error(`Resource requested by ${system_meta.name()} does not exist`);
        }
        const [ptr, ticks] = param;

        return new Res(ptr, new Ticks(
            ticks.added,
            ticks.changed,
            system_meta.last_run,
            change_tick
        ))
    }
}

export class SystemParamResMut<T extends Resource> extends SystemParam<ComponentId, ResMut<T>> {
    #type: T
    constructor(type: T) {
        super()
        this.#type = type;
    }

    init_state(world: World, system_meta: SystemMeta): number {
        const component_id = world.components().register_resource(this.#type);
        const archetype_component_id = world.__initialize_resource_internal(component_id).id();

        const combined_access = system_meta.__component_access_set.combined_access();
        if (combined_access.has_resource_write(component_id)) {
            throw new Error(`ResMut<${this.#type.name}> in system ${system_meta.name()} conflicts with a previous ResMut access. Consider removing the duplicate access.`)
        } else if (combined_access.has_resource_read(component_id)) {
            throw new Error(`ResMut<${this.#type.name}> in system ${system_meta.name()} conflicts with a previous Res access. Consider removing the duplicate access.`)
        }

        system_meta.__component_access_set.__add_unfiltered_resource_write(component_id);
        system_meta.__archetype_component_access.add_resource_write(archetype_component_id);

        return component_id;
    }

    validate_param(component_id: number, system_meta: SystemMeta, world: World): boolean {
        const is_valid = world.storages().resources.get(component_id)?.is_present() ?? false;
        if (!is_valid) {
            system_meta.try_warn_param(this);
        }
        return is_valid;
    }

    get_param(component_id: number, system_meta: SystemMeta, world: World, change_tick: Tick): ResMut<T> {
        const value = world.get_resource_mut_by_id(component_id);
        if (!value) {
            throw new Error(`Resource<${this.#type.name}> requested by ${system_meta.name()} does not exist.`)
        }

        const [ptr, ticks] = value
        return new ResMut(
            ptr,
            new TicksMut(ticks.added, ticks.changed, system_meta.last_run, change_tick)
        )
    }

}