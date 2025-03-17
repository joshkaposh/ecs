import { ErrorExt } from "joshkaposh-option";
import { FromWorld, SpawnBatchIter, World } from "../../world";
import { Entity } from "../../entity";
import { Bundle, InsertMode } from "../../bundle";
import { BundleInput } from "../../world/entity-ref";
import { MutOrReadonlyArray } from "../../util";
import { Resource } from "../../component";
import { ScheduleLabel } from "../../schedule";
import { Event, Events } from "../../event";

export interface Command<Out = any> {
    exec(world: World): Out;
}

export interface HandleError<Out = any> {
    handle_error_with(error_handler: (world: World, error: ErrorExt) => void): Command
    handle_error(): Command;
}

export function spawn_batch(bundles: BundleInput[]) {
    return (world: World) => {
        new SpawnBatchIter(world, bundles).drop()
    }
}

export function insert_batch(batch: MutOrReadonlyArray<[Entity, Bundle][]>, insert_mode: InsertMode) {
    return (world: World) => world.try_insert_batch(batch, insert_mode);
}

export function init_resource<T extends Resource, R extends T & FromWorld<T>>(resource: R) {
    return (world: World) => {
        world.init_resource(resource);
    }
}

export function insert_resource<R extends Resource>(resource: R) {
    return (world: World) => {
        world.insert_resource(resource)
    }
}

export function remove_resource<R extends Resource>(resource: R) {
    return (world: World) => {
        world.remove_resource(resource)
    }
}

// export function run_system(id: SystemId) {
//     return (world: World) => world.run_system(id);
// }

// export function run_system_with<I extends SystemIn<any>>(id: SystemId, input: I) {
//     return (world: World) => world.run_system_with(id, input);
// }

// export function run_system_cached(system: IntoSystem<any, any>) {
//     return (world: World) => world.run_system_cached(system);
// }

// export function run_system_cached_with<I extends SystemIn<any>>(system: IntoSystem<any, any>, input: I) {
//     return (world: World) => world.run_system_cached(system, input);
// }

// export function unregister_system(system_id: SystemId) {
//     return (world: World) => world.unregister_system(system_id)
// }

// export function unregister_system_cached(system: IntoSystem<any, any>) {
//     return (world: World) => world.unregister_system_cached(system);
// }

export function run_schedule(label: ScheduleLabel) {
    return (world: World) => world.try_run_schedule(label);
}

// export function trigger(event: Event) {
//     return (world: World) => {
//         world.trigger(event);
//     }
// }

// export function trigger_targets(event: Event, targets: TriggerTargets) {
//     return (world: World) => {
//         world.trigger_targets(event, targets);
//     }
// }

export function send_event<E extends Event>(event: InstanceType<E>) {
    return (world: World) => {
        // @ts-expect-error
        const events = world.resource_mut<Events<E>>(event.ECS_EVENTS_TYPE)
        events.v.send(event);
    }
}


