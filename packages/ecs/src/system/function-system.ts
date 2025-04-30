import { assert, TODO } from "joshkaposh-iterator/src/util";
import { ArchetypeGeneration } from "../archetype";
import { relative_to, Tick } from "../tick";
import { Access, FilteredAccessSet } from "../query";
import { DeferredWorld, World, WorldId } from "../world";
import { SystemParam, SystemParamItem } from "./system-param";
import { ErrorExt, Option, Result } from "joshkaposh-option";
// import { SystemInput } from "./input";
// import { SystemTypeSet } from "../schedule/set";
import { ParamBuilder } from "./param-builder";
// import { check_system_change_tick } from "./system";
import { MAX_CHANGE_AGE } from "../change_detection";
import { check_system_change_tick, System, SystemParamValidationError } from "./system";
import { InternedSystemSet, SystemSet, SystemTypeSet } from "../schedule/set";
import { unit } from "../util";
import { ScheduleBuildError, ScheduleGraph } from "../schedule";
import { Schedulable, ScheduleConfig, ScheduleConfigs } from "../schedule/config";
import { NodeId } from "../schedule/graph";

/**
 * The metadata of a [`System`].
 */
export class SystemMeta {
    /**
     * The set of component accesses for this system. This is used to determine:
     * - soundness issues (e.g. multiple [`SystemParam`]s mutably accessing the same component)
     * -ambiguities in the schedule (e.g. two systems that have some sort of conflicting access)
     */
    __component_access_set: FilteredAccessSet;
    /**
     * This [`Access`] is used to determine which systems can run in parallel with each other
     * in the multithreaded executor.
     * 
     * We use a [`ArchetypeComponentId`] as it is more precise than just checking [`ComponentId`]:
     * for example if you have one system with `Query<[mut<T>], [With<A>]>` and one system with `Query<[mut<T>], [With<B>]>`
     * they conflict if you just look at the [`ComponentId`] of `T`, but if there are no archetypes with
     * both `A`, `B`, and `T` then there's no risk of conflict. By using [`ArchetypeComponentId`]
     * we can be more precise because we can check if the existing archetypes in the [`World`] cause a conflict
     */
    __archetype_component_access: Access;
    // __param_warn_policy: ParamWarnPolicy
    #name: string;
    #is_send: boolean;
    #has_deferred: boolean;
    last_run: Tick;

    constructor(
        name: string,
        archetype_component_access = new Access(),
        component_access_set = new FilteredAccessSet(),
        is_send = true,
        has_deferred = false,
        last_run = 0,
    ) {
        this.#name = name;
        this.__archetype_component_access = archetype_component_access;
        this.__component_access_set = component_access_set;
        this.last_run = last_run;
        this.#is_send = is_send;
        this.#has_deferred = has_deferred;
    }

    /**
     * The name of the system this [`SystemMeta`] is for.
     */
    get name(): string {
        return this.#name;
    }

    /**
     * Useful for giving closure functions more readable names for debugging and tracing. 
     */
    setName(new_name: string) {
        this.#name = new_name
    }

    get isSend(): boolean {
        return this.#is_send
    }

    setNonSend(): void {
        this.#is_send = false;
    }

    get hasDeferred(): boolean {
        return this.#has_deferred;
    }

    setHasDeferred(): void {
        this.#has_deferred = true;
    }

    archetypeComponentAccess() {
        return this.__archetype_component_access
    }

    componentAccessSet() {
        return this.__component_access_set;
    }

    clone(): SystemMeta {
        return new SystemMeta(
            this.#name,
            this.__archetype_component_access.clone(),
            this.__component_access_set.clone(),
            this.#is_send,
            this.#has_deferred,
            this.last_run,
        )
    }
}

type ParamState<T> = T extends SystemParam<infer State> ? State : never;
type ParamItem<T> = T extends SystemParam<any, infer Item> ? Item : never;


export class SystemState<Param extends SystemParam> {
    #meta: SystemMeta;
    #params: Param[];
    #param_states: ParamState<Param>[];
    #world_id: WorldId;
    #archetype_generation: ArchetypeGeneration;

