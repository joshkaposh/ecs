import { assert } from "joshkaposh-iterator/src/util";
import { ArchetypeGeneration } from "../archetype";
import { Tick } from "../component";
import { Access, FilteredAccessSet } from "../query";
import { World, WorldId } from "../world";
import { SystemParam, SystemParamItem } from "./system-param";
import { Option } from "joshkaposh-option";
import { SystemInput } from "./input";
import { SystemTypeSet } from "../schedule/set";
import { ParamBuilder } from "./param-builder";

export class SystemMeta {
    __component_access_set: FilteredAccessSet;
    __archetype_component_access: Access;
    __param_warn_policy: ParamWarnPolicy
    #name: string;
    #is_send: boolean;
    #has_deferred: boolean;
    last_run: Tick;

    private constructor(
        name: string,
        archetype_component_access: Access,
        component_access_set: FilteredAccessSet,
        is_send: boolean,
        has_deferred: boolean,
        last_run: Tick,
        param_warn_policy: ParamWarnPolicy
    ) {
        this.#name = name;
        this.__archetype_component_access = archetype_component_access;
        this.__component_access_set = component_access_set;
        this.__param_warn_policy = param_warn_policy;
        this.last_run = last_run;
        this.#is_send = is_send;
        this.#has_deferred = has_deferred;
    }

    static new(type: any) {
        const name = type.name;
        return new SystemMeta(
            name,
            new Access(),
            new FilteredAccessSet(),
            true,
            false,
            new Tick(0),
            ParamWarnPolicy.Once()
        )
    }


    name(): string {
        return this.#name;
    }

    /**
     * Useful for giving closure functions more readable names for debugging and tracing. 
     */
    set_name(new_name: string) {
        this.#name = new_name
    }

    is_send(): boolean {
        return this.#is_send
    }

    set_non_send(): void {
        this.#is_send = false;
    }

    has_deferred(): boolean {
        return this.#has_deferred;
    }

    set_has_deferred(): void {
        this.#has_deferred = true;
    }

    try_warn_param(param: SystemParam<any, any>) {
        this.__param_warn_policy.try_warn(this.#name, param)
    }

    archetype_component_access() {
        return this.__archetype_component_access
    }

    component_access_set() {
        return this.__component_access_set;
    }

    clone(): SystemMeta {
        return new SystemMeta(
            this.#name,
            this.__archetype_component_access.clone(),
            this.__component_access_set.clone(),
            this.#is_send,
            this.#has_deferred,
            this.last_run.clone(),
            this.__param_warn_policy
        )
    }
}

class ParamWarnPolicy {
    #type: 0 | 1

    /**
     * No warning should ever be emitted
     */
    static Never() {
        return new ParamWarnPolicy(0)
    }
    /**
     * The warning will be emitted once and status will update to `Never`
     */
    static Once() {
        return new ParamWarnPolicy(1)
    }

    private constructor(ty: 0 | 1) {
        this.#type = ty;
    }

    advance() {
        this.#type = 0;
    }

    try_warn(name: string, param: SystemParam<any, any>) {
        if (this.#type === 0) {
            return
        }

        console.warn(`${name} did not run because it requested inaccessible system parameter ${param}`)
    }
}

export class SystemState<Param extends SystemParam<any, any>> {
    #meta: SystemMeta;
    #param: Param;
    #param_state: Param['State']
    #world_id: WorldId;
    #archetype_generation: ArchetypeGeneration;

    private constructor(
        meta: SystemMeta,
        param: Param,
        param_state: Param['State'],
        world_id: WorldId,
        archetype_generation: ArchetypeGeneration
    ) {
        this.#meta = meta;
        this.#param = param;
        this.#param_state = param_state;
        this.#world_id = world_id;
        this.#archetype_generation = archetype_generation;

    }

    static new<Param extends SystemParam<any, any>>(world: World, param: Param) {
        const meta = SystemMeta.new(param);
        meta.last_run = world.change_tick().relative_to(Tick.MAX);

        console.log('SystemState.new()', param);

        const param_state = param.init_state(world, meta);

        return new SystemState(
            meta,
            param,
            param_state,
            world.id(),
            ArchetypeGeneration.initial()
        )
    }

