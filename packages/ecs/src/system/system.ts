import { v4 } from "uuid";
import { ErrorExt, Option, Result } from "joshkaposh-option";
import { TODO } from "joshkaposh-iterator/src/util";
import { DeferredWorld, World } from "../world";
import { Access } from "../query";
import { SystemParamValidationError, check_tick, ParamBuilder, relative_to, Tick, MAX_CHANGE_AGE, Condition } from "..";
import { unit } from "../util";
import { InternedSystemSet, IntoSystemSet, SystemSet, SystemTypeSet } from "../schedule/set";
import { ScheduleConfig, ScheduleConfigs } from "../schedule/config";
import { ProcessScheduleConfig, ScheduleGraph } from "../schedule/schedule";
import { Ambiguity, NodeId } from "../schedule/graph";
export type SystemIn<S> = S extends System<infer In, any> ? In : never;

export type SystemFn<P, Out, Fallible extends boolean = false> = (...args: P extends any[] ? P : P extends ParamBuilder<infer Args> ? Args : never) => Fallible extends false ? Out : boolean;


export interface IntoSystem<In, Out> {
    intoSystem(): System<In, Out>;
}

export interface System<In, Out> extends IntoSystemSet<any>, IntoSystem<In, Out>, ProcessScheduleConfig {
    /**
     * Property indicating if this system returns a boolean.
     */
    readonly fallible: boolean;

    /**
     * The `type_id` unique to this system.
     */
    readonly type_id: UUID;

    /**
     * The `type_id` unique to this system.
     */
    readonly system_type_id: UUID;

    /**
     * The name of this system. This can be configured via `.set_name` if the provided function to create this system was anonymous
     * to provide a more descriptive name.
     */
    readonly name: string;

    /**
     * @returns true if this system has any deferred parameters such as [`Commands`]. These parameters will be queued for later execution.
     */
    readonly has_deferred: boolean;

    /**
     * @returns true if this system cannot be executed in parallel.
     */
    readonly is_exclusive: boolean;

    /**
     * @returns true if this system can be sent across threads.
     */
    readonly is_send: boolean;

    /**
     * Sets the name for this system. This is useful if the function this system was created with was anonymous
     * and you wish to use a more descriptive name.
     */
    setName(new_name: string): System<In, Out>;

    /**
     * Initializes this system and its parameters.
     * 
     * @throws This method will throw an Error if conflicting access occurs.
     */
    initialize(world: World): void;

    /**
     * @returns the tick this system was last run.
     */
    getLastRun(): Tick;

    /**
     * Overwrites the tick indicating the last time this system ran.
     * 
     * **Warning**
     * This is a complex and error-prone operation, that can have unexpected consequences on any system relying on this code.
     * However, it can be an essential escape hatch when
     * you are trying to synchronize representations using change detection and need to avoid infinite recursion.
     */
    setLastRun(tick: Tick): void;

    /**
     * Checks any [`Tick`]s stored on this system and wraps their value if they get too old.
     * 
     * This method must be called periodically to ensure that change detection behaves correctly.
     * When using the ecs' default configuration, this will be called for you as needed.
     */
    checkChangeTick(tick: Tick): void;

    /**
     * @returns the [`Component`] access for this system.
     */
    componentAccess(): Access;

    /**
     * @returns the Archetypal [`Component`] access for this system.
     */
    archetypeComponentAccess(): Access;

    /**
     * Updates the system's archetype component [`Access`].
     * 
     * **Note for implementers**
     * `world` must only be used to access metadata.
     */
    updateArchetypeComponentAccess(world: World): void;

    /**
     * Executes the system with the given input in the world. Unlike [`System.run`], this method
     * can be called in parallel with other systems.
     * 
     * **Safety**
     * 
     * - The caller must ensure that any permissions registered in `archetype_component_access` do not conflict.
     * 
     * - The method [`System.update_archetype_component_access`] must be called at some point before this one, with the same exact [`World`].
     * If [`System.update_archetype_component_access`] throws (or otherwise does not return for any reason),
     * this method must not be called.
     */
    runUnsafe(input: In, world: World): Out;

    /**
     * Executes the system with the given input in the world.
     * 
     * Unlike [`System.run_unsafe`], this will apply deferred parameters *immediately*.
     */
    run(input: In, world: World): Out;

    /**
     * Executes the system with the given input in the world.
     */
    runWithoutApplyingDeferred(input: In, world: World): Out

    /**
     * Applies any deferred parameters such as [`Commands`].
     */
    applyDeferred(world: World): void;

    /**
     * Queues any deferred parameters such as [`Commands`] to be later executed.
     */
    queueDeferred(world: DeferredWorld): void;

    /**
     * Validates that all parameters can be acquired and that system can run without throwing an error.
     * Built-in executors use this to prevent invalid systems from running.
     * 
     * However calling and respecting [`System.validate_param_unsafe`] or it's safe variant is not a strict requirement,
     * both [`System.run`] and [`System.run_unsafe`] should provide their own safety mechanism to prevent undefined behaviour.
     * 
     * This method has to be called directly before [`System.run_unsafe`] with no other (relevant) world mutations in-between.
     * Otherwise, while it won't lead to undefined behaviour, the validity of the param may change.
     * 
     * **Safety**
     * 
     * - The caller must ensure that no conflicting access occur.
     * - The method [`System.update_archetype_component_access`] must be called at some point before this one, with the same exact [`World`].
     * If [`System.update_archetype_component_access`] throws (or does not return for any reason), this method must not be called.
     * 
     * 
     * @returns nothing if this system does not have any conflicting accesses.
     */
    validateParamUnsafe(world: World): Result<Option<void>, SystemParamValidationError>;

