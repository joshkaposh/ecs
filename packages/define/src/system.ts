import { v4 } from "uuid";
import { Option } from "joshkaposh-option";
import { assert } from "joshkaposh-iterator/src/util";
import { AndCondition, AndMarker, check_system_change_tick, CombinatorSystem, Condition, DeferredWorld, InternedSystemSet, IntoScheduleConfig, IntoSystemSet, MAX_CHANGE_AGE, NandCondition, NandMarker, NorCondition, NorMarker, OrCondition, OrMarker, ParamBuilder, PipeSystem, relative_to, Schedulable, ScheduleConfig, ScheduleGraph, System, SystemFn, SystemMeta, SystemState, SystemTypeSet, World, XnorCondition, XnorMarker, XorCondition, XorMarker } from "ecs";
import { unit } from "ecs/src/util";
import { Tick } from "ecs/src/tick";

interface SystemMetadata<In, Out> extends System<In, Out>, IntoSystemSet {
    readonly func: SystemFn<In, Out>;
    readonly build_params: (builder: ParamBuilder) => In;
    meta: SystemMeta;
    state: Option<SystemState<any>>
}

// class SystemImpl<In, Fn extends SystemFn<In, boolean>, Out extends ReturnType<Fn>> implements System<In, Out> {
//     readonly fallible: boolean;
//     readonly is_exclusive: boolean;
//     readonly is_send: boolean;
//     readonly type_id: UUID;
//     readonly system_type_id: UUID;

//     #fn: Fn;
//     #build_params: (builder: ParamBuilder) => In;
//     #meta: SystemMeta;
//     #state: Option<SystemState<any>>;

//     constructor(
//         system_params: (builder: ParamBuilder) => In,
//         system_fn: Fn,
//         type_id = v4() as UUID,
//         fallible = false,
//         is_exclusive = false,
//         is_send = false,
//         meta = new SystemMeta(system_fn.name,),
//         state: Option<SystemState<any>>,
//     ) {
//         this.#fn = system_fn;
//         this.#build_params = system_params;
//         this.#meta = meta;
//         this.#state = state;
//         this.type_id = type_id;
//         this.system_type_id = type_id;
//         this.fallible = fallible;
//         this.is_exclusive = is_exclusive;
//         this.is_send = is_send;
//     }

//     get name() {
//         return this.#meta.name;
//     }

//     get has_deferred() {
//         return this.#meta.hasDeferred;
//     }

//     pipe<Bin, Bout>(b: System<Bin, Bout>): System<In, Bout> {
//         return new PipeSystem(this, b);
//     }

//     setName(new_name: string): System<In, Out> {
//         this.#meta.setName(new_name);
//         return this;
//     }

//     intoConfig(): ScheduleConfigs<Schedulable<any, any>> {
//         return new ScheduleConfig(this as any, {
//             hierarchy: this.defaultSystemSets(),
//             dependencies: [],
//             ambiguous_with: Ambiguity.default()
//         }, [])
//     }

//     before<M>(set: IntoSystemSet<M>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().before(set);
//     }

//     beforeIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().beforeIgnoreDeferred(set);
//     }

//     after<M>(set: IntoSystemSet<M>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().after(set);
//     }

//     afterIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().afterIgnoreDeferred(set);
//     }

//     inSet(set: SystemSet): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().inSet(set);
//     }

//     chain(): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().chain();
//     }

//     chainIgnoreDeferred(): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().chainIgnoreDeferred()
//     }

//     runIf(condition: Condition<any>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().runIf(condition)
//     }

//     distributiveRunIf(condition: Condition<any>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().distributiveRunIf(condition);
//     }

//     ambiguousWith<M>(set: IntoSystemSet<M>): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().ambiguousWith(set);
//     }

//     ambiguousWithAll(): ScheduleConfigs<Schedulable<any, any>> {
//         return this.intoConfig().ambiguousWithAll();
//     }

//     initialize(world: World): void {
//         if (this.#state) {
//             assert(this.#state.matches_world(world.id), 'System built with a different world than the one it was added to');
//         } else {
//             const builder = new ParamBuilder(this.name);
//             this.#build_params(builder);
//             const uninitialized = builder.uninitialized;
//             const params = new Array(uninitialized.length);
//             const param_states = new Array(uninitialized.length);
//             for (let i = 0; i < uninitialized.length; i++) {
//                 params[i] = uninitialized[i][0];
//                 param_states[i] = uninitialized[i][1](world, this.#meta);
//             }

