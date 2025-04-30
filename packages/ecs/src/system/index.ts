import { SystemMeta } from '.'
import { DeferredWorld, World } from '../world';
import { relative_to, Tick, MAX_CHANGE_AGE, Resource, Component } from '../component';
import { assert } from 'joshkaposh-iterator/src/util';
import { SystemState } from './function-system';
import { Option } from 'joshkaposh-option';
import { ParamBuilder } from './param-builder';
import { unit } from '../util';
import { And, AndMarker, Condition, Nand, NandMarker, Nor, NorMarker, Or, OrMarker, Xnor, XnorMarker, Xor, XorMarker } from '../schedule/condition';
import { System, SystemFn } from './system';
import { v4 } from 'uuid';
import { InternedSystemSet, SystemTypeSet } from '../schedule/set';
import { ScheduleGraph } from '../schedule';
import { IntoScheduleConfig, Schedulable, ScheduleConfig, ScheduleConfigs } from '../schedule/config';
import { Ambiguity, NodeId } from '../schedule/graph';
import { CombinatorSystem } from './combinator';
import { Commands } from './commands';
import { Res } from '../change_detection';
import { Local, SystemParam } from './system-param';
import { Event } from '../event';
import { With } from '../query';

export * from './system-param';
export { ParamBuilder } from './param-builder'
export * from './input';
export * from './system';
export * from './function-system';
export * from './query';

export const $is_system = Symbol('SYSTEM');


function SystemBase<
    In,
    Fallible extends boolean,
    Fn extends SystemFn<In, Fallible>,
    Out extends ReturnType<Fn>
>(
    params: (builder: ParamBuilder) => In,
    system: Fn & System<In, Out> & Partial<IntoScheduleConfig<Schedulable>>,
    fallible: boolean
): SystemDefinition<In, Out> {

    const system_meta = new SystemMeta(system.name);
    const TYPE_ID = v4() as UUID;

    Object.defineProperty(system, 'fallible', {
        get() {
            return fallible;
        },
        enumerable: false,
        configurable: false
    })

    Object.defineProperty(system, $is_system, {
        get() {
            return true;
        },
        enumerable: false,
        configurable: false
    })


    let state: Option<SystemState<any>>,
        system_name = system.name,
        system_params;

    Object.defineProperty(system, 'name', {
        get() {
            return system_name;
        }
    })

    // params(builder);

    // const system_has_deferred = builder.uninitialized.some(([type]) => type === Commands)
    // @ts-expect-error
    system.type_id = TYPE_ID;
    // @ts-expect-error
    system.system_type_id = TYPE_ID;

    Object.defineProperty(system, 'has_deferred', {
        get() {
            return system_meta.hasDeferred;
        },
    })
    // @ts-expect-error
    system.is_exclusive = false;
    // @ts-expect-error
    system.is_send = true;

    system.setName = function set_name(new_name: string) {
        system_name = new_name;
        return system as System<In, Out>;
    }

    system.initialize = function initialize(world: World) {
        if (state) {
            assert(state.matches_world(world.id), 'System built with a different world than the one it was added to');
        } else {

            const builder = new ParamBuilder(system_name);
            params(builder);
            const uninitialized = builder.uninitialized;
            const parameters = new Array(uninitialized.length);
            const param_states = new Array(uninitialized.length);
            for (let i = 0; i < uninitialized.length; i++) {
                parameters[i] = uninitialized[i][0];
                param_states[i] = uninitialized[i][1](world, system_meta);
            }

            state = new SystemState(system_meta, parameters, param_states, world.id, world.archetypes.generation);
        }

        system_meta.last_run = relative_to(world.changeTick, MAX_CHANGE_AGE);
    }

    system.getLastRun = function getLastRun() {
        return system_meta.last_run;
    }
    system.setLastRun = function getLastRun(tick: Tick) {
        system_meta.last_run = tick;
    }

    system.checkChangeTick = function checkChangeTick(tick: Tick) {

    }

    system.componentAccess = function componentAccess() {
        return system_meta.__component_access_set.combined_access();
    }

    system.archetypeComponentAccess = function archetypeComponentAccess() {
        return system_meta.__archetype_component_access;
    }

    system.applyDeferred = function applyDeferred(_world: World) {
        // const param_state = state!.param;
    }

    system.queueDeferred = function queueDeferred(_world: DeferredWorld) { }

    system.updateArchetypeComponentAccess = function updateArchetypeComponentAccess(world: World) { }

    system.runUnsafe = function runUnsafe(input: In, world: World): Out {
        if (!state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }

        const param_state = state.get(world);
        const system_params = input === unit ? param_state : [input, ...param_state];
        return system.call(this, ...system_params as any) as unknown as Out;
    }

    system.run = function run(input: In, world: World): Out {
        const ret = this.runWithoutApplyingDeferred(input, world);
        this.applyDeferred(world);
        return ret;
    }

    system.runWithoutApplyingDeferred = function (input: In, world: World): Out {
        this.updateArchetypeComponentAccess(world);
        return this.runUnsafe(input, world);
    }

    system.validateParam = function validateParam(world: World) {
        return this.validateParamUnsafe(world);
    }

    system.validateParamUnsafe = function validateParamUnsafe(_world: World) {

    }

    system.defaultSystemSets = function defaultSystemSets(): InternedSystemSet[] {
        return [new SystemTypeSet(this)];
    }
    system.processConfig = function processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfigs): NodeId {
        const id = schedule_graph.addSystemInner(config as ScheduleConfig<Schedulable>);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    system.intoSystem = function intoSystem() {
        return system;
    }

    system.intoSystemSet = function intoSystem_set() {
        return new SystemTypeSet(this);
    }

    system.intoConfig = function into_config(): ScheduleConfigs {
        const sets = this.defaultSystemSets();
        return new ScheduleConfig(
            this as any,
            {
                hierarchy: sets,
                dependencies: [],
                ambiguous_with: Ambiguity.default()
            },
            []
        )
    }

    system[Symbol.toPrimitive] = function () {
        return `System {
            name: ${system_name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`
    }

    system[Symbol.toStringTag] = function () {
        return `System {
            name: ${system_name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`
    }

    return system as SystemDefinition<In, Out>

}

