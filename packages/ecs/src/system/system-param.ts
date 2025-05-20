import type { Tick } from "../tick";
import type { Archetype } from "../archetype";
import type { FilteredAccess, FilteredAccessSet, QueryData, QueryFilter, QueryState } from "../query";
import type { DeferredWorld, FromWorld, World } from "../world";
import type { SystemMeta } from './function-system';
import type { Class, Instance } from "../util";
import type { ErrorType, Option, Result } from "joshkaposh-option";

// TODO: implement Array<SystemParam> ... somehow

export interface SystemParam<State = any, Item = any> {
    /**
     * Registers any [`World`] access used by this [`SystemParam`]
     * and creates a new instance of this param's [`State`].
     */
    init_state(world: World, system_meta: SystemMeta, ...additional: any[]): State;

    /**
     * For the specified [`Archetype`], registers the components accessed by this [`SystemParam`] (if applicable)
     * 
     * **Safety**
     * `archetype` must be from the [`World`] used to initialize `state` in [`SystemParam.init_state`]
     */
    new_archetype?(state: State, archetype: Archetype, system_meta: SystemMeta): void;

    /**
     * Applies any deferred mutations stored in this [`SystemParam`]'s state.
     * This is used to apply [`Commands`] during [`ApplyDeferred`]
     */
    exec?(state: State, system_meta: SystemMeta, world: World): void;

    /**
     * Queues any deferred mutations to be applied at the next [`ApplyDeferred`].
     */
    queue?(state: State, system_meta: SystemMeta, world: DeferredWorld): void;

    /**
     * Validates that the param can be acquired by the [`get_param`] method.
     * 
     * Built-in executors use this to prevent systems with invalid params from running,
     * and any failures here will be bubbled up to the default error handler defined in ecs::error,
     * with a value of type [`SystemParamValidationError`].
     * 
     * For nested [`SystemParam`]s validation will fail if any delegated validation fails.
     * 
     * However calling and respecting [`SystemParam.validate_param`] is not a strict requirement, [`SystemParam.get_param`] should
     * provide it's own safety mechanism to prevent undefined behaviour.
     * 
     * The `world` can only be used to read param's data
     * and world metadata. No data can be written.
     * 
     * When using system parameters that require `change_tick`,
     * you can use `world.changeTick`. Even if this isn't the exact same tick used for [`SystemParam.get_param`], the world access
     * ensures that the queried data will be the same in both calls.
     * 
     * This method has to be called directly before [`SystemParam.get_param`] with no other (relevant)
     * world mutation in-between. Otherwise, while it won't lead to any undefined behaviour,
     * the validity of the param may change.
     * 
     * **Safety**
     * 
     * - The passed `world` must have read-only access to world data registered in [`SystemParam.init_state`].
     * - `world` must be the same [`World`] that was used to initialize `state`.
     * - All `world`s archetypes have been processed by [`SystemParam.new_archetype`].
     */
    validate_param?(state: State, system_meta: SystemMeta, world: World): Result<Option<void>, SystemParamValidationError>;

    /**
     * Creates a parameter to be passed into a [`SystemParamFunction`].
     * 
     * **Safety**
     *
     * - The passed `world` must have access to any world data registered in [`SystemParam.init_state`].
     * - `world` must be the same [`World`] that was used to initialize `state`.
     * - All `world`s archetypes have been processed by [`SystemParam.new_archetype`].
     */
    get_param(state: State, system: SystemMeta, world: World, change_tick: Tick): Item;
}

// export interface SystemParamDefinition<State = any, Item = any> {
//     /**
//      * Registers any [`World`] access used by this [`SystemParam`]
//      * and creates a new instance of this param's [`State`].
//      */
//     init_state(world: World, system_meta: SystemMeta, ...additional: any[]): State;

//     /**
//      * Creates a parameter to be passed into a [`SystemParamFunction`].
//      * 
//      * **Safety**
//      *
//      * - The passed `world` must have access to any world data registered in [`SystemParam.init_state`].
//      * - `world` must be the same [`World`] that was used to initialize `state`.
//      * - All `world`s archetypes have been processed by [`SystemParam.new_archetype`].
//      */
//     get_param(state: State, system: SystemMeta, world: World, change_tick: Tick): Item;



//     /**
//      * For the specified [`Archetype`], registers the components accessed by this [`SystemParam`] (if applicable)
//      * 
//      * **Safety**
//      * `archetype` must be from the [`World`] used to initialize `state` in [`SystemParam.init_state`]
//      */
//     new_archetype?(_state: State, _archetype: Archetype, _system_meta: SystemMeta): void;