    static from_builder<Param extends SystemParam<any, any>>(world: World, builder: ParamBuilder<any[]>, param: Param) {
        const meta = SystemMeta.new(param);
        meta.last_run = world.change_tick().relative_to(Tick.MAX);
        const param_state = builder.build(world, meta, param)
        return new SystemState(
            meta,
            param,
            param_state,
            world.id(),
            ArchetypeGeneration.initial()
        )
    }

    static from_world<Param extends SystemParam<any, any>>(world: World, param: Param) {
        return SystemState.new(world, param)
    }

    build_any_system<Marker, Fn extends SystemParamFunction<Marker, Param>>(marker: Marker, fn: Fn) {
        return new FunctionSystem(
            marker,
            fn,
            new FunctionSystemState(this.#param_state, this.#world_id),
            this.#meta,
            this.#archetype_generation,
        )
    }

    meta(): SystemMeta {
        return this.#meta;
    }

    /**
     * @summary Retrieve the [`SystemParam`] values. This can only be called when all parameters are read-only.
     */
    get(world: World) {
        this.validate_world(world.id());
        this.update_archetypes(world);
        return this.get_unchecked_manual(world);
    }

    get_mut(world: World) {
        this.validate_world(world.id());
        this.update_archetypes(world);

        return this.get_unchecked_manual(world);
    }

    apply(world: World) {
        this.#param.apply(this.#param_state, this.#meta, world);
    }

    validate_param(world: World) {
        return this.#param.validate_param(this.#param_state, this.#meta, world);
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
        assert(this.#world_id === world.id())
        const archetypes = world.archetypes();
        const old_generation = this.#archetype_generation;
        this.#archetype_generation = archetypes.generation();

        // for (const archetype of archetypes.iter_range(old_generation)) {
        //     this.#param.new_archetype(this.#param_state, archetype, this.#meta)
        // }
    }

    get_manual(world: World) {
        this.validate_world(world.id())

        const change_tick = world.read_change_tick()
        return this.fetch(world, change_tick)
    }

    get_manual_mut(world: World) {
        this.validate_world(world.id())

        const change_tick = world.change_tick()
        return this.fetch(world, change_tick)
    }

    get_unchecked_manual(world: World) {
        const change_tick = world.increment_change_tick();
        return this.fetch(world, change_tick);
    }

    fetch(world: World, change_tick: Tick) {
        const param = this.#param.get_param(this.#param_state, this.#meta, world, change_tick);
        this.#meta.last_run.set(change_tick.get());
        return param;
    }
}

export class FunctionSystem<Marker, F extends SystemParamFunction<any, any>> {
    #func: F;
    #state: Option<FunctionSystemState<F['Param']>>;
    #system_meta: SystemMeta;
    #archetype_generation: ArchetypeGeneration;
    #marker: Marker;

    constructor(
        marker: Marker,
        func: F,
        state: Option<FunctionSystemState<F['Param']>> = undefined,
        system_meta: SystemMeta = SystemMeta.new(func),
        archetype_generation: ArchetypeGeneration = ArchetypeGeneration.initial(),
    ) {
        this.#func = func;
        this.#state = state;
        this.#system_meta = system_meta;
        this.#archetype_generation = archetype_generation;
        this.#marker = marker
    }

    // static new<Marker, F extends SystemParamFunction<any>>(marker: Marker, f: F) {
    //     return new FunctionSystem(
    //         marker,
    //         f,
    //         undefined,
    //         SystemMeta.new(f),
    //         ArchetypeGeneration.initial()
    //     )
    // }

    with_name(new_name: string) {
        this.#system_meta.set_name(new_name);
        return this;
    }

    clone() {
        return new FunctionSystem(
            this.#marker,
            this.#func,
            undefined,
            SystemMeta.new(this.#func),
            ArchetypeGeneration.initial(),
        )
    }

    name() {
        return this.#system_meta.name();
    }

    component_access() {
        return this.#system_meta.__component_access_set.combined_access();
    }

    archetype_component_access() {
        return this.#system_meta.__archetype_component_access
    }

    is_send() {
        return this.#system_meta.is_send()
    }

    is_exclusive() {
        return false
    }

    has_deferred() {
        return this.#system_meta.has_deferred()
    }

    run_unsafe(input: any, world: World) {
        const change_tick = world.increment_change_tick();
        if (!this.#state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }

        const param_state = this.#state.param;
        const params = this.#func.Param.get_param(param_state, this.#system_meta, world, change_tick);
        const out = this.#func.run(input, params);
        this.#system_meta.last_run = change_tick;
        return out;
    }

    apply_deferred(world: World) {
        if (!this.#state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }

        const param_state = this.#state.param;
        this.#func.Param.apply(param_state, this.#system_meta, world);
    }

    queue_deferred(world: World) {
        if (!this.#state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }

        const param_state = this.#state.param;
        this.#func.Param.queue(param_state, this.#system_meta, world)
    }

    validate_param_unsafe(world: World) {
        if (!this.#state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }
        const param_state = this.#state.param;

        const is_valid = this.#func.Param.validate_param(param_state, this.#system_meta, world);
        if (!is_valid) {
            this.#system_meta.advance_param_warn_policy();
        }
        return is_valid;
    }

    validate_param(world: World) {
        return this.validate_param_unsafe(world)
    }

    initialize(world: World) {
        if (this.#state) {
            assert(this.#state.world_id === world.id(), 'System build with a different world than the one it was added to');
        } else {
            this.#state = new FunctionSystemState(
                this.#func.Param.init_state(world, this.#system_meta),
                world.id()
            )
        }
        this.#system_meta.last_run = world.change_tick().relative_to(Tick.MAX);
    }

    update_archetype_component_access(world: World) {
        if (!this.#state) {
            throw new Error(`System's state was not found. Did you forget to initialize this system before running it?`)
        }
        const state = this.#state;
        assert(state.world_id === world.id(), 'Encountered a mismatched World. A system cannot be used with Worlds other than the one it was initialized with.')
        const archetypes = world.archetypes();
        const old_generation = this.#archetype_generation;
        this.#archetype_generation = archetypes.generation();
        for (const archetype of archetypes.iter_range(old_generation)) {
            this.#func.Param.new_archetype(state.param, archetype, this.#system_meta)
        }
    }

    check_change_tick(change_tick: Tick) {
        check_system_change_tick(
            this.#system_meta.last_run,
            change_tick,
            this.#system_meta.name()
        )
    }

    default_system_sets() {
        const set = new SystemTypeSet(this as any);
        // const set = SystemTypeSet::<Self>::new()
        return [set];
    }

    get_last_run() {
        return this.#system_meta.last_run
    }

    set_last_run(last_run: Tick) {
        this.#system_meta.last_run = last_run;
    }
}

export abstract class SystemParamFunction<Marker, Param> {
    In!: SystemInput;
    Out!: any;
    Param!: SystemParam<any, any>;
    marker: Marker;

    constructor(marker: Marker, input: SystemInput, out: any, param: SystemParam<any, any>) {
        this.In = input;
        this.Out = out;
        this.Param = param;
        this.marker = marker;
    }

    abstract run(input: SystemParamFunction<any, any>['In']['Inner'], param_value: SystemParamItem<SystemParamFunction<Marker>['Param']>): SystemParamFunction<Marker>['Out'];

    into_system(func: SystemParamFunction<any, any>) {
        return new FunctionSystem(
            func.marker,
            func,
            undefined,
            SystemMeta.new(func),
            ArchetypeGeneration.initial(),
        )
    }

    into_system_set() {
        type Set = SystemTypeSet<FunctionSystem<any, SystemParamFunction<any>>>

        return new SystemTypeSet(new FunctionSystem(this.marker, this) as any) as Set
    }

}

export class FunctionSystemState<P extends SystemParam<any, any>> {
    #param: ReturnType<P['init_state']>;
    #world_id: WorldId;

    constructor(param: ReturnType<P['init_state']>, world_id: WorldId) {
        this.#param = param;
        this.#world_id = world_id;
    }

    get param() {
        return this.#param;
    }

    get world_id() {
        return this.#world_id;
    }

}