interface SystemDefinition<In, Out> extends System<In, Out>, IntoScheduleConfig<Schedulable> { }

export function defineSystem<
    In,
    Fn extends SystemFn<In, any>,
    Out extends ReturnType<Fn>
>(
    params: (builder: ParamBuilder) => In,
    system: Fn & Omit<Partial<System<In, Out>>, 'name'>
): SystemDefinition<In, Out> {

    SystemBase(params, system as unknown as SystemFn<In, Out, false> & System<In, Out>, false);
    IntoScheduleConfig(system as unknown as Schedulable);

    return system as unknown as SystemDefinition<In, Out>
}

export function defineCondition<
    In,
    Fn extends SystemFn<In, boolean>,
    Out extends ReturnType<Fn>
>(
    params: (builder: ParamBuilder) => In,
    condition: Fn & Omit<Partial<Condition<In, Out>>, 'name'>
): Condition<In, Out> {

    SystemBase(params, condition as Fn & Condition<In, Out>, true);

    condition.and = function and<C extends Condition<any>>(other: C): And<Condition<In, Out>, C> {
        const a = this.intoSystem!() as Condition<In, Out>;
        const b = other.intoSystem() as C;
        const name = `${a.name} && ${b.name}`;

        return new CombinatorSystem(new AndMarker(), a, b, name);
    }

    condition.nand = function nand<C extends Condition<any>>(other: C): Nand<Condition<In, Out>, C> {
        const a = this.intoSystem!() as System<In, any>;
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
        return new CombinatorSystem(new NandMarker(), a, b, name) as any;
    }

    condition.or = function <C extends Condition<any>>(other: C): Or<Condition<In, Out>, C> {
        const a = this.intoSystem!() as System<In, any>;
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
        return new CombinatorSystem(new OrMarker(), a, b, name) as any;

    }

    condition.nor = function <C extends Condition<any>>(other: C): Nor<Condition<In, Out>, C> {
        const a = this.intoSystem!() as System<In, any>;
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
        return new CombinatorSystem(new NorMarker(), a, b, name) as any;

    }

    condition.xor = function <C extends Condition<any>>(other: C): Xor<Condition<In, Out>, C> {
        const a = this.intoSystem!() as System<In, any>;
        const b = other.intoSystem();
        const name = `${a.name} && ${b.name}`;
        return new CombinatorSystem(new XorMarker(), a, b, name) as any;
    }

    condition.xnor = function <C extends Condition<any>>(other: C): Xnor<Condition<In, Out>, C> {
        const a = this.intoSystem!() as Condition<In, Out>;
        const b = other.intoSystem() as C;
        const name = `${a.name} && ${b.name}`;
        return new CombinatorSystem(new XnorMarker(), a, b, name);
    }

    return condition as Condition<In, Out>;
}

