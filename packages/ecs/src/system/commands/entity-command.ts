import { ErrorExt } from "joshkaposh-option";
import type { EntityWorldMut, FromWorld } from "../../world";
import { EntityFetchError } from "../../world/error";
import { InsertMode } from "../../bundle";
import type { Component, ComponentId } from "../../component";
import type { Entity } from "../../entity";
import type { BundleInput } from "../../world/entity-ref";
// import { EntityClonerBuilder } from "../../entity/clone_entities";
import { defineEntityCommand, HandleError, WithEntity } from "../../error/command-handling";

export interface EntityCommand<Out> extends HandleError<Out>, WithEntity<Out> {
    exec(entity: EntityWorldMut): Out;
}

export class EntityCommandError extends ErrorExt<{ EntityFetchError: EntityFetchError } | { CommandFailed: 0 }> {
    constructor(type: { EntityFetchError: EntityFetchError } | { CommandFailed: 0 }) {
        super(type);
    }
}

export function insert(bundle: BundleInput) {
    return defineEntityCommand(entity => entity.insert(...bundle));
}

export function insert_if_new(bundle: BundleInput) {
    return defineEntityCommand(entity => entity.insertIfNew(...bundle));
}

export function insert_by_id<T extends InstanceType<Component>>(component_id: ComponentId, value: T) {
    return defineEntityCommand(entity => entity.insert_by_id(component_id, value))
}

export function insert_from_world<T extends Component & FromWorld<T>>(type: T, mode: InsertMode) {
    return defineEntityCommand(entity => entity.insert([
        entity.worldScope(world => type.from_world(world))
    ], mode));
}

export function remove(bundle: BundleInput) {
    return defineEntityCommand(entity => entity.remove(bundle))
};

export function remove_with_requires(bundle: BundleInput) {
    return defineEntityCommand(entity => entity.remove_with_requires(bundle));
}

export function remove_by_id(component_id: ComponentId) {
    return defineEntityCommand(entity => entity.removeById(component_id))
}

export function clear() {
    return defineEntityCommand(entity => entity.clear())
}

export function retain(bundle: BundleInput) {
    return defineEntityCommand(entity => entity.retain(bundle));
}

export function despawn() {
    return defineEntityCommand(entity => entity.despawn());
}

// export function observe<E extends Event, M>(observer: IntoObserverSystem<E, Bundle, M>) {
//     return (entity: EntityWorldMut) => {
//         TODO('entity-command - observe()')
//         // entity.observe(observer);
//     }
// }

// export function clone_with(target: Entity, config: (builder: EntityClonerBuilder) => void) {
//     return defineEntityCommand(entity => entity.clone_with(target, config));
// }

export function clone_components(target: Entity, bundle: BundleInput) {
    return defineEntityCommand(entity => entity.clone_components(target, bundle));
}

export function move_components(target: Entity, bundle: BundleInput) {
    return defineEntityCommand(entity => entity.move_components(target, bundle));
}

export function log_components() {
    return defineEntityCommand(entity => console.info(`Entity ${entity.id}: ${entity.world().inspectEntity(entity.id).map(info => info.name)}`))
}