//             this.#state = new SystemState(this.#meta, params, param_states, world.id, world.archetypes.generation);
//         }

//         this.#meta.last_run = relative_to(world.changeTick, MAX_CHANGE_AGE);
//     }

//     getLastRun() {
//         return this.#meta.last_run;
//     }

//     setLastRun(tick: Tick) {
//         this.#meta.last_run = tick;
//     }

//     checkChangeTick(change_tick: Tick) {
//         this.#meta.last_run = check_system_change_tick(this.#meta.last_run, change_tick, this.name);
//     }

//     componentAccess() {
//         return this.#meta.__component_access_set.combined_access();
//     }

//      archetypeComponentAccess() {
//         return this.#meta.__archetype_component_access;
//     }

//      applyDeferred(world: World) {
//         const params = this.#state!.param,
//             state = this.#state!.param_state;
//         for (let i = 0; i < params.length; i++) {
//             params[i].exec(state[i], this.#meta, world)
//         }
//     }

//      queueDeferred(world: DeferredWorld) {
//         const params = this.#state!.param,
//             state = this.#state!.param_state;
//         for (let i = 0; i < params.length; i++) {
//             params[i].queue(state[i], this.#meta, world)
//         }

//     }

//     updateArchetypeComponentAccess(_world: World) {

//     }

//      runUnsafe(input: In, world: World) {
//         if (!this.#state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }

//         const param_state = this.#state.get(world);
//         const system_params = input === unit ? param_state : [input, ...param_state];
//         return this.#fn.apply(this, system_params as unknown as InferSystemParams<In>) as unknown as Out;
//     }

//      run(input: In, world: World) {
//         const ret = this.runWithoutApplyingDeferred(input, world);
//         this.applyDeferred(world);
//         return ret;
//     }

//     runWithoutApplyingDeferred (input: In, world: World) {
//         this.updateArchetypeComponentAccess!(world);
//         return this.runUnsafe(input, world);
//     }

//     validateParam(world: World) {
//         return this.validateParamUnsafe(world);
//     }

//     validateParamUnsafe(_world: World) {

//     }

//      defaultSystemSets(): InternedSystemSet[] {
//         return [new SystemTypeSet(this)];
//     }

//      processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfig<Schedulable>) {
//         return schedule_graph.addSystemInner(config);
//     }

//      intoSystem() {
//         return this
//     }

//      intoSystemSet() {
//         return new SystemTypeSet(this).intern();
//     }

//     clone(): SystemImpl<In, Fn, Out> {
//         return new SystemImpl(
//             this.#build_params,
//             this.#fn,
//             this.type_id,
//             this.fallible,
//             this.is_exclusive,
//             this.is_send,
//             new SystemMeta(this.name),
//             null
//          )
//     }

//     [Symbol.toPrimitive] () {
//         return `System {
//             name: ${this.#meta.name},
//             is_exclusive: ${this.is_exclusive},
//             is_send: ${this.is_send}
//         }`
//     }

//     [Symbol.toStringTag] () {
//         return `System {
//             name: ${this.#meta.name},
//             is_exclusive: ${this.is_exclusive},
//             is_send: ${this.is_send}
//         }`
//     }
// }


function pipe<In, Out, Bin, Bout>(this: SystemMetadata<In, Out>, b: System<Bin, Bout>) {
    return new PipeSystem(this, b);
}

function set_name<In, Out>(this: SystemMetadata<In, Out>, new_name: string): SystemMetadata<In, Out> {
    this.meta.setName(new_name);
    return this;
}

function initialize<In, Out>(this: SystemMetadata<In, Out>, world: World) {
    if (this.state) {
        assert(this.state.matches_world(world.id), 'System built with a different world than the one it was added to');
    } else {
        const builder = new ParamBuilder(this.name);
        this.build_params(builder);
        const uninitialized = builder.uninitialized;
        const params = new Array(uninitialized.length);
        const param_states = new Array(uninitialized.length);
        for (let i = 0; i < uninitialized.length; i++) {
            const [ty, init_state] = uninitialized[i];
            params[i] = ty
            param_states[i] = init_state(world, this.meta);
        }

        this.state = new SystemState(this.meta, params, param_states, world.id, world.archetypes.generation);
    }

    this.meta.last_run = relative_to(world.changeTick, MAX_CHANGE_AGE);
}

