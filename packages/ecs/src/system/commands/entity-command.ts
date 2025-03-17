import { ErrorExt } from "joshkaposh-option";
import { TODO } from 'joshkaposh-iterator/src/util'
import { EntityWorldMut, FromWorld } from "../../world";
import { Command } from "./command";
import { EntityFetchError } from "../../world/error";
import { Bundle, InsertMode } from "../../bundle";
import { Component, ComponentId } from "../../component";
import { Entity } from "../../entity";
import { BundleInput } from "../../world/entity-ref";
import { EntityClonerBuilder } from "../../entity/clone_entities";

type HandleError<Out> = {};

export interface EntityCommand<Out = any> {
    exec(entity: EntityWorldMut): Out;
}

export interface CommandWithEntity<Out> {
    with_entity(): Command & HandleError<Out>;
}

export class EntityCommandError<E> extends ErrorExt<{ EntityFetchError: EntityFetchError } | { CommandFailed: E }> {
    constructor(type: { EntityFetchError: EntityFetchError } | { CommandFailed: E }) {
        super(type);
    }
}

export function insert(bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.insert(bundle);
    }
}

export function insert_if_new(bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.insert(bundle, InsertMode.Keep);
    }
}

export function insert_by_id<T extends InstanceType<Component>>(component_id: ComponentId, value: T) {
    return (entity: EntityWorldMut) => {
        entity.insert_by_id(component_id, value)
    };
}

export function insert_from_world<T extends Component & FromWorld<T>>(type: T, mode: InsertMode) {
    return (entity: EntityWorldMut) => {
        const value = entity.world_scope(world => type.from_world(world));
        entity.insert([value], mode);
    }
}

export function remove(bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.remove(bundle)
    }
}

export function remove_with_requires(bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.remove_with_requires(bundle);
    }
}

export function remove_by_id(component_id: ComponentId) {
    return (entity: EntityWorldMut) => {
        entity.remove_by_id(component_id)
    }
}

export function clear() {
    return (entity: EntityWorldMut) => {
        entity.clear();
    }
}

export function retain(bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.retain(bundle);
    }
}

export function despawn() {
    return (entity: EntityWorldMut) => {
        entity.despawn();
    }
}

// export function observe<E extends Event, M>(observer: IntoObserverSystem<E, Bundle, M>) {
//     return (entity: EntityWorldMut) => {
//         TODO('entity-command - observe()')
//         // entity.observe(observer);
//     }
// }

export function clone_with(target: Entity, config: (builder: EntityClonerBuilder) => void) {
    return (entity: EntityWorldMut) => {
        entity.clone_with(target, config);
    }
}

export function clone_components(target: Entity, bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.clone_components(target, bundle);
    }
}

export function move_components(target: Entity, bundle: BundleInput) {
    return (entity: EntityWorldMut) => {
        entity.move_components(target, bundle);
    }
}

export function log_components() {
    return (entity: EntityWorldMut) => {
        const infos = entity.world().inspect_entity(entity.id()).map(info => info.name())
        console.info(`Entity ${entity.id()}: ${infos}`)
    }
}