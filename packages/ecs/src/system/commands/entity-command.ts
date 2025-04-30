import { ErrorExt } from "joshkaposh-option";
import { EntityWorldMut, FromWorld } from "../../world";
import { EntityFetchError } from "../../world/error";
import { InsertMode } from "../../bundle";
import { Component, ComponentId } from "../../component";
import { Entity } from "../../entity";
import { BundleInput } from "../../world/entity-ref";
import { EntityClonerBuilder } from "../../entity/clone_entities";
import { CommandWithEntity } from "../../error/command-handling";

export interface EntityCommand<Out = any> {
    exec(entity: EntityWorldMut): Out;
}

export class EntityCommandError<E> extends ErrorExt<{ EntityFetchError: EntityFetchError } | { CommandFailed: E }> {
    constructor(type: { EntityFetchError: EntityFetchError } | { CommandFailed: E }) {
        super(type);
    }
}

function intoCommand<T extends (entity: EntityWorldMut) => any>(fn: T): EntityCommand<ReturnType<T>> & CommandWithEntity<ReturnType<T>> {
    return CommandWithEntity({
        exec: fn
    }) as any
}

export function insert(bundle: BundleInput) {
    return intoCommand(entity => entity.insert(...bundle))
}

export function insert_if_new(bundle: BundleInput) {
    return intoCommand(entity => entity.insertIfNew(...bundle));
}

export function insert_by_id<T extends InstanceType<Component>>(component_id: ComponentId, value: T) {
    return intoCommand(entity => entity.insert_by_id(component_id, value))
}

export function insert_from_world<T extends Component & FromWorld<T>>(type: T, mode: InsertMode) {
    return intoCommand(entity => entity.insert([
        entity.worldScope(world => type.from_world(world))
    ], mode));
}

export function remove(bundle: BundleInput) {
    return intoCommand(entity => entity.remove(bundle))
};

export function remove_with_requires(bundle: BundleInput) {
    return intoCommand(entity => entity.remove_with_requires(bundle));
}

export function remove_by_id(component_id: ComponentId) {
    return intoCommand(entity => entity.removeById(component_id))
}

export function clear() {
    return intoCommand(entity => entity.clear())
}

export function retain(bundle: BundleInput) {
    return intoCommand(entity => entity.retain(bundle));
}

export function despawn() {
    return intoCommand(entity => entity.despawn());
}

// export function observe<E extends Event, M>(observer: IntoObserverSystem<E, Bundle, M>) {
//     return (entity: EntityWorldMut) => {
//         TODO('entity-command - observe()')
//         // entity.observe(observer);
//     }
// }

export function clone_with(target: Entity, config: (builder: EntityClonerBuilder) => void) {
    return intoCommand(entity => entity.clone_with(target, config));
}

export function clone_components(target: Entity, bundle: BundleInput) {
    return intoCommand(entity => entity.clone_components(target, bundle));
}

export function move_components(target: Entity, bundle: BundleInput) {
    return intoCommand(entity => entity.move_components(target, bundle));
}

export function log_components() {
    return intoCommand(entity => console.info(`Entity ${entity.id}: ${entity.world().inspectEntity(entity.id).map(info => info.name)}`))
}