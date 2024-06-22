import { v4 } from "uuid";
import { StorageType } from "./storage";

export function define_component<T extends new (...args: any[]) => any>(ty: T, storage_type: StorageType = StorageType.Table): void {
    // @ts-expect-error
    ty.type_id = v4() as UUID;
    // @ts-expect-error
    ty.storage_type = storage_type;
}

export function define_resource<T extends new (...args: any[]) => any>(ty: T): void {
    define_component(ty, StorageType.SparseSet);
    // @ts-expect-error
    ty.from_world = (_world: World) => {
        return new ty();
    }
}