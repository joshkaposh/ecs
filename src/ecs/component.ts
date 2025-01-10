import { iter } from "joshkaposh-iterator";
import { is_none, is_some, type Option } from 'joshkaposh-option';
import { StorageType, Storages } from "./storage";
import { World } from "./world";
import { u32 } from "../Intrinsics";
import { MAX_CHANGE_AGE } from "./change_detection";
import { Class, TypeId } from "../define";

export type ComponentMetadata = TypeId & { readonly storage_type: StorageType };
export type ComponentId = number;
export type ComponentType<T extends new (...args: any[]) => any> = T extends Component ? T : never;
export type Component<T = any> = (new (...args: any[]) => T) & ComponentMetadata;
export type UninitComonent<T = any> = (new (...args: any[]) => T)

export type ResourceId = number;
export type ResourceMetadata<R extends new (...args: any[]) => any> = { from_world(world: World): InstanceType<R> };
export type Resource<R = Component> = R extends Class ? R & ComponentMetadata & ResourceMetadata<R> : never;

export function is_component(ty: any): ty is Component {
    return ty && typeof ty === 'object' && ty.type_id
}

export class Tick {
    #tick: number;
    static get MAX() {
        return new Tick(MAX_CHANGE_AGE)
    }

    constructor(tick: number) {
        this.#tick = tick;
    }

    clone() {
        return new Tick(this.#tick);
    }

    get() {
        return this.#tick
    }

    set(tick: number) {
        this.#tick = tick;
    }

    is_newer_than(last_run: Tick, this_run: Tick) {
        // console.log('is_new_than result', this_run, last_run);

        const ticks_since_insert = Math.min(this_run.relative_to(this).#tick, MAX_CHANGE_AGE);
        const ticks_since_system = Math.min(this_run.relative_to(last_run).#tick, MAX_CHANGE_AGE);
        // console.log('is_new_than result', ticks_since_insert > ticks_since_insert, ticks_since_system, ticks_since_insert);

        return ticks_since_system > ticks_since_insert;
    }

    relative_to(other: Tick) {
        const tick = u32.wrapping_sub(this.#tick, other.#tick);
        return new Tick(tick);
    }

    check_tick(tick: Tick): boolean {
        const age = tick.relative_to(this);
        if (age.get() > Tick.MAX.get()) {
            this.#tick = tick.relative_to(Tick.MAX).#tick;
            return true;
        } else {
            return false;
        }
    }
}

export class ComponentTicks {
    added: Tick;
    changed: Tick;

    constructor(added: Tick, changed: Tick) {
        this.added = added;
        this.changed = changed;
    }

    static new(change_tick: Tick) {
        return new ComponentTicks(change_tick, change_tick)
    }

    static default() {
        return ComponentTicks.new(new Tick(0))
    }

    is_added(last_run: Tick, this_run: Tick) {
        return this.added.is_newer_than(last_run, this_run);
    }

    is_changed(last_run: Tick, this_run: Tick) {
        return this.changed.is_newer_than(last_run, this_run);
    }

    set_changed(change_tick: Tick) {
        this.changed = change_tick;
    }
}
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

    constructor(components: ComponentInfo[] = [], indices: Map<UUID, ComponentId> = new Map(), resource_indices: Map<UUID, ComponentId> = new Map()) {
        this.#components = components;
        this.#indices = indices;
        this.#resource_indices = resource_indices;
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

    register_component(type: Component, storages: Storages) {
        return this.init_component(type, storages);
    }

    register_resource(type: Resource) {
        return this.init_resource(type)
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

    resource_id(type: Resource): number {
        const id = this.#resource_indices.get(type.type_id);
        if (is_none(id)) {
            throw new Error(`Requested Resource ${type.name} was not found in Components`)
        }
        return id;
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
            const id = this.#init_component_inner(this.#components, storages, {
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

    #init_component_inner(components: ComponentInfo[], storages: Storages, descriptor: ComponentDescriptor) {
        const component_id = components.length;
        const info = new ComponentInfo(component_id, descriptor);
        if (info.descriptor.storage_type === StorageType.SparseSet) {
            storages.sparse_sets.__get_or_insert(info);
        }

        components[component_id] = info;
        return component_id;
    }

    iter() {
        return iter(this.#components)
    }

    [Symbol.iterator]() {
        return this.iter();
    }

}