function getLastRun(this: SystemMetadata<any, any>) {
    return this.meta.last_run;
}
function setLastRun(this: SystemMetadata<any, any>, tick: Tick) {
    this.meta.last_run = tick;
}

function checkChangeTick(this: SystemMetadata<any, any>, change_tick: Tick) {
    this.meta.last_run = check_system_change_tick(this.meta.last_run, change_tick, this.name);
}

function componentAccess(this: SystemMetadata<any, any>) {
    return this.meta.__component_access_set.combined_access();
}

function archetypeComponentAccess(this: SystemMetadata<any, any>) {
    return this.meta.__archetype_component_access;
}

function applyDeferred(this: SystemMetadata<any, any>, world: World) {
    const params = this.state!.param,
        state = this.state!.param_state;
    for (let i = 0; i < params.length; i++) {
        params[i].exec(state[i], this.meta, world);
    }
}

function queueDeferred(this: SystemMetadata<any, any>, world: DeferredWorld) {
    const params = this.state!.param,
        state = this.state!.param_state;
    for (let i = 0; i < params.length; i++) {
        params[i].queue(state[i], this.meta, world);
    }
}

function updateArchetypeComponentAccess(this: SystemMetadata<any, any>, _world: World) { }

function runUnsafe<In, Out>(this: SystemMetadata<In, Out>, input: In, world: World): Out {
    if (!this.state) {
        throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
    }

    const param_state = this.state.get(world);
    const system_params = input === unit ? param_state : [input, ...param_state];
    return this.func.call(this, ...system_params as any) as unknown as Out;
}

function run<In, Out>(this: System<In, Out>, input: In, world: World): Out {
    const ret = this.runWithoutApplyingDeferred!(input, world);
    this.applyDeferred!(world);
    return ret;
}

function runWithoutApplyingDeferred<In, Out>(this: System<In, Out>, input: In, world: World): Out {
    this.updateArchetypeComponentAccess!(world);
    return this.runUnsafe!(input, world);
}

function validateParam<In, Out>(this: System<In, Out>, world: World) {
    return this.validateParamUnsafe!(world);
}

function validateParamUnsafe(_world: World) {

}

function defaultSystemSets<In, Out>(this: System<In, Out>): InternedSystemSet[] {
    return [new SystemTypeSet(this)];
}

function processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfig<Schedulable>) {
    return schedule_graph.addSystemInner(config);
}

function intoSystem<In, Out>(this: SystemMetadata<In, Out>) {
    return this
}

function intoSystemSet(this: SystemMetadata<any, any>) {
    return new SystemTypeSet(this).intern();
}

function clone<S extends SystemMetadata<any, any>>(this: S) {
    const cloned = { ...this };
    cloned.meta = new SystemMeta(cloned.name);
    cloned.state = null;
    return cloned
}

function toString(this: System<any, any>) {
    return `System {
            name: ${this.name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`;
}


function SystemBase<
    In,
    Fn extends SystemFn<In, boolean>,
    Out extends ReturnType<Fn>
>(
    system_fn: Fn,
    build_params: (builder: ParamBuilder) => In,
    fallible: boolean,
    is_exclusive: boolean,
    is_send: boolean,
    type_id?: UUID
): SystemMetadata<In, Out> {
    type_id ??= v4() as UUID;
    const meta = new SystemMeta(system_fn.name);
    const system = {
        build_params: build_params,
        func: system_fn,
        type_id: type_id,
        system_type_id: type_id,
        get name() { return meta.name },
        fallible: fallible,
        meta: meta,
        state: null,
        get has_deferred() { return meta.hasDeferred },
        is_exclusive: is_exclusive,
        is_send: is_send
    } as unknown as SystemMetadata<In, Out>;

    system.pipe ??= pipe;

    system.setName ??= set_name;
    system.initialize ??= initialize;

    system.getLastRun ??= getLastRun;
    system.setLastRun ??= setLastRun;
    system.checkChangeTick ??= checkChangeTick;
    system.componentAccess ??= componentAccess;
    system.archetypeComponentAccess ??= archetypeComponentAccess;

    system.applyDeferred ??= applyDeferred;
    system.queueDeferred ??= queueDeferred;
    system.updateArchetypeComponentAccess ??= updateArchetypeComponentAccess;

    system.runUnsafe ??= runUnsafe;
    system.run ??= run;
    system.runWithoutApplyingDeferred ??= runWithoutApplyingDeferred;

    system.validateParam ??= validateParam;
    system.validateParamUnsafe ??= validateParamUnsafe;

    system.defaultSystemSets ??= defaultSystemSets;
    system.processConfig ??= processConfig;

    system.intoSystem ??= intoSystem;
    system.intoSystemSet ??= intoSystemSet;
    system.clone ??= clone;

    system[Symbol.toPrimitive] ??= toString;
    system[Symbol.toStringTag] ??= toString;

    return system;
}

