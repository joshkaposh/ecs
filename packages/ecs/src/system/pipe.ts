import { defineSystem } from ".";
import { Tick } from "../tick";
import { World } from "../world";
import { System } from "./system";

export class PipeSystem<
    Ain extends any = any,
    Aout extends any = any,
    Bout extends any = any
>
// implements System<Aout, Bout>
{

    #a!: System<Ain, Aout>;
    #b!: System<Aout, Bout>;

    //     constructor(a: System<Ain, Aout>, b: System<Aout, Bout>) {
    //         this.#a = a;
    //         this.#b = b;

    //         const type_id = `${a.type_id}+${b.type_id}` as UUID;
    //         this.type_id = type_id;
    //         this.system_type_id = type_id;
    //         this.name = `${a.name} -> ${b.name}`;

    //         this.has_deferred = a.has_deferred || b.has_deferred;
    //         this.is_exclusive = a.is_exclusive || b.is_exclusive;
    //         this.is_send = a.is_send && b.is_send;
    //     }

    //     readonly type_id: UUID;
    //     readonly system_type_id: UUID;
    //     readonly name: string;

    //     readonly has_deferred: boolean;
    //     readonly is_exclusive: boolean;
    //     readonly is_send: boolean;

    //     intoSystem() {
    //         return this;
    //     }

    //     setName(new_name: string) {
    //         // @ts-expect-error
    //         this.name = new_name
    //         return this;
    //     }

    //     initialize(world: World) {
    //         this.#a.initialize(world);
    //         this.#b.initialize(world);
    //     }

    //     getLastRun() {
    //         return this.#a.getLastRun();
    //     }
    //     setLastRun(last_run: Tick) {
    //         this.#a.setLastRun(last_run);
    //     }

    //     checkChangeTick(change_tick: Tick) {
    //         this.#a.checkChangeTick(change_tick);
    //     }

    //     componentAccess() {
    //         return this.#a.componentAccess();
    //     }

    //     archetypeComponentAccess() {
    //         return this.#a.archetypeComponentAccess();
    //     }

    //     applyDeferred(world: World) {
    //         this.#a.applyDeferred(world)
    //         this.#b.applyDeferred(world)
    //     }

    //     queueDeferred(world: World) {
    //         this.#a.queueDeferred(world);
    //         this.#b.queueDeferred(world);
    //     }

    //     updateArchetypeComponentAccess(world: World) {
    //         this.#a.updateArchetypeComponentAccess(world);
    //         this.#b.updateArchetypeComponentAccess(world);

    //     }

    //     runUnsafe(input: Aout, world: World): Bout {
    //         return this.#b.runUnsafe(this.#a.runUnsafe(input), world)
    //     }

    //     run(input: In, world: World): Out {
    //         const ret = this.runWithoutApplyingDeferred(input, world);
    //         this.applyDeferred(world);
    //         return ret;
    //     }

    //     runWithoutApplyingDeferred: In, world: World): Out {
    //     this.updateArchetypeComponentAccess(world);
    //     return this.runUnsafe(input, world);
    // }

    // validateParam(world: World) {
    //     return this.validateParamUnsafe(world);
    // }

    // validateParamUnsafe(_world: World) {

    // }

    // defaultSystemSets(): InternedSystemSet[] {
    //     return [new SystemTypeSet(this)];
    // }
    // processConfig(schedule_graph: ScheduleGraph, config: ScheduleConfigs): NodeId {
    //     const id = schedule_graph.addSystemInner(config as ScheduleConfig<Schedulable>);
    //     if (!(id instanceof NodeId)) {
    //         throw id;
    //     }
    //     return id;
    // }

    // intoSystem() {
    //     return system;
    // }

    // intoSystemSet() {
    //     return new SystemTypeSet(this);
    // }

    // intoConfig(): ScheduleConfigs {
    //     const sets = this.defaultSystemSets();
    //     return new ScheduleConfig(
    //         this as any,
    //         {
    //             hierarchy: sets,
    //             dependencies: [],
    //             ambiguous_with: Ambiguity.default()
    //         },
    //         []
    //     )
    // }

    // system[Symbol.toPrimitive] = function () {
    //     return `System {
    //             name: ${system_name},
    //             is_exclusive: ${this.is_exclusive},
    //             is_send: ${this.is_send}
    //         }`
    // }

    // system[Symbol.toStringTag] = function () {
    //     return `System {
    //             name: ${system_name},
    //             is_exclusive: ${this.is_exclusive},
    //             is_send: ${this.is_send}
    //         }`
    // }



}