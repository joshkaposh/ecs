import { v4 } from "uuid";
import { StorageType } from "./storage";
import { Class, Component, ComponentMetadata, Resource, World } from ".";
import { is_some } from "joshkaposh-option";

export function define_component<T>(ty: Class<T> & Partial<ComponentMetadata>, storage_type: StorageType = StorageType.Table): ty is Component<T> {
    // @ts-expect-error
    ty.type_id = v4() as UUID;
    // @ts-expect-error
    ty.storage_type = storage_type;
    return true
}

export function define_marker(): Component {
    const marker = class { }
    define_component(marker, StorageType.SparseSet);
    return marker as Component
}

function assert_component<T extends Component>(ty: Partial<ComponentMetadata>): ty is T {
    return is_some(ty.type_id);
}

export function define_resource<T>(ty: Class<T> & Partial<ComponentMetadata> & { from_world?(world: World): InstanceType<typeof ty> }): ty is Resource<T> {
    define_component(ty, StorageType.SparseSet);
    ty.from_world = (_world: World) => {
        return new ty();
    }
    return assert_component(ty)
}

export function define_system<S extends (...args: any[]) => void, P extends Parameters<S>>(system: S, ...params: P) {

}