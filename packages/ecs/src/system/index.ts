// import { v4 } from 'uuid';
// import type { Option } from 'joshkaposh-option';
// import { assert } from 'joshkaposh-iterator/src/util';
// import { SystemMeta, SystemState } from './function-system';
// import { ParamBuilder } from './param-builder';
// import { CombinatorSystem, PipeSystem } from './combinator';
// import { check_system_change_tick, System, SystemFn } from './system';
// import type { DeferredWorld, World } from '../world';
// import { relative_to, type Tick } from '../component';
// import { type ScheduleGraph, type InternedSystemSet, SystemTypeSet, IntoScheduleConfig, type Schedulable, ScheduleConfig, type AndCondition, AndMarker, type Condition, type NandCondition, NandMarker, type NorCondition, NorMarker, type OrCondition, OrMarker, type XnorCondition, XnorMarker, type XorCondition, XorMarker } from '../schedule';
// import { MAX_CHANGE_AGE } from '../change_detection';
// import { type TypeId, unit } from '../util';

export * from './system-param';
export * from './commands';
export * from './query';
export * from './param-builder'
export * from './input';
export * from './system';
export * from './function-system';
export * from './combinator';

// interface SystemBase extends TypeId {
//     readonly name: string;
//     readonly system_type_id: UUID;
//     readonly fallible: boolean;
//     readonly has_deferred: boolean;
//     readonly is_exclusive: boolean;
//     readonly is_send: boolean;

//     meta: SystemMeta;
//     state: Option<SystemState<any>>;
// }

// function SystemBase<
//     In,
//     Fn extends SystemFn<In, boolean>,
//     Out extends ReturnType<Fn>
// >(
//     system_fn: Fn,
//     system_params: (builder: ParamBuilder) => In,
//     fallible: boolean,
//     is_exclusive: boolean,
//     is_send: boolean,
//     type_id?: UUID
// ): System<In, Out> {
//     type_id ??= v4() as UUID;
//     const meta = new SystemMeta(system_fn.name);
//     const system = {
//         type_id: type_id,
//         system_type_id: type_id,
//         get name() { return meta.name },
//         fallible: fallible,
//         meta: meta,
//         state: null,
//         get has_deferred() { return meta.hasDeferred },
//         is_exclusive: is_exclusive,
//         is_send: is_send
//     } as unknown as System<In, Out> & { meta: SystemMeta; state: SystemState<any> };

//     system.pipe ??= function pipe(b) {
//         return new PipeSystem(this, b);
//     }

//     system.setName ??= function set_name(new_name: string) {
//         this.meta.setName(new_name);
//         return system as System<In, Out>;
//     }

//     system.initialize ??= function initialize(world: World) {
//         if (system.state) {
//             assert(system.state.matches_world(world.id), 'System built with a different world than the one it was added to');
//         } else {
//             const builder = new ParamBuilder(system.name);
//             system_params(builder);
//             const uninitialized = builder.uninitialized;
//             const params = new Array(uninitialized.length);
//             const param_states = new Array(uninitialized.length);
//             for (let i = 0; i < uninitialized.length; i++) {
//                 params[i] = uninitialized[i][0];
//                 param_states[i] = uninitialized[i][1](world, system.meta);
//             }

//             system.state = new SystemState(system.meta, params, param_states, world.id, world.archetypes.generation);
//         }

//         system.meta.last_run = relative_to(world.changeTick, MAX_CHANGE_AGE);
//     }

//     system.getLastRun ??= function getLastRun() {
//         return this.meta.last_run;
//     }
//     system.setLastRun ??= function getLastRun(tick: Tick) {
//         this.meta.last_run = tick;
//     }

//     system.checkChangeTick ??= function checkChangeTick(change_tick: Tick) {
//         this.meta.last_run = check_system_change_tick(this.meta.last_run, change_tick, this.name);
//     }

//     system.componentAccess ??= function componentAccess() {
//         return this.meta.__component_access_set.combined_access();
//     }

//     system.archetypeComponentAccess ??= function archetypeComponentAccess() {
//         return this.meta.__archetype_component_access;
//     }

//     system.applyDeferred ??= function applyDeferred(world: World) {
//         const params = this.state.param,
//             state = this.state.param_state;
//         for (let i = 0; i < params.length; i++) {
//             params[i].exec(state[i], this.meta, world)
//         }
//     }

//     system.queueDeferred ??= function queueDeferred(world: DeferredWorld) {
//         const params = this.state.param,
//             state = this.state.param_state;
//         for (let i = 0; i < params.length; i++) {
//             params[i].queue(state[i], this.meta, world)
//         }

//     }

//     system.updateArchetypeComponentAccess ??= function updateArchetypeComponentAccess(_world: World) { }

//     system.runUnsafe ??= function runUnsafe(input: In, world: World): Out {
//         if (!this.state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }

//         const param_state = this.state.get(world);
//         const system_params = input === unit ? param_state : [input, ...param_state];
//         return system_fn.call(this, ...system_params as any) as unknown as Out;
//     }

//     system.run ??= function run(input: In, world: World): Out {
//         const ret = this.runWithoutApplyingDeferred!(input, world);
//         this.applyDeferred!(world);
//         return ret;
//     }

//     system.runWithoutApplyingDeferred ??= function (input: In, world: World): Out {
//         this.updateArchetypeComponentAccess!(world);
//         return this.runUnsafe!(input, world);
//     }