//     /**
//      * Applies any deferred mutations stored in this [`SystemParam`]'s state.
//      * This is used to apply [`Commands`] during [`ApplyDeferred`]
//      */
//     exec?(_state: State, _system_meta: SystemMeta, _world: World): void;

//     /**
//      * Queues any deferred mutations to be applied at the next [`ApplyDeferred`].
//      */
//     queue?(_state: State, _system_meta: SystemMeta, _world: DeferredWorld): void;

//     /**
//      * Validates that the param can be acquired by the [`get_param`] method.
//      * 
//      * Built-in executors use this to prevent systems with invalid params from running,
//      * and any failures here will be bubbled up to the default error handler defined in ecs::error,
//      * with a value of type [`SystemParamValidationError`].
//      * 
//      * For nested [`SystemParam`]s validation will fail if any delegated validation fails.
//      * 
//      * However calling and respecting [`SystemParam.validate_param`] is not a strict requirement, [`SystemParam.get_param`] should
//      * provide it's own safety mechanism to prevent undefined behaviour.
//      * 
//      * The `world` can only be used to read param's data
//      * and world metadata. No data can be written.
//      * 
//      * When using system parameters that require `change_tick`,
//      * you can use `world.changeTick`. Even if this isn't the exact same tick used for [`SystemParam.get_param`], the world access
//      * ensures that the queried data will be the same in both calls.
//      * 
//      * This method has to be called directly before [`SystemParam.get_param`] with no other (relevant)
//      * world mutation in-between. Otherwise, while it won't lead to any undefined behaviour,
//      * the validity of the param may change.
//      * 
//      * **Safety**
//      * 
//      * - The passed `world` must have read-only access to world data registered in [`SystemParam.init_state`].
//      * - `world` must be the same [`World`] that was used to initialize `state`.
//      * - All `world`s archetypes have been processed by [`SystemParam.new_archetype`].
//      */
//     validate_param?(_state: State, _system_meta: SystemMeta, _world: World): Result<Option<void>, SystemParamValidationError>;


// }

export interface SystemBuffer<T extends any = any> extends FromWorld<T> {
    exec(system_meta: SystemMeta, world: World): void;
    queue(system_meta: SystemMeta, world: DeferredWorld): void;
    get(): Instance<T>;
}

type DS<T> = T extends SystemParam<infer State> ? State : never;
type DI<T> = T extends SystemParam<any, infer Item> ? Item : never;

export function defineParam<T extends SystemParam>(type: T): Required<SystemParam<DS<T>, DI<T>>> {
    type.new_archetype ??= function new_archetype() { }
    type.validate_param ??= function validate_param() { }
    type.exec ??= function exec() { }
    type.queue ??= function queue() { }

    return type as Required<SystemParam<DS<T>, DI<T>>>;
}

export type Deferred<T> = SystemParam;
const Deferred = {
    from_world() { },

    init_state<T extends SystemBuffer>(world: World, system_meta: SystemMeta, type: T) {
        system_meta.setHasDeferred();
        return type.from_world(world);
    },

    validate_param(_state: SystemBuffer, _system_meta: SystemMeta, _world: World) { },

    new_archetype(_state: SystemBuffer, _archetype: Archetype, _system_meta: SystemMeta) {
    },

    exec(state: SystemBuffer, system_meta: SystemMeta, world: World) {
        state.exec(system_meta, world);
    },

    queue(state: SystemBuffer, system_meta: SystemMeta, world: DeferredWorld) {
        state.queue(system_meta, world);
    },

    get_param<T extends SystemBuffer>(state: T, _system_meta: SystemMeta, _world: World, _change_tick: Tick) {
        return state.get();
    },

    get() { }

} as const;

defineParam(Deferred);
export { Deferred }

export type SystemParamItem<T> = T extends SystemParam<any, infer Item> ? Item : never;
export type SystemParamState<T> = T extends SystemParam<infer State> ? State : never;


export type SystemParamClass<T extends Class<SystemParam>> = InstanceType<T>;