function and<In, Out extends boolean, C extends Condition<any>>(this: Condition<In, Out>, other: C): AndCondition<Condition<In, Out>, C> {
    const a = this.intoSystem();
    const b = other.intoSystem();
    const name = `${a.name} && ${b.name}`;

    return new CombinatorSystem(AndMarker, a, b, name);
}

function nand<In, Out extends boolean, C extends Condition<any>>(this: Condition<In, Out>, other: C): NandCondition<Condition<In, Out>, C> {
    const a = this.intoSystem();
    const b = other.intoSystem();
    const name = `${a.name} && ${b.name}`;
    return new CombinatorSystem(NandMarker, a, b, name);
}

function or<In, Out extends boolean, C extends Condition<any>>(this: Condition<In, Out>, other: C): OrCondition<Condition<In, Out>, C> {
    const a = this.intoSystem();
    const b = other.intoSystem();
    const name = `${a.name} && ${b.name}`;
    return new CombinatorSystem(OrMarker, a, b, name);

}

function nor<In, Out extends boolean, C extends Condition<any>>(this: Condition<In, Out>, other: C): NorCondition<Condition<In, Out>, C> {
    const a = this.intoSystem();
    const b = other.intoSystem();
    const name = `${a.name} && ${b.name}`;
    return new CombinatorSystem(NorMarker, a, b, name);
}

function xor<In, Out extends boolean, C extends Condition<any>>(this: Condition<In, Out>, other: C): XorCondition<Condition<In, Out>, C> {
    const a = this.intoSystem();
    const b = other.intoSystem();
    const name = `${a.name} && ${b.name}`;
    return new CombinatorSystem(XorMarker, a, b, name) as XorCondition<Condition<In, Out>, C>;
}

function xnor<In, Out extends boolean, C extends Condition<any>>(this: Condition<In, Out>, other: C): XnorCondition<Condition<In, Out>, C> {
    const a = this.intoSystem();
    const b = other.intoSystem();
    const name = `${a.name} && ${b.name}`;
    return new CombinatorSystem(XnorMarker, a, b, name);
}

function ConditionBase<
    In,
    Fn extends SystemFn<In, boolean>,
    Out extends ReturnType<Fn>
>(condition: Partial<Condition<In, Out>>): Condition<In, Out> {

    condition.and ??= and;
    condition.nand ??= nand;
    condition.or ??= or;
    condition.nor ??= nor;
    condition.xor ??= xor;
    condition.xnor ??= xnor;

    return condition as Condition<In, Out>;
}

export interface SystemDefinition<In, Out> extends System<In, Out>, IntoScheduleConfig<Schedulable> { }

export function defineSystem<
    In,
    Fn extends SystemFn<In, any>,
    Out extends ReturnType<Fn>
>(
    system_params: (builder: ParamBuilder) => In,
    system_fn: Fn
): SystemDefinition<In, Out> {
    const system = SystemBase(
        system_fn,
        system_params,
        false,
        false,
        true,
    )

    IntoScheduleConfig(system);

    return system as unknown as SystemDefinition<In, Out>
}

export function defineCondition<
    In,
    Fn extends SystemFn<In, boolean>,
    Out extends ReturnType<Fn>
>(
    condition_params: (builder: ParamBuilder) => In,
    condition_fn: Fn
): Condition<In, Out> {
    const condition = SystemBase(
        condition_fn,
        condition_params,
        true,
        false,
        true
    ) as unknown as Condition<In, Out>;

    ConditionBase(condition);

    return condition;
}

// export {
//     defineParam
// } from 'ecs'
// type DS<T> = T extends SystemParam<infer State> ? State : never;
// type DI<T> = T extends SystemParam<any, infer Item> ? Item : never;

// export function defineParam<T extends SystemParam>(type: T): Required<SystemParam<DS<T>, DI<T>>> {
//     type.new_archetype ??= function new_archetype() { }
//     type.validate_param ??= function validate_param() { }
//     type.exec ??= function exec() { }
//     type.queue ??= function queue() { }

//     return type as Required<SystemParam<DS<T>, DI<T>>>;
// }