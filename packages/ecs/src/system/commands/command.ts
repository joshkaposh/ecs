import { FromWorld, SpawnBatchIter, World } from "../../world";
import { Entity } from "../../entity";
import { Bundle, InsertMode } from "../../bundle";
import { BundleInput } from "../../world/entity-ref";
import { MutOrReadonlyArray } from "../../util";
import { Resource } from "../../component";
import { ScheduleLabel } from "../../schedule";
import { Event, Events } from "../../event";
import { default_error_handler, HandleError } from "../../error/command-handling";

export interface Command<Out extends any = void> {
    exec(world: World): Out;
}

// export interface HandleError<Out = any> {
//     handle_error_with(error_handler: (world: World, error: ErrorExt) => void): Command
//     handle_error(): Command;
// }

function intoCommand<T extends (world: World) => any>(fn: T): Command<ReturnType<T>> & HandleError<ReturnType<T>> {
    return {
        exec: fn,
        hande_error_with(_error_handler) {
            return {
                exec(world) {
                    fn(world);
                },
            }
        },

        handle_error() {
            return this;
        },

        // with_entity(entity) {
        //     const fn = this.exec;
        //     return {
        //         exec(world) {
        //             return fn(world);
        //         },
        //         handle_error() {
        //             return this;
        //             // return TODO('Command.handle_error')
        //         },
        //         handle_error_with(error_handler) {
        //             return this
        //             // return TODO('Command.handle_error_with', error_handler);
        //         },
        //     }
        // },
        // handle_error() {
        //     return this;
        //     // return TODO('Command.handle_error')
        // },
        // handle_error_with(error_handler) {
        //     return this
        //     // return TODO('Command.handle_error_with', error_handler);
        // },
    }
}

export function spawn_batch(bundles: BundleInput[]) {
    return intoCommand(world => new SpawnBatchIter(world, bundles))
}

export function insert_batch(batch: MutOrReadonlyArray<[Entity, Bundle][]>, insert_mode: InsertMode) {
    return intoCommand(world => world.tryInsertBatch(batch, insert_mode));
}

export function init_resource<T extends Resource, R extends T & FromWorld<T>>(resource: R) {
    return intoCommand(world => world.initResource(resource))
}

export function insert_resource<R extends Resource>(resource: R) {
    return intoCommand(world => world.insertResource(resource))
}

export function remove_resource<R extends Resource>(resource: R) {
    return intoCommand(world => world.removeResource(resource))
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
    return intoCommand(world => world.tryRunSchedule(label));
}

// export function trigger(event: Event) {
// return intoCommand(world => world.trigger(event));
// }


// export function trigger_targets(event: Event, targets: TriggerTargets) {
// return intoCommand(world => world.trigger_targer(event, targets))
// }

export function send_event<E extends Event>(event: InstanceType<E>) {
    // @ts-expect-error
    return (world: World) => world.resource_mut<Events<E>>(event.ECS_EVENTS_TYPE).v.send(event);
}


