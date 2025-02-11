import { v4 } from 'uuid';
import type { Prettify } from 'joshkaposh-iterator/src/util'
import type { World, Event } from 'ecs';
import { Events } from 'ecs/src/event/collections';

export type Class<Static = {}, Inst = {}> = (new (...args: any[]) => Inst) & Static;
export type TypeId = { readonly type_id: UUID }

type StorageType = 0 | 1;

type ComponentMetadata = TypeId & { readonly storage_type: StorageType };
type Component<T extends Class = Class> = T & Prettify<ComponentMetadata>;

type ResourceMetadata<R extends new (...args: any[]) => any> = { from_world(world: World): InstanceType<R> };
type Resource<R = Component> = R extends Class ? R & ComponentMetadata & ResourceMetadata<R> : never;

type UUID = `${string}-${string}-${string}-${string}`;

export function define_type<T extends Record<PropertyKey, any>>(type: T & {
    type_id?: UUID;
}): asserts type is T & TypeId {
    type.type_id = v4() as UUID;
}

export function define_component<T>(ty: T, storage_type: StorageType = 0): T & Prettify<ComponentMetadata> {
    define_type(ty as any)
    // @ts-expect-error
    ty.storage_type = storage_type;


    return ty as T & ComponentMetadata;
}

export function define_marker(): Component {
    const marker = class { }
    define_component(marker, 1);
    return marker as Component
}

export function define_resource<R extends Class>(ty: R & Partial<ComponentMetadata> & Partial<ResourceMetadata<R>> & {}): Resource<R> {
    define_component(ty, 1);
    ty.from_world ??= (_world: World) => {
        return new ty() as InstanceType<R>;
    }

    return ty as any
}

export const ECS_EVENTS_TYPE = 'ECS_EVENTS_TYPE';

export function define_event<E extends Class>(type: E): E {
    define_resource(type);
    class EventDefinition extends Events<E> {
        constructor() {
            super(type);
        }
    }
    // @ts-expect-error
    type[ECS_EVENTS_TYPE] = EventDefinition;
    type.prototype[ECS_EVENTS_TYPE] = EventDefinition;
    return type as Event<E>;
}