    constructor(
        meta: SystemMeta,
        params: Param[],
        param_states: ParamState<Param>[],
        world_id: WorldId,
        archetype_generation: ArchetypeGeneration
    ) {
        this.#meta = meta;
        this.#params = params;
        this.#param_states = param_states;
        this.#world_id = world_id;
        this.#archetype_generation = archetype_generation;
    }

    static new<Param extends SystemParam>(world: World, params: Param[]): SystemState<Param> {
        // TODO: check what this is
        // @ts-expect-error
        const name = params.name;
        const meta = new SystemMeta(name);
        meta.last_run = relative_to(world.changeTick, Tick.MAX);
        const param_state = params.map(p => p.init_state(world, meta));
        return new SystemState(meta, params, param_state, world.id, ArchetypeGeneration.initial())

    }

    static fromBuilder<Param extends SystemParam>(world: World, builder: ParamBuilder<any[]>) {
        TODO('SystemState.from_builder()')
    }

    static apply(world: World) {
        // this.#param.apply(this.#param_state, this.#meta, world);
    }

    static validate_param(world: World) {
        // return this.#param.validate_param(this.#param_state, this.#meta, world);
    }

    get meta(): SystemMeta {
        return this.#meta;
    }

    build_any_system<Marker, Fn extends SystemParamFunction<Marker>>(marker: Marker, func: Fn) {
        return new FunctionSystem(
            func,
            new FunctionSystemState(this.#param_states as any, this.#world_id),
            this.#meta,
            this.#archetype_generation,
            marker
        )
    }

    /**
     * @summary Retrieve the [`SystemParam`] values. This can only be called when all parameters are read-only.
     */
    get(world: World) {
        this.validate_world(world.id);
        this.update_archetypes(world);
        return this.get_unchecked_manual(world);
    }

    get_mut(world: World) {
        this.validate_world(world.id);
        // this.update_archetypes(world);
        return this.get_unchecked_manual(world);
    }

    matches_world(world_id: WorldId) {
        return this.#world_id === world_id
    }

    validate_world(world_id: WorldId) {
        if (!this.matches_world(world_id)) {
            throw new Error(`Encountered a mismatched World. This SystemState was created from ${this.#world_id}, but a method was called using ${world_id}`)
        }
    }

    update_archetypes(world: World) {
        assert(this.#world_id === world.id, 'Encountered a mismatched World. A System cannot be used with Worlds other than the one it was initialized with.')

        const archetypes = world.archetypes;
        const old_generation = this.#archetype_generation;
        this.#archetype_generation = archetypes.generation;

        const archetype_range = archetypes.inner;
        for (let i = old_generation; i < archetype_range.length; i++) {
            this.#params.forEach((p, j) => p.new_archetype(this.#param_states[j], archetype_range[i], this.#meta))
        }
    }

    get_manual(world: World) {
        this.validate_world(world.id);
        return this.fetch(world, world.readChangeTick());
    }

    get_manual_mut(world: World) {
        this.validate_world(world.id)
        return this.fetch(world, world.changeTick);
    }

    /**
     * Retrieve the [`SystemParam`] values. This will not update archetypes automatically.
     * 
     * **Safety**
     * Make sure the data access is safe in the context of global [`World`] access.
     * The passed in [`World`] __must__ be the [`World`] the [`SystemState`] was created with.
     */
    get_unchecked_manual(world: World) {
        return this.fetch(world, world.incrementChangeTick());
    }

    fetch(world: World, change_tick: Tick) {
        const params = this.#params.map((p, i) => {
            return p.get_param(this.#param_states[i], this.#meta, world, change_tick)

        })
        this.#meta.last_run = change_tick;
        return params;
    }

    get param_state() {
        return this.#param_states;
    }
}

/**
 * This is implemented for all functions that can be used as [`System`]s.
 * 
 * Useful for making your own systems which accept other systems, sometimes called higher order systems.
 * 
 * This should be used in combination with [`ParamSet`] when calling other systems within your system. Using [`ParamSet`] in this case
 * avoids [`SystemParam`] collisions.
 */
interface SystemParamFunction<Marker> {
    In: any;
    Out: any;
    Param: SystemParam;

