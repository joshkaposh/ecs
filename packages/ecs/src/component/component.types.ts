import type { TypeId, Class } from '../util';
import type { StorageType } from '../storage/storage-type';
import type { FromWorld } from '../world/world.types';
// import type { Bundle } from '../bundle';

export type ComponentId = number;
export interface ComponentMetadata extends TypeId {
    readonly storage_type: StorageType;
}
export interface Component<T extends Class = Class> extends ComponentMetadata {
    new(...params: ConstructorParameters<T>): InstanceType<T>;
}

export type ResourceId = number;
export interface Resource<T extends Class = Class> extends ComponentMetadata, FromWorld<Class> {
    new(...params: ConstructorParameters<T>): InstanceType<T>
}

export type Tick = number;