// /**
//  * A collection of potentially conflicting `SystemParam`s allowed by disjoint access.
//  * 
//  * Allows systems to safely access and interact with up to 8 mutually exclusive `SystemParam`s, such as
//  * two queries that reference the same mutable data or an event reader and writer of the same type.
//  * 
//  * Each individual `SystemParam` can be accessed by using the functions `p0()`, `p1()`, ...., `p7()`,
//  * according to the order they are defined in the `ParamSet`. This ensures that there's either
//  * only one mutable reference to a parameter at at time or any number of immutable references.
//  */
// export class ParamSet<T extends SystemParam<any, any>> implements SystemParam<any, any> {
//     #states: T['State'];
//     #world: World;
//     #system_meta: SystemMeta;
//     #change_tick: Tick;

//     constructor(
//         states: T['State'],
//         world: World,
//         system_meta: SystemMeta,
//         change_tick: Tick
//     ) {
//         console.log('ParamSet ctor', states);

//         this.#states = states;
//         this.#system_meta = system_meta;
//         this.#world = world;
//         this.#change_tick = change_tick;
//     }

//     State!: T['State'];
//     Item!: T['Item'];

//     static init_state(world: World, system_meta: SystemMeta, param: SystemParam) {

//         const meta = system_meta.clone();
//         meta.__component_access_set.clear();
//         meta.__archetype_component_access.clear();
//         param = param.init_state(world, system_meta);


//         if (false || !meta.is_send()) {
//             system_meta.set_non_send();
//         }

//         system_meta.__component_access_set.extend(meta.__component_access_set);
//     }

//     static new_archetype(state: any, archetype: Archetype, system_meta: SystemMeta, param: SystemParam): void {

//         param.new_archetype(state, archetype, system_meta);
//     }

//     static apply(state: any, system_meta: SystemMeta, world: World, param: SystemParam): void {
//         param.apply(state, system_meta, world);
//     }

//     static queue(state: any, system_meta: SystemMeta, world: World, param: SystemParam): void {
//         param.apply(state, system_meta, world);
//     }

//     static validate_param(state: any, system_meta: SystemMeta, world: World, param: SystemParam): boolean {
//         return param.validate_param(state, system_meta, world);
//     }

//     static get_param(state: any, system_meta: SystemMeta, world: World, change_tick: Tick, param: SystemParam) {
//         return new ParamSet(state, world, system_meta.clone(), change_tick)
//     }


// }

class Local<T> {
    value: T;
    constructor(value: T) {
        this.value = value;
    }

    static init_state<T>(world: World, _system_meta: SystemMeta, type: T & Partial<FromWorld<T>>) {
        return new Local(type.from_world?.(world) ?? type);
    }

    static get_param<T>(state: T) {
        return state;
    }
}

defineParam(Local);

export { Local }

class SystemChangeTick {
    #last_run: Tick;
    #this_run: Tick;

    constructor(last_run: Tick, this_run: Tick) {
        this.#last_run = last_run;
        this.#this_run = this_run;
    }

    static init_state(_world: World, _system_meta: SystemMeta) { }

    static get_param(_state: any, system_meta: SystemMeta, _world: World, change_tick: Tick) {
        return new SystemChangeTick(system_meta.last_run, change_tick);
    }

    last_run() {
        return this.#last_run
    }

    this_run() {
        return this.#this_run;
    }
}

defineParam(SystemChangeTick);

export { SystemChangeTick }

export function init_query_param(world: World, system_meta: SystemMeta, state: QueryState<QueryData, QueryFilter>) {
    // TODO: uncomment
    // @ts-expect-error
    assert_component_access_compatibility(system_meta.name, state.D.constructor.name, state.F.constructor.name, system_meta.__component_access_set, state.__component_access, world)

    // @ts-expect-error
    system_meta.__component_access_set.add(state.__component_access.clone())
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

export class SystemParamValidationError extends Error implements ErrorType<SystemParamValidationError> {

    skipped: boolean;
    message: string;
    param: string;
    field: string;

    constructor(skipped: boolean, message: string, parameter_name: string, field: string) {
        super(`Parameter ${parameter_name}${field} failed validation: ${message}`);
        this.skipped = skipped;
        this.message = message;
        this.param = parameter_name;
        this.field = field;
    }

    get() {
        return this;
    }

    static skipped(type_name: string, message: string) {
        return new SystemParamValidationError(true, message, type_name, '')
    }

    static invalid(type_name: string, message: string) {
        return new SystemParamValidationError(false, message, type_name, '');
    }

    [Symbol.toPrimitive]() {
        return `Parameter ${this.param}${this.field} failed validation: ${this.message}`
    }

    [Symbol.toStringTag]() {
        return `Parameter ${this.param}${this.field} failed validation: ${this.message}`
    }

}