    /**
     * Safe version of [`System.validate_param_unsafe`]
     * that runs on exclusive, single-threaded `world` pointer.
     * @returns nothing if this system does not have any conflicting accesses.
     */
    validateParam(world: World): Result<Option<void>, SystemParamValidationError>;

    /**
     * @returns the system's default system sets.
     * Each system will create a default system set that contains the system.
     */
    defaultSystemSets(): InternedSystemSet[];

    [Symbol.toPrimitive](): string;
    [Symbol.toStringTag](): string;
}

export function check_system_change_tick(last_run: Tick, this_run: Tick, system_name: string) {
    if (check_tick(last_run, this_run)) {
        const age = relative_to(this_run, last_run);
        console.warn(`System ${system_name} has not run for ${age} ticks. Changes older than ${MAX_CHANGE_AGE - 1} will not be detected.`)
        return relative_to(this_run, Tick.MAX);
    }
    return this_run;
}

export type RunSystemOnce = {
    run_system_once<Out, T extends IntoSystem<unit, Out>>(system: T): void;
    run_system_once_with<Out, T extends IntoSystem<any, Out>>(system: T): void;
}

export type RunSystemError = ErrorExt<string>;
export const RunSystemError = {
    InvalidParams(name: string) {
        return new ErrorExt(name);
    }
} as const;

export type BoxedSystem<In extends any[] = any[], Out = void | boolean> = System<In, Out>;
export type SystemId = number;


export function assert_is_system(system: System<any, any>) {
    const world = new World();
    system.initialize(world);
}

export class ApplyDeferred implements System<unit, unit> {
    static readonly type_id: UUID = v4() as UUID;

    readonly fallible = false;

    readonly name = 'joshkaposh-ecs: apply_deferred';
    readonly is_send = false;
    readonly is_exclusive = true;
    readonly has_deferred = false;

    readonly system_type_id = ApplyDeferred.type_id;
    readonly type_id = ApplyDeferred.type_id;

    setName(_new_name: string): System<typeof unit, typeof unit> {
        console.warn('Cannot customize ApplyDeferred name')
        return this;
    }


    processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfigs): NodeId {
        return schedule_graph.addSystemInner(config as any) as any;
    }

    intoConfig(): ScheduleConfigs {
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

    intoSystem(): System<typeof unit, typeof unit> {
        return this
    }

    inSet(set: SystemSet): ScheduleConfigs {
        return this.intoConfig().inSet(set)
        // throw new Error('ApplyDeferred cannot be configured. This methods are implemented for consistency across types.')
    }

    before<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().before(set)
    }

    beforeIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().beforeIgnoreDeferred(set)
    }

    after<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().after(set)
    }

    afterIgnoreDeferred<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().afterIgnoreDeferred(set)
    }

    distributiveRunIf<M>(condition: Condition<M, boolean>): ScheduleConfigs {
        return this.intoConfig().distributiveRunIf(condition)
    }

    runIf<M>(condition: Condition<M, boolean>): ScheduleConfigs {
        return this.intoConfig().runIf(condition)
    }

    ambiguousWith<M>(set: IntoSystemSet<M>): ScheduleConfigs {
        return this.intoConfig().ambiguousWith(set)
    }

    ambiguousWithAll(): ScheduleConfigs {
        return this.intoConfig().ambiguousWithAll()
    }

    chain(): ScheduleConfigs {
        return this.intoConfig().chain();
    }

    chainIgnoreDeferred(): ScheduleConfigs {
        return this.intoConfig().chainIgnoreDeferred();
    }

    componentAccess(): Access {
        return TODO('class ApplyDeferred.component_access()')
    }

    archetypeComponentAccess(): Access {
        return TODO('class ApplyDeferred.archetype_component_access()')
    }

    run(input: unit, world: World): unit {
        const ret = this.runWithoutApplyingDeferred(input, world);
        this.applyDeferred(world);
        return ret as unit;
    }

    runUnsafe(_input: SystemIn<System<unit, unit>>, _world: World): unit {
        return unit;
    }

    runWithoutApplyingDeferred(input: unit, world: World): unit {
        this.updateArchetypeComponentAccess(world);

        return this.runUnsafe(input, world);
    }

    applyDeferred(_world: World): void { }

    queueDeferred(_world: DeferredWorld): void { }

    validateParamUnsafe(_world: World): Result<Option<void>, SystemParamValidationError> {

    }

    validateParam(_world: World): Result<Option<void>, SystemParamValidationError> {

    }

    initialize(_world: World): void { }

    updateArchetypeComponentAccess(_world: World): void { }

    checkChangeTick(_change_tick: Tick): void { }

    defaultSystemSets(): InternedSystemSet[] {
        return [new SystemTypeSet(this as any)];
    }

    getLastRun(): Tick {
        return MAX_CHANGE_AGE;
    }

    setLastRun(_last_run: Tick): void { }

    intoSystemSet() {
        return new SystemTypeSet(this as any);
    }

    [Symbol.toPrimitive]() {
        return `System {
            name: ${this.name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`
    }

    [Symbol.toStringTag]() {
        return `System {
            name: ${this.name},
            is_exclusive: ${this.is_exclusive},
            is_send: ${this.is_send}
        }`
    }
}
