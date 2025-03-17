import { Tick } from "..";
import { Archetype } from "../archetype";
import { FilteredAccess, FilteredAccessSet, QueryData, QueryFilter, QueryState } from "../query";
import { World } from "../world";
import { SystemMeta } from './function-system';
import { Class } from "../util";

export interface SystemParam<State = any, Item = any> {
    // !typescript types (never gets instantiated!)
    State: State;
    Item: Item;

    init_state(world: World, system_meta: SystemMeta, ...additional: any[]): State;
    get_param(state: State, system: SystemMeta, world: World, change_tick: Tick): Item;

    new_archetype(_state: State, _archetype: Archetype, _system_meta: SystemMeta): void;

    apply(_state: State, _system_meta: SystemMeta, _world: World): void;

    queue(_state: State, _system_meta: SystemMeta, _world: World): void;

    validate_param(_state: State, _system_meta: SystemMeta, _world: World): boolean;

}

export type SystemParamClass<T extends Class<SystemParam>> = InstanceType<T>;

/**
 * A collection of potentially conflicting `SystemParam`s allowed by disjoint access.
 * 
 * Allows systems to safely access and interact with up to 8 mutually exclusive `SystemParam`s, such as
 * two queries that reference the same mutable data or an event reader and writer of the same type.
 * 
 * Each individual `SystemParam` can be accessed by using the functions `p0()`, `p1()`, ...., `p7()`,
 * according to the order they are defined in the `ParamSet`. This ensures that there's either
 * only one mutable reference to a parameter at at time or any number of immutable references.
 */
export class ParamSet<T extends SystemParam<any, any>> implements SystemParam<any, any> {
    #states: T['State'];
    #world: World;
    #system_meta: SystemMeta;
    #change_tick: Tick;

    constructor(
        states: T['State'],
        world: World,
        system_meta: SystemMeta,
        change_tick: Tick
    ) {
        console.log('ParamSet ctor', states);

        this.#states = states;
        this.#system_meta = system_meta;
        this.#world = world;
        this.#change_tick = change_tick;
    }

    State!: T['State'];
    Item!: T['Item'];

    static init_state(world: World, system_meta: SystemMeta, param: SystemParam) {

        const meta = system_meta.clone();
        meta.__component_access_set.clear();
        meta.__archetype_component_access.clear();
        param = param.init_state(world, system_meta);


        if (false || !meta.is_send()) {
            system_meta.set_non_send();
        }

        system_meta.__component_access_set.extend(meta.__component_access_set);
    }

    static new_archetype(state: any, archetype: Archetype, system_meta: SystemMeta, param: SystemParam): void {

        param.new_archetype(state, archetype, system_meta);
    }

    static apply(state: any, system_meta: SystemMeta, world: World, param: SystemParam): void {
        param.apply(state, system_meta, world);
    }

    static queue(state: any, system_meta: SystemMeta, world: World, param: SystemParam): void {
        param.apply(state, system_meta, world);
    }

    static validate_param(state: any, system_meta: SystemMeta, world: World, param: SystemParam): boolean {
        param.validate_param(state, system_meta, world);
    }

    static get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick, param: SystemParam) {
        return new ParamSet(state, system_meta.clone(), world, change_tick)
    }

    // into_arguments() {

    // }

}

export class Local<T> implements SystemParamClass<typeof Local<T>> {
    static State: any;
    static Item: Local<any>;

    constructor(public value: T) { }

    static init_state<T>(world: World, _system_meta: SystemMeta, type: T) {
        return type;
    }

    static get_param<T>(state: T) {
        return new Local(state);
    }

    static new_archetype() { }

    static queue() { }

    static validate_param() {
        return true;
    }
}

export class SystemChangeTick {
    #last_run: Tick;
    #this_run: Tick;

    constructor(last_run: Tick, this_run: Tick) {
        this.#last_run = last_run;
        this.#this_run = this_run;
    }

    last_run() {
        return this.#last_run
    }

    this_run() {
        return this.#this_run;
    }
}

export function init_query_param(world: World, system_meta: SystemMeta, state: QueryState<QueryData, QueryFilter>) {
    // TODO: uncomment
    // // @ts-expect-error
    // assert_component_access_compatibility(system_meta.name(), state.D.constructor.name, state.F.constructor.name, system_meta.__component_access_set, state.__component_access, world)

    // // @ts-expect-error
    // system_meta.__component_access_set.add(state.__component_access.clone())
}

function assert_component_access_compatibility(system_name: string, query_type: string, filter_type: string, system_access: FilteredAccessSet, current: FilteredAccess, world: World) {
    const conflicts = system_access.get_conflicts_single(current);
    if (conflicts.is_empty()) {
        return
    }

    let accesses = conflicts.format_conflict_list(world);
    if (accesses.length !== 0) {
        accesses += ' ';
    }

    throw new Error(`Query<${query_type}, ${filter_type}> in system ${system_name} accesses component(s) ${accesses}in way that conflicts with a previous system parameter. Consider using \`Without<T>\` to create disjoing Queries or merging conflicting Queries into a \`ParamSet\``)
}

export type SystemParamItem<P extends SystemParam<any, any>> = ReturnType<P['get_param']>;