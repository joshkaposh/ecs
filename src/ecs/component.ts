import { iter } from "joshkaposh-iterator";
import { is_some, type Option } from 'joshkaposh-option';
import { StorageType, Storages } from "./storage";
import { World } from "./world";

export type TypeId = { readonly type_id: UUID }
export type ComponentMetadata = TypeId & { readonly storage_type: StorageType };
export type ComponentId = number;
export type Component<T = any> = (new (...args: any[]) => T) & ComponentMetadata;


export type ResourceId = number;
export type ResouceMetadata<R extends new (...args: any[]) => any> = { from_world(world: World): InstanceType<R> };
export type Resource<R = Component> = R extends Component ? R & ResouceMetadata<R> : never;

export type ComponentDescriptor = {
    readonly type: Component;
    readonly storage_type: StorageType;
}

export class ComponentInfo {
    #id: ComponentId;
    readonly descriptor: ComponentDescriptor;

    constructor(id: ComponentId, descriptor: ComponentDescriptor) {
        this.#id = id;
        this.descriptor = descriptor;
    }

    name(): string {
        return this.descriptor.type.name;
    }

    storage_type(): StorageType {
        return this.descriptor.storage_type;
    }

    type(): Component {
        return this.descriptor.type;
    }

    id(): ComponentId {
        return this.#id
    }
}

export class Components {
    #components: ComponentInfo[];
    #indices: Map<UUID, ComponentId>;
    #resource_indices: Map<UUID, ComponentId>;

    constructor(components: ComponentInfo[], indices: Map<UUID, ComponentId>, resource_indices: Map<UUID, ComponentId>) {
        this.#components = components;
        this.#indices = indices;
        this.#resource_indices = resource_indices;
    }

    static default() {
        return new Components([], new Map(), new Map())
    }

    has_type_id(type_id: UUID): boolean {
        return this.#indices.has(type_id);
    }

    has_component(component: Component): boolean {
        return this.#indices.has(component.type_id)
    }

    has_resource(resource: Resource<Component>): boolean {
        return this.#resource_indices.has(resource.type_id)
    }

    has_resource_type_id(type_id: UUID): boolean {
        return this.#resource_indices.has(type_id)
    }

    get_info(id: ComponentId): Option<ComponentInfo> {
        return this.#components[id]
    }

    get_name(id: ComponentId): Option<string> {
        return this.get_info(id)?.type().name;
    }

    get_id(type: TypeId): Option<ComponentId> {
        return this.#indices.get(type.type_id)
    }

    get_id_type_id(type_id: UUID): Option<ComponentId> {
        return this.#indices.get(type_id);
    }

    get_resource_id(type: TypeId): Option<ResourceId> {
        return this.#resource_indices.get(type.type_id);
    }

    component_id(type: TypeId): Option<ComponentId> {
        return this.get_id(type)
    }

    init_component(type: Component, storages: Storages): ComponentId {
        const { type_id } = type

        if (this.#indices.has(type_id)) {
            return this.#indices.get(type_id)!
        } else {
            const id = Components.#init_component_inner(this.#components, storages, {
                type: type,
                storage_type: type.storage_type
            })
            this.#indices.set(type_id, id);
            return id
        }
    }

    init_resource(resource: Resource<Component>): ComponentId {
        return this.#get_or_insert_resource_with(resource, () => ({ storage_type: resource.storage_type, type: resource }))
    }

    #get_or_insert_resource_with(type: TypeId, func: () => ComponentDescriptor): ComponentId {
        const components = this.#components;
        const id = this.#resource_indices.get(type.type_id)
        if (is_some(id)) {
            return id;
        }

        const descriptor = func();
        const component_id = components.length;
        components.push(new ComponentInfo(component_id, descriptor))
        this.#resource_indices.set(type.type_id, component_id);
        return component_id
    }

    static #init_component_inner(components: ComponentInfo[], storages: Storages, descriptor: ComponentDescriptor) {
        const component_id = components.length;
        const info = new ComponentInfo(component_id, descriptor);
        if (info.descriptor.storage_type === StorageType.SparseSet) {
            storages.sparse_sets.__get_or_insert(info);
        }

        components.push(info);
        return component_id;
    }

    iter() {
        return iter(this.#components)
    }

}