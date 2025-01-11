import { v4 } from "uuid";
import { is_some } from "joshkaposh-option";
import { StorageType } from "./ecs/storage";
import { Component, ComponentMetadata, Resource, ResourceMetadata } from "./ecs/component";
import { World } from "./ecs/world/world";

export type Class<Static = {}, Inst = {}> = (new (...args: any[]) => Inst) & Static;
export type TypeId = { readonly type_id: UUID }

export function define_type<T extends Record<PropertyKey, any>>(type: T & {
    type_id?: UUID;
}): asserts type is T & TypeId {
    type.type_id = v4() as UUID;
}

export function define_component<T extends Component>(ty: (new (...args: any[]) => any) & Partial<ComponentMetadata>, storage_type: StorageType = StorageType.Table): asserts ty is T {
    define_type(ty)
    // @ts-expect-error
    ty.storage_type = storage_type;
    assert_component(ty);
}

export function define_marker(): Component {
    const marker = class { }
    define_component(marker, StorageType.SparseSet);
    return marker as Component
}

function assert_component<T extends Component>(ty: Partial<ComponentMetadata>): ty is T {
    return is_some(ty.type_id);
}

export function define_resource<R extends Class>(ty: R & Partial<ComponentMetadata> & Partial<ResourceMetadata<R>> & {}): Resource<R> {
    define_component(ty, StorageType.SparseSet);
    ty.from_world ??= (_world: World) => {
        return new ty();
    }

    return ty as any
}

export function define_event() { }

// export { define_system } from './system'