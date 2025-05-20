import { type World, type FromWorld, SpawnBatchIter } from "../../world";
import { Entity } from "../../entity";
import { Bundle, InsertMode } from "../../bundle";
import { BundleInput } from "../../world/entity-ref";
import { MutOrReadonlyArray } from "../../util";
import type { Resource } from "../../component";
import { ScheduleLabel } from "../../schedule";
import { Event } from "../../event";
import { defineCommand, HandleError } from "../../error/command-handling";


export type CommandFn = (world: World) => any
export interface Command<Out extends any = void> extends HandleError<Out> {
    exec(world: World): Out;
}


export function spawn_batch(bundles: BundleInput[]) {
    return defineCommand(world => new SpawnBatchIter(world, bundles))
}

export function insert_batch(batch: MutOrReadonlyArray<[Entity, Bundle][]>, insert_mode: InsertMode) {
    return defineCommand(world => world.tryInsertBatch(insert_mode, batch));
}

export function init_resource<T extends Resource, R extends T & FromWorld<T>>(resource: R) {
    return defineCommand(world => world.initResource(resource))
}

export function insert_resource<R extends Resource>(resource: R) {
    return defineCommand(world => world.insertResource(resource))
}

export function remove_resource<R extends Resource>(resource: R) {
    return defineCommand(world => world.removeResource(resource))
}

// export function run_system(id: SystemId) {
//     return world => world.run_system(id);
// }

// export function run_system_with<I extends SystemIn<any>>(id: SystemId, input: I) {
//     return world => world.run_system_with(id, input);
// }

// export function run_system_cached(system: IntoSystem<any, any>) {
//     return world => world.run_system_cached(system);
// }

// export function run_system_cached_with<I extends SystemIn<any>>(system: IntoSystem<any, any>, input: I) {
//     return world => world.run_system_cached(system, input);
// }

// export function unregister_system(system_id: SystemId) {
//     return world => world.unregister_system(system_id)
// }

// export function unregister_system_cached(system: IntoSystem<any, any>) {
//     return world => world.unregister_system_cached(system);
// }

export function run_schedule(label: ScheduleLabel) {
    return defineCommand(world => world.tryRunSchedule(label));
}

// export function trigger(event: Event) {
// return defineCommand(world => world.trigger(event));
// }


// export function trigger_targets(event: Event, targets: TriggerTargets) {
// return defineCommand(world => world.trigger_targer(event, targets))
// }

export function send_event<E extends Event>(event: InstanceType<E>) {
    return defineCommand((world: World) => world.resourceMut(event).v.send(event));
}


