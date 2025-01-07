import { ArchetypeComponentId, ProcessNodeConfig, ScheduleGraph, Tick, World } from "..";
import { unit } from "../../util";
import { Access } from "../query";
import { NodeConfig, SystemConfig } from "../schedule/config";
import { NodeId } from "../schedule/graph";
import { System } from "./system";

export class ScheduleSystem extends System<any, any> {
    #system: System<any, any>
    readonly fallible: boolean; // true if system returns value
    constructor(system: System<any, any>, fallible: boolean) {
        super()
        this.fallible = fallible
        this.#system = system;
    }


    static Infallible(system: System<any, void>) {
        // console.log('creating Infallible ScheduleSystem ', system);
        return new ScheduleSystem(system, false)

    }
    static Fallible(system: System<any, any>) {
        return new ScheduleSystem(system, true);
    }

    is_system_type(): boolean {
        return !this.fallible
    }

    name() {
        return this.#system.name();
    }

    type_id() {
        return this.#system.type_id();
    }

    component_access() {
        return this.#system.component_access();
    }

    archetype_component_access(): Access<ArchetypeComponentId> {
        return this.#system.archetype_component_access();
    }

    is_exclusive(): boolean {
        return this.#system.is_exclusive();
    }

    has_deferred(): boolean {
        return this.#system.has_deferred();
    }

    // @ts-expect-error
    run_unsafe(input: SystemIn<System<any, any>>, world: World) {
        if (this.fallible) {
            // console.log('SCHEDULESYSTEM RUN_UNSAFE FALLIBLE', input, this.#system);
            return this.#system.run_unsafe(input, world);
        } else {
            // console.log('SCHEDULESYSTEM RUN_UNSAFE INFALLIBLE', input, this.#system);
            this.#system.run_unsafe(input, world);
            return unit
        }
    }

    // @ts-expect-error
    run(input: SystemIn<System<any, any>>, world: World) {
        if (this.fallible) {
            // console.log('SCHEDULESYSTEM RUN FALLIBLE');
            return this.#system.run(input, world);
        } else {
            // console.log('SCHEDULESYSTEM RUN INFALLIBLE');
            this.#system.run(input, world);
            return unit;
        }
    }

    apply_deferred(world: World): void {
        this.#system.apply_deferred(world);
    }

    queue_deferred(world: World): void {
        this.#system.queue_deferred(world);
    }

    is_send(): boolean {
        return this.#system.is_send()
    }

    validate_param_unsafe(world: World): boolean {
        return this.#system.validate_param_unsafe(world)
    }

    initialize(world: World): void {
        this.#system.initialize(world);
    }

    update_archetype_component_access(world: World): void {
        this.#system.update_archetype_component_access(world);
    }

    check_change_tick(change_tick: Tick): void {
        this.#system.check_change_tick(change_tick);
    }

    default_system_sets(): any[] {
        return this.#system.default_system_sets();
    }

    get_last_run(): Tick {
        return this.#system.get_last_run();
    }

    set_last_run(last_run: Tick): void {
        return this.#system.set_last_run(last_run);
    }

    // * ProcessNodeConfig impl

    process_config(schedule_graph: ScheduleGraph, config: NodeConfig<ProcessNodeConfig>) {
        return schedule_graph.add_system_inner(config as unknown as SystemConfig) as NodeId;
    }
}