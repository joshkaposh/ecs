import { v4 } from "uuid";
import { StorageType } from "./ecs/storage";
import { Component, ComponentMetadata, Resource, ResourceMetadata } from "./ecs/component";
import { World } from "./ecs/world/world";
import { Prettify } from "joshkaposh-iterator/src/util";
import { Event, Events } from "./ecs";


export type Class<Static = {}, Inst = {}> = (new (...args: any[]) => Inst) & Static;
export type TypeId = { readonly type_id: UUID }

export function define_type<T extends Record<PropertyKey, any>>(type: T & {
    type_id?: UUID;
}): asserts type is T & TypeId {
    type.type_id = v4() as UUID;
}

export function define_component<T>(ty: T, storage_type: StorageType = StorageType.Table): T & Prettify<ComponentMetadata> {
    define_type(ty as any)
    // @ts-expect-error
    ty.storage_type = storage_type;
    return ty as T & ComponentMetadata;
}

export function define_marker(): Component {
    const marker = class { }
    define_component(marker, StorageType.SparseSet);
    return marker as Component
}

export function define_resource<R extends Class>(ty: R & Partial<ComponentMetadata> & Partial<ResourceMetadata<R>> & {}): Resource<R> {
    define_component(ty, StorageType.SparseSet);
    ty.from_world ??= (_world: World) => {
        return new ty() as InstanceType<R>;
    }

    return ty as any
}

export const ECS_EVENTS_TYPE = Symbol('ECS_EVENTS_TYPE')

export function define_event<E extends Class>(type: E) {
    define_resource(type);
    // @ts-expect-error
    type[ECS_EVENTS_TYPE] = new Events(type);
    return type as Event<E>;
}

export { define_system } from './ecs/system';
export { set } from "./ecs/schedule/set";