/**
 * @returns true if and only if this condition has never been called before
 */
export const run_once = defineCondition(b => b.local(false), function run_once(has_run) {
    if (!has_run.value) {
        has_run.value = true;
        return true;
    }
    return false;
})


export const resource_exists = <T extends Resource>(resource: T) => defineCondition(b => b.optRes(resource), function resource_exists(resource) {
    return resource != null;
})

export const resource_equals = <T extends Resource>(value: T, compare?: (a: T, b: T) => boolean) => defineCondition(b => b.res(value), function resource_equals(resource) {
    const res = resource.v;
    return compare?.call(null, value, res) ?? value === res;
})

export const resource_exists_and_equals = <T extends Resource>(value: T, compare?: (a: T, b: T) => boolean) => defineCondition(b => b.optRes(value), function resource_equals(resource) {
    if (!resource) {
        return false;
    }
    const res = resource.v;
    return compare?.call(null, value, res) ?? value === res;
})

export function resource_added<T extends Resource>(resource: T) {
    return defineCondition(b => b.optRes(resource), function resource_added(res) {
        return res?.isAdded() ?? false;
    })
}

export function resource_changed<T extends Resource>(resource: T) {
    return defineCondition(b => b.world().res(resource), function resource_added(w, res) {
        return res.hasChangedSince(w.lastChangeTick);
    })
}

export const resource_exists_and_changed = <T extends Resource>(resource: T) => defineCondition(b => b.optRes(resource), function resource_exists_and_changed(res) {
    return res?.isChanged() ?? false;
})


export function resource_changed_or_removed<T extends Resource>(res: Option<Res<T>>, existed: Local<boolean>): boolean {
    if (res) {
        existed.value = true;
        return res.isChanged();
    } else if (existed) {
        existed.value = false;
        return true;
    } else {
        return false;
    }
}

// export function resource_removed<T extends Resource>(res: Option<Res<T>>, existed: Local<boolean>) {
//     if (is_some(res)) {
//         existed.value = true;
//         return false;
//     } else if (existed) {
//         existed.value = false;
//         return true;
//     } else {
//         return false;
//     }
// }

export const resource_removed = <T extends Resource>(resource: T) => defineCondition(b => b.optRes(resource).local(false), function resource_removed(res, existed) {
    if (res) {
        existed.value = true;
        return false;
    } else if (existed.value) {
        existed.value = false;
        return true;
    } else {
        return false;
    }
})


// export function on_event<T extends Event>(reader: EventReader<T>): boolean {
//     return reader.read().len() > 0;
// }

export const on_event = <T extends Event>(event: T) => defineCondition(b => b.reader(event), function on_event(reader) {
    return reader.read().length > 0;
})


export const any_with_component = <T extends Component>(component: T) => defineCondition(b => b.queryFiltered([], [With(component)]), function any_with_component(query) {
    return !query.is_empty();
})

export const any_removed_component = <T extends Component>(component: T) => defineCondition(b => b.removedComponent(component), function any_removed_component(removals) {
    return removals.isEmpty;
})