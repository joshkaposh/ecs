import { TODO } from "joshkaposh-iterator/src/util";
import { ComponentId, Tick } from "..";
import { Archetype } from "../archetype";
import { FilteredAccess, FilteredAccessSet, Query, QueryData, QueryFilter, QueryState } from "../query";
import { World } from "../world";
import { SystemMeta } from './function-system';

export interface SystemParam<State, Item> {
    param_init_state(world: World, system_meta: SystemMeta): State;
    param_get_param(state: State, system: SystemMeta, world: World, change_tick: Tick): Item;

    param_new_archetype(_state: State, _archetype: Archetype, _system_meta: SystemMeta): void;

    param_apply(_state: State, _system_meta: SystemMeta, _world: World): void;

    param_queue(_state: State, _system_meta: SystemMeta, _world: World): void;


    param_validate_param(_state: State, _system_meta: SystemMeta, _world: World): boolean;

}

export class ParamSet<T extends SystemParam<any, any>> implements SystemParam<any, any> {
    constructor(
        public param_states: ReturnType<T['param_init_state']>,
        public world: World,
        public system_meta: SystemMeta,
        public change_tick: Tick,
    ) {
    }

    param_init_state(world: World, system_meta: SystemMeta) {

        const states = this.param_states;
        let system_meta_
        for (let i = 0; i < states.length; i++) {
            system_meta_ = system_meta.clone();
            system_meta_.__archetype_component_access.clear();
            states[i].param_init_state(world, system_meta_.clone())
            states[i].param_init_state(world, system_meta.clone())
        }

        if (!system_meta_!.is_send()) {
            system_meta.set_non_send();
        }

        const params: any[] = []

        for (let i = 0; i < states.length; i++) {
            const param = states[i];
            system_meta.__component_access_set.extend(param.__component_access_set)
            system_meta.__archetype_component_access.extend(param.__archetype_component_access)
            params.push(param)
        }

        return params
    }

    param_new_archetype(state: any, archetype: Archetype, _system_meta: SystemMeta): void {
        for (let i = 0; i < this.param_states.length; i++) {
            this.param_states[i].param_new_archetype(state, archetype);
        }
    }

    param_apply(state: any, system_meta: SystemMeta, world: World): void {
        for (let i = 0; i < this.param_states.length; i++) {
            this.param_states[i].param_apply(state, system_meta, world);
        }
    }

    param_queue(state: any, system_meta: SystemMeta, world: World): void {
        const states = this.param_states
        for (let i = 0; i < states.length; i++) {
            states[i].param_queue(state, system_meta, world)
        }
    }

    param_validate_param(state: any, system_meta: SystemMeta, world: World): boolean {
        return this.param_states.every((p: any) => p.param_validate_param(state, system_meta, world))
    }

    param_get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick) {
        return new ParamSet(state, world, system_meta.clone(), change_tick)
    }

}

export class ParamBuilder<P extends readonly any[]> {
    #w: World;
    #params: P
    constructor(world: World) {
        this.#w = world;
        this.#params = [] as unknown as P;
    }

    res<T>(resource: T) {
        const res = this.#w.resource(resource);
        // @ts-expect-error
        this.#params.push(res);
        return this;
    }

    query<T extends readonly any[]>(query: T) {
        const q = this.#w.query(query)
        // @ts-expect-error
        this.#params.push(q);
        return this;
    }

    query_filtered<D extends readonly any[], F extends readonly any[]>(data: D, filter: F) {
        const q = this.#w.query_filtered(data, filter);
        // @ts-expect-error
        this.#params.push(q);
        return this;
    }

    // commands() {
    //     TODO('ParamBuilder.commands()')
    // }

    params() {
        return this.#params;
    }
}

export type SystemParamItem<P extends SystemParam<any, any>> = ReturnType<P['param_get_param']>;

export function init_query_param<D extends QueryData, F extends QueryFilter>(world: World, system_meta: SystemMeta, state: QueryState<D, F>) {

    assert_component_access_compatibility
    // @ts-expect-error
    system_meta.__component_access_set.add(state.__component_access.clone());

}

export function assert_component_access_compatibility(system_name: string, query_type: string, filter_type: string, system_access: FilteredAccessSet<ComponentId>, current: FilteredAccess<ComponentId>, world: World) {
    const conflicts = system_access.get_conflicts_single(current);
    if (conflicts.is_empty()) {
        return;
    }

    // const accesses = conflicts.format_conflict_list(world);
    throw new Error(`Query in system ${system_name} accesses component(s) accesses in a way that conflicts with a previous system parameter. Consider using "Without<T>" to create disjoint Queries or merging conflicting Queries into a "ParamSet"`)
}