    run(input: SystemParamFunction<Marker>['In'], param_value: SystemParamItem<SystemParamFunction<Marker>['Param']>): SystemParamFunction<Marker>['Out'];
};

export class FunctionSystemState<P extends SystemParam> {
    param: ParamState<P>;
    world_id: WorldId;

    constructor(param: ParamState<P>, world_id: WorldId) {
        this.param = param;
        this.world_id = world_id;
    }

}

const ERROR_NOT_INITIALIZED = 'System attempted to run but was not initialized. Did you forget to initialize it?';

export class FunctionSystem<Marker, F extends SystemParamFunction<Marker>> implements System<any, any> {
    func: F;
    state: Option<FunctionSystemState<any>>;
    system_meta: SystemMeta;
    archetype_generation: ArchetypeGeneration;
    marker: any;

    readonly fallible: boolean;
    readonly type_id: UUID;
    readonly system_type_id: UUID;
    readonly is_exclusive: boolean;
    readonly is_send: boolean;
    readonly has_deferred: boolean;

    constructor(
        func: F,
        state: Option<FunctionSystemState<F['Param']>>,
        system_meta: SystemMeta,
        archetype_generation: ArchetypeGeneration,
        marker: any,
    ) {
        this.func = func;
        this.state = state;
        this.system_meta = system_meta;
        this.archetype_generation = archetype_generation;
        this.marker = marker;
        this.fallible = marker.fallible;
        this.type_id = marker.type_id;
        this.system_type_id = marker.system_type_id;
        this.is_send = system_meta.isSend;
        this.is_exclusive = false;
        this.has_deferred = system_meta.hasDeferred;
    }

    get name() {
        return this.system_meta.name;
    }

    withName(new_name: string) {
        this.system_meta.setName(new_name);
        return this;
    }

    setName(new_name: string): System<any, any> {
        this.system_meta.setName(new_name);
        return this;
    }

    /**
     * De-initializes the cloned system.
     */
    clone() {
        return new FunctionSystem(
            this.func,
            null,
            new SystemMeta(this.marker.name),
            ArchetypeGeneration.initial(),
            this.marker
        )
    }

    componentAccess() {
        return this.system_meta.__component_access_set.combined_access();
    }

    archetypeComponentAccess() {
        return this.system_meta.__archetype_component_access;
    }

    runUnsafe(input: any, world: World) {
        const change_tick = world.incrementChangeTick();
        const param_state = this.state?.param;
        if (!param_state) {
            throw new Error(ERROR_NOT_INITIALIZED)
        }

        const params = this.func.Param.get_param(param_state, this.system_meta, world, change_tick);
        const out = this.func.run(input, params);
        this.system_meta.last_run = change_tick;
        return out;
    }

    run(input: any, world: World) {
        TODO('FunctionSystem.run()')
    }

    runWithoutApplyingDeferred(input: any, world: World) {
        TODO('FunctionSystem.runWithoutApplyingDeferred()')

    }

    applyDeferred(world: World): void {
        const param_state = this.state?.param;
        if (!param_state) {
            throw new Error(ERROR_NOT_INITIALIZED);
        }

        this.func.Param.apply(param_state, this.system_meta, world);
    }

    queueDeferred(world: DeferredWorld): void {
        const param_state = this.state?.param;
        if (!param_state) {
            throw new Error(ERROR_NOT_INITIALIZED);
        }

        this.func.Param.queue(param_state, this.system_meta, world);
    }

    validateParamUnsafe(world: World): Result<Option<void>, SystemParamValidationError> {
        const param_state = this.state?.param;
        if (!param_state) {
            throw new Error(ERROR_NOT_INITIALIZED);
        }

        return this.func.Param.validate_param(param_state, this.system_meta, world);
    }

    validateParam(world: World): Result<Option<void>, SystemParamValidationError> {
        return this.validateParamUnsafe(world);
    }