//     system.validateParam ??= function validateParam(world: World) {
//         return this.validateParamUnsafe!(world);
//     }

//     system.validateParamUnsafe ??= function validateParamUnsafe(_world: World) {

//     }

//     system.defaultSystemSets ??= function defaultSystemSets(): InternedSystemSet[] {
//         return [new SystemTypeSet(this as TypeId)];
//     }

//     system.processConfig ??= function processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfig<Schedulable>) {
//         return schedule_graph.addSystemInner(config as ScheduleConfig<Schedulable>);
//     }

//     system.intoSystem ??= function intoSystem() {
//         return system as System<In, Out>;
//     }

//     system.intoSystemSet ??= function intoSystemSet() {
//         return new SystemTypeSet(this as TypeId).intern();
//     }

//     system.clone = function clone() {
//         const cloned = { ...system } as unknown as SystemBase;
//         cloned.meta = new SystemMeta(cloned.name);
//         cloned.state = null;
//         return cloned as unknown as System<In, Out>;
//     }


//     system[Symbol.toPrimitive] ??= function () {
//         return `System {
//             name: ${this.name},
//             is_exclusive: ${this.is_exclusive},
//             is_send: ${this.is_send}
//         }`
//     }

//     system[Symbol.toStringTag] ??= function () {
//         return `System {
//             name: ${this.name},
//             is_exclusive: ${this.is_exclusive},
//             is_send: ${this.is_send}
//         }`
//     }

//     return system as System<In, Out>;

// }

// function ConditionBase<
//     In,
//     Fn extends SystemFn<In, boolean>,
//     Out extends ReturnType<Fn>
// >(condition: Condition<In, Out>) {
//     condition.and = function and<C extends Condition<any>>(other: C): AndCondition<Condition<In, Out>, C> {
//         const a = this.intoSystem!() as Condition<In, Out>;
//         const b = other.intoSystem() as C;
//         const name = `${a.name} && ${b.name}`;

//         return new CombinatorSystem(new AndMarker(), a, b, name) as AndCondition<Condition<In, Out>, C>;
//     }

//     condition.nand = function nand<C extends Condition<any>>(other: C): NandCondition<Condition<In, Out>, C> {
//         const a = this.intoSystem!() as System<In, any>;
//         const b = other.intoSystem();
//         const name = `${a.name} && ${b.name}`;
//         return new CombinatorSystem(new NandMarker(), a, b, name) as NandCondition<Condition<In, Out>, C>;;
//     }

//     condition.or = function <C extends Condition<any>>(other: C): OrCondition<Condition<In, Out>, C> {
//         const a = this.intoSystem!() as System<In, any>;
//         const b = other.intoSystem();
//         const name = `${a.name} && ${b.name}`;
//         return new CombinatorSystem(new OrMarker(), a, b, name) as OrCondition<Condition<In, Out>, C>;;

//     }

//     condition.nor = function <C extends Condition<any>>(other: C): NorCondition<Condition<In, Out>, C> {
//         const a = this.intoSystem!() as System<In, any>;
//         const b = other.intoSystem();
//         const name = `${a.name} && ${b.name}`;
//         return new CombinatorSystem(new NorMarker(), a, b, name) as NorCondition<Condition<In, Out>, C>;

//     }

//     condition.xor = function <C extends Condition<any>>(other: C): XorCondition<Condition<In, Out>, C> {
//         const a = this.intoSystem!() as System<In, any>;
//         const b = other.intoSystem();
//         const name = `${a.name} && ${b.name}`;
//         return new CombinatorSystem(new XorMarker(), a, b, name) as XorCondition<Condition<In, Out>, C>;
//     }

//     condition.xnor = function <C extends Condition<any>>(other: C): XnorCondition<Condition<In, Out>, C> {
//         const a = this.intoSystem!() as Condition<In, Out>;
//         const b = other.intoSystem() as C;
//         const name = `${a.name} && ${b.name}`;
//         return new CombinatorSystem(new XnorMarker(), a, b, name);
//     }

// }

// export interface SystemDefinition<In, Out> extends System<In, Out>, IntoScheduleConfig<Schedulable> { }

// export function defineSystem<
//     In,
//     Fn extends SystemFn<In, any>,
//     Out extends ReturnType<Fn>
// >(
//     system_params: (builder: ParamBuilder) => In,
//     system_fn: Fn & Omit<Partial<System<In, Out>>, 'name'>
// ): SystemDefinition<In, Out> {
//     const system = SystemBase(
//         system_fn,
//         system_params,
//         false,
//         false,
//         true,
//     )

//     IntoScheduleConfig(system);

//     return system as unknown as SystemDefinition<In, Out>
// }

// export function defineCondition<
//     In,
//     Fn extends SystemFn<In, boolean>,
//     Out extends ReturnType<Fn>
// >(
//     condition_params: (builder: ParamBuilder) => In,
//     condition_fn: Fn
// ): Condition<In, Out> {
//     const condition = SystemBase(
//         condition_fn,
//         condition_params,
//         true,
//         false,
//         true
//     ) as Condition<In, Out>;

//     ConditionBase(condition);

//     // condition.clone = function clone() {
//     //     const cloned = { ...condition } as unknown as SystemBase<Condition<In, Out>>
//     //     cloned.meta = new SystemMeta(cloned.name);
//     //     cloned.state = null;
//     //     return cloned as unknown as Condition<In, Out>;
//     // }

//     return condition as unknown as Condition<In, Out>;
// }
