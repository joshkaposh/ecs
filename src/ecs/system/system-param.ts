import { Archetype } from "../archetype";
import { FilteredAccess, Query, QueryState } from "../query";
import { World } from "../world";
import { SystemMeta } from './system';

export abstract class SystemParam<State extends any, Item extends SystemParam<State, any>> {
    abstract init_state(world: World): State;
    abstract get_param(state: State, system_meta: SystemMeta, world: World): Item;

    new_archetype(_state: State, _archetype: Archetype, _system_meta: SystemMeta) { }

    apply(_state: State, _system_meta: SystemMeta, _world: World) { }

    queue(_state: State, _system_meta: SystemMeta, _world: World) { }

    validate_param(_state: State, _system_meta: SystemMeta, _world: World) {
        return true
    }
}

class SystemParamQuery {
    #state: QueryState<any, any>
    constructor(state: QueryState<any, any>) {
        this.#state = state;
    }

    init_state(world: World, system_meta: SystemMeta) {
        const state = QueryState.new_with_access(this.#state.D, this.#state.F, world, system_meta.__archetype_component_access)
        init_query_param(world, system_meta, state);
        return state;
    }

    new_archetype(state: any, archetype: Archetype, system_meta: SystemMeta) {
        state.new_archetype(archetype, system_meta.__archetype_component_access)
    }

    get_param(state: any, _system_meta: SystemMeta, world: World) {
        return new Query(world, state, false)
    }

}

export function init_query_param(world: World, system_meta: SystemMeta, state: QueryState<any, any>) {
    assert_component_access_compatibility(system_meta.name(), system_meta.__component_access_set, state.__component_access, world);

    system_meta.__component_access_set.add(state.__component_access.clone())
}

function assert_component_access_compatibility(system_name: string, system_access: FilteredAccess<number>, current: FilteredAccess<number>, world: World) {
    const conflicts = system_access.get_conflicts(current);
    if (conflicts.is_empty()) {
        return
    }

    throw new Error(`Query in system ${system_name} access component(s) acesses in a way that conflicts with a previous system parameter. Consider using 'Without<T>' to create disjoint Queries`)
}

class ParamSet<T extends SystemParam<any, any>> {
    // #param_states: T;
    // #world: World;
    // #system_meta: SystemMeta;
}