    initialize(world: World): void {
        if (this.state) {
            assert(this.state.world_id === world.id, 'System build with a different world than the one it was added to.')
        } else {
            this.state = new FunctionSystemState(this.func.Param.init_state(world, this.system_meta), world.id)
        }

        this.system_meta.last_run = relative_to(world.changeTick, Tick.MAX);
    }

    updateArchetypeComponentAccess(world: World): void {
        const state = this.state;
        if (!state) {
            throw new Error(ERROR_NOT_INITIALIZED);
        }

        const archetypes = world.archetypes;
        const old_generation = this.archetype_generation;
        this.archetype_generation = archetypes.generation;

        const archetype_range = archetypes.inner,
            Param = this.func.Param,
            system_meta = this.system_meta;

        for (let i = old_generation; i < archetype_range.length; i++) {
            Param.new_archetype(state.param, archetype_range[i], system_meta)
        }
    }

    checkChangeTick(change_tick: Tick): void {
        this.system_meta.last_run = check_system_change_tick(this.system_meta.last_run, change_tick, this.system_meta.name);
    }

    intoSystem(): System<any, any> {
        return this;
    }

    intoSystemSet(): SystemSet {
        return new SystemTypeSet(this);
    }

    defaultSystemSets(): InternedSystemSet[] {
        const set = new SystemTypeSet(this);
        return [set];
    }

    processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfig<Schedulable>): NodeId {
        const id = schedule_graph.addSystemInner(config);
        if (!(id instanceof NodeId)) {
            throw id;
        }
        return id;
    }

    getLastRun(): Tick {
        return this.system_meta.last_run;
    }

    setLastRun(last_run: Tick): void {
        this.system_meta.last_run = last_run;
    }

    [Symbol.toPrimitive]() {
        return `FunctionSystem {
            name: ${this.name}
            is_send: ${this.is_send},
            is_exclusive: ${this.is_send},
        }`
    }

    [Symbol.toStringTag]() {
        return `FunctionSystem {
            name: ${this.name}
            is_send: ${this.is_send},
            is_exclusive: ${this.is_send},
        }`
    }
}

// export class FunctionSystem<Marker, F extends SystemParamFunction<any, any>> {
//     #func: F;
//     #state: Option<FunctionSystemState<F['Param']>>;
//     #system_meta: SystemMeta;
//     #archetype_generation: ArchetypeGeneration;
//     #marker: Marker;

//     constructor(
//         marker: Marker,
//         func: F,
//         state: Option<FunctionSystemState<F['Param']>> = undefined,
//         system_meta: SystemMeta = SystemMeta.new(func),
//         archetype_generation: ArchetypeGeneration = ArchetypeGeneration.initial(),
//     ) {
//         this.#func = func;
//         this.#state = state;
//         this.#system_meta = system_meta;
//         this.#archetype_generation = archetype_generation;
//         this.#marker = marker
//     }

//     // static new<Marker, F extends SystemParamFunction<any>>(marker: Marker, f: F) {
//     //     return new FunctionSystem(
//     //         marker,
//     //         f,
//     //         undefined,
//     //         SystemMeta.new(f),
//     //         ArchetypeGeneration.initial()
//     //     )
//     // }

//     with_name(new_name: string) {
//         this.#system_meta.set_name(new_name);
//         return this;
//     }

//     clone() {
//         return new FunctionSystem(
//             this.#marker,
//             this.#func,
//             undefined,
//             SystemMeta.new(this.#func),
//             ArchetypeGeneration.initial(),
//         )
//     }

//     name() {
//         return this.#system_meta.name();
//     }

//     component_access() {
//         return this.#system_meta.__component_access_set.combined_access();
//     }

//     archetype_component_access() {
//         return this.#system_meta.__archetype_component_access
//     }

//     is_send() {
//         return this.#system_meta.is_send()
//     }

//     is_exclusive() {
//         return false
//     }

//     has_deferred() {
//         return this.#system_meta.has_deferred()
//     }

//     run_unsafe(input: any, world: World) {
//         const change_tick = world.incrementChangeTick();
//         if (!this.#state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }

//         const param_state = this.#state.param;
//         const params = this.#func.Param.get_param(param_state, this.#system_meta, world, change_tick);
//         const out = this.#func.run(input, params);
//         this.#system_meta.last_run = change_tick;
//         return out;
//     }

//     apply_deferred(world: World) {
//         if (!this.#state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }

//         const param_state = this.#state.param;
//         this.#func.Param.apply(param_state, this.#system_meta, world);
//     }

//     queue_deferred(world: World) {
//         if (!this.#state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }

//         const param_state = this.#state.param;
//         this.#func.Param.queue(param_state, this.#system_meta, world)
//     }

//     validate_param_unsafe(world: World) {
//         if (!this.#state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }
//         const param_state = this.#state.param;

//         const is_valid = this.#func.Param.validate_param(param_state, this.#system_meta, world);
//         if (!is_valid) {
//             TODO('FunctionSystem.validate_param_unsafe !is_valid branch')
//             // this.#system_meta.advance_param_warn_policy();
//         }
//         return is_valid;
//     }

//     validate_param(world: World) {
//         return this.validate_param_unsafe(world)
//     }

//     initialize(world: World) {
//         if (this.#state) {
//             assert(this.#state.world_id === world.id, 'System build with a different world than the one it was added to');
//         } else {
//             this.#state = new FunctionSystemState(
//                 this.#func.Param.init_state(world, this.#system_meta),
//                 world.id
//             )
//         }
//         this.#system_meta.last_run = relative_to(world.changeTick, MAX_CHANGE_AGE);
//     }

//     update_archetype_component_access(world: World) {
//         if (!this.#state) {
//             throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
//         }
//         const state = this.#state;
//         assert(state.world_id === world.id, 'Encountered a mismatched World. A system cannot be used with Worlds other than the one it was initialized with.')
//         const archetypes = world.archetypes;
//         const old_generation = this.#archetype_generation;
//         this.#archetype_generation = archetypes.generation();
//         for (const archetype of archetypes.iter_range(old_generation)) {
//             this.#func.Param.new_archetype(state.param, archetype, this.#system_meta)
//         }
//     }

//     check_change_tick(change_tick: Tick) {
//         check_system_change_tick(
//             this.#system_meta.last_run,
//             change_tick,
//             this.#system_meta.name()
//         )
//     }

//     default_system_sets() {
//         const set = new SystemTypeSet(this as any);
//         // const set = SystemTypeSet::<Self>::new()
//         return [set];
//     }

//     get_last_run() {
//         return this.#system_meta.last_run
//     }

//     set_last_run(last_run: Tick) {
//         this.#system_meta.last_run = last_run;
//     }
// }

// export abstract class SystemParamFunction<Marker, Param> {
//     In!: SystemInput;
//     Out!: any;
//     Param!: SystemParam<any, any>;
//     marker: Marker;

//     constructor(marker: Marker, input: SystemInput, out: any, param: SystemParam<any, any>) {
//         this.In = input;
//         this.Out = out;
//         this.Param = param;
//         this.marker = marker;
//     }

//     abstract run(input: SystemParamFunction<any, any>['In'], param_value: SystemParamItem<SystemParamFunction<Marker>['Param']>): SystemParamFunction<Marker>['Out'];

//     into_system(func: SystemParamFunction<any, any>) {
//         return new FunctionSystem(
//             func.marker,
//             func,
//             undefined,
//             SystemMeta.new(func),
//             ArchetypeGeneration.initial(),
//         )
//     }

//     into_system_set() {
//         // type Set = SystemTypeSet<FunctionSystem<any, SystemParamFunction<any>>>

//         // return new SystemTypeSet(new FunctionSystem(this.marker, this) as any) as Set
//     }

// }

// export class FunctionSystemState<P extends SystemParam<any, any>> {
//     #param: ReturnType<P['init_state']>;
//     #world_id: WorldId;

//     constructor(param: ReturnType<P['init_state']>, world_id: WorldId) {
//         this.#param = param;
//         this.#world_id = world_id;
//     }

//     get param() {
//         return this.#param;
//     }

//     get world_id() {
//         return this.#world_id;
//     }

// }