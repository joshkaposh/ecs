import { iter } from "joshkaposh-iterator";
import { type Option } from 'joshkaposh-option';
import { Class, ComponentRecord, ThinComponent, ThinResource, TypeId } from "define";
import { StorageType } from "./storage";
import { FromWorld, World } from "./world";
import { Prettify, TODO } from "joshkaposh-iterator/src/util";
import { Table, TableRow } from "./storage/table";
import { SparseSets } from "./storage/sparse-set";
import { Entity } from "./entity";
import { debug_assert, entry, is_class } from "./util";
import { Tick } from "./tick";
import { SystemMeta } from "./system";
import { v4 } from "uuid";

export * from './tick';

export type ComponentId = number;
export type ComponentMetadata = TypeId & { readonly storage_type: StorageType };
export type Component<T extends Class = Class> = T & Prettify<ComponentMetadata>;

export type ResourceId = number;
export type Resource<R extends new (...args: any[]) => any = Component> = R extends Class ? R & ComponentMetadata & FromWorld<R> : never;

export function is_component(ty: any): ty is Component {
    return is_class(ty) && 'type_id' in ty && 'storage_type' in ty;
}

export function is_thin_component(ty: any): ty is ThinComponent {
    return is_class(ty) && 'type_id' in ty && 'storage_type' in ty && 'thin' in ty;
}

class ComponentIds { }


/**
 * A `Components` wrapper that enables additional features, like registration.
 */
export class ComponentsRegistrator {
    #components: Components;
    #ids: ComponentIds;

    constructor(components: Components, ids: ComponentIds) {
        this.#components = components;
        this.#ids = ids;
    }

    // as_queued() {
    //     return new ComponentsQueuedRegistrator(this.#components, this.#ids);
    // }

    // apply_queued_registrations() {
    //     if (!this.any_queued()) {
    //         return
    //     }

    //     // components
    //     while (true) {
    //         const queued = this.#components.queued.get_mut();
    //         if (!queued) {
    //             throw new Error()
    //         }

    //         const type_id = queued.components.keys().next();
    //         if (type_id.done) {
    //             break
    //         }
    //         const registrator = queued.components.remove(type_id.value.type_id);
    //         registrator(this);

    //     }

    //     // resources
    //     while (true) {
    //         const queued = this.#components.queued.get_mut();
    //         if (!queued) {
    //             throw new Error()
    //         }

    //         const type_id = queued.resources.keys().next();
    //         if (type_id.done) {
    //             break
    //         }
    //         const registrator = queued.resources.remove(type_id.value.type_id);
    //         registrator(this);
    //     }

    //     // dynamic
    //     const queued = this.#components.queued.get_mut();
    //     if (!queued) {
    //         throw new Error();
    //     }

    //     if (!queued.dynamic_registrations.is_empty()) {
    //         const registrations = queued.dynamic_registrations;
    //         queued.dynamic_registrations = [];
    //         for (let i = 0; i < registrations.length; i++) {
    //             registrations[i].register(this)                
    //         }
    //     }
    // }

    // register_component(component: Component) {
    //     return this.register_component_checked(component, [])
    // }

    // register_component_checked(component: Component, recursion_check_stack: ComponentId[]) {
    //     const id = this.#indices.get(component.type_id)
    //     if (id != null) {
    //         return id;
    //     }

    //     const queued = this.#components.queued.get_mut();
    //     if (!queued) {
    //         throw new Error();
    //     }

    //     const registrator = queued.components.remove(component.type_id);
    //     if (registrator) {
    //         return registrator.register(this)
    //     }

    //     const next = this.#ids.next_mut()
    //     this.register_component_unchecked(recursion_check_stack, component, next)
    //     return next;
    // }

    // register_component_unchecked(recursion_check_stack: ComponentId[],type: Component, id: ComponentId) {
    //     const type_id = type.type_id;
    //     const prev = this.#indices.insert(type_id, id);
    //     debug_assert(prev == null);

    //     const required_components = new RequiredComponents();
    //     type.register_required_components(
    //         id,
    //         this,
    //         required_components,
    //         0,
    //         recursion_check_stack
    //     )

    //     const info = this.#components.get_info(id)!;
    //     info.hooks.update_from_component(type);
    //     info.required_components = required_components;
    // }

    // register_component_with_descriptor(descriptor: ComponentDescriptor) {
    //     const id = this.#ids.next_mut();
    //     this.register_component_inner(id, descriptor);
    //     return id;
    // }

    // register_resource(resource: Resource) {
    //     return this.register_resource_with(resource.type_id, () => ({type: resource, storage_type: resource.storage_type} satisfies ComponentDescriptor))
    // }
}

export type ComponentDescriptor = {
    readonly type: Component;
    readonly storage_type: StorageType;
}

export type ThinComponentDescriptor = {
    readonly type: ThinComponent;
    readonly storage_type: StorageType;
}

export class ComponentInfo {
    #id: ComponentId;
    #name: string;
    readonly descriptor: ComponentDescriptor;
    // #required_components: RequiredComponents;
    // #required_by: Set<ComponentId>

    constructor(id: ComponentId, descriptor: ComponentDescriptor) {
        this.#id = id;
        this.descriptor = descriptor;
        this.#name = descriptor.type.name;
        // this.#required_components = new RequiredComponents();
        // this.#required_by = new Set();
    }

    get name(): string {
        return this.#name;
    }

    set name(new_name: string) {
        this.#name = new_name;
    }

    get storageType(): StorageType {
        return this.descriptor.storage_type;
    }

    get type(): Component {
        return this.descriptor.type;
    }

    get id(): ComponentId {
        return this.#id
    }

    get typeId(): UUID {
        return this.descriptor.type.type_id;
    }
}

export class ThinComponentInfo {
    #id: ComponentId;
    #name: string;
    readonly descriptor: ThinComponentDescriptor;
    // #required_components: RequiredComponents;
    // #required_by: Set<ComponentId>

    constructor(id: ComponentId, descriptor: ThinComponentDescriptor) {
        this.#id = id;
        this.descriptor = descriptor;
        this.#name = `ComponentDescriptor {${id}}`
        // this.#required_components = new RequiredComponents();
        // this.#required_by = new Set();
    }

    get name(): string {
        return this.#name;
    }

    set name(new_name: string) {
        this.#name = new_name;
    }

    get storageType(): StorageType {
        return this.descriptor.storage_type;
    }

    get type(): ThinComponent {
        return this.descriptor.type;
    }

    get id(): ComponentId {
        return this.#id
    }

    get typeId(): UUID {
        return this.descriptor.type.type_id;
    }
}

export class RequiredComponentConstructor {
    ctor: (table: Table, sparse_sets: SparseSets, tick: Tick, table_row: TableRow, entity: Entity) => void;
    constructor(ctor: (table: Table, sparse_sets: SparseSets, tick: Tick, table_row: TableRow, entity: Entity) => void) {
        this.ctor = ctor;
    }

    clone() {
        return new RequiredComponentConstructor(this.ctor);
    }
}

export class RequiredComponent {
    ctor: RequiredComponentConstructor;
    inheritance_depth: number;

    constructor(ctor: RequiredComponentConstructor, inheritance_depth: number) {
        this.ctor = ctor;
        this.inheritance_depth = inheritance_depth;
    }

    clone() {
        return new RequiredComponent(this.ctor.clone(), this.inheritance_depth);
    }
}

export class RequiredComponents {
    map: Map<ComponentId, RequiredComponent>
    constructor() {
        this.map = new Map();
    }

    registerDynamic(component_id: ComponentId, constructor: RequiredComponentConstructor, inheritance_depth: number) {
        const component = this.map.get(component_id);
        if (component) {
            if (component.inheritance_depth > inheritance_depth) {
                component.ctor = constructor.clone();
            }
        } else {
            this.map.set(component_id, new RequiredComponent(constructor, inheritance_depth))
        }
    }

    register(component: Component, components: Components, constructor: () => Component, inheritance_depth: number) {
        const component_id = components.registerComponent(component);
        this.registerById(component, component_id, constructor, inheritance_depth);
    }

    registerById(component: Component, component_id: ComponentId, constructor: () => Component, inheritance_depth: number) {
        TODO('RequiredComponents.register_by_id()', component, component_id, constructor, inheritance_depth)

        //     const erased = new RequiredComponentConstructor((table, sparse_sets, change_tick, table_row, entity) => {
        //         const ptr = constructor();
        //         BundleInfo.initialize_required_component(table, sparse_sets, change_tick, table_row, entity, component_id, component.storage_type, ptr)
        //     })

        //     return this.register_dynamic(component_id, erased, inheritance_depth);
        // }

        //     iter_ids() {
        //         return iter(this.map.keys());
        //     }

        //     remove_explicit_components(components: ComponentId[]) {
        //         for (let i = 0; i < components.length; i++) {
        //             this.map.delete(components[i])
        //         }
        //     }

        //     merge(required_components: RequiredComponents) {
        //         for (const [id, constructor] of required_components.map.entries()) {
        //             if (!this.map.get(id)) {
        //                 this.map.set(id, constructor.clone())
        //             }
        //         }
        //     }

        //     enforce_no_required_components_recursion() {

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

    static init_state() { }

    static get_param(_state: void, _system_meta: SystemMeta, world: World) {
        return world.components;
    }



    static #registerComponentInner(components: ComponentInfo[], descriptor: ComponentDescriptor) {
        const component_id = components.length;
        const info = new ComponentInfo(component_id, descriptor);
        components.push(info);
        return component_id;
    }

    hasTypeId(type_id: UUID): boolean {
        return this.#indices.has(type_id);
    }

    hasComponent(component: Component): boolean {
        return this.#indices.has(component.type_id)
    }

    hasResource(resource: Resource<Component>): boolean {
        return this.#resource_indices.has(resource.type_id)
    }

    hasResourceTypeId(type_id: UUID): boolean {
        return this.#resource_indices.has(type_id)
    }

    registerComponent(type: Component) {
        return this.registerComponentInternal(type, [])
    }

    registerResource(type: Resource) {
        return this.#getOrRegisterResourceWith(type.type_id, () => {
            return { type: type, storage_type: StorageType.SparseSet }
        })
    }

    registerComponentInternal(
        type: Component,
        // @ts-expect-error
        recursion_check_stack: ComponentId[]) {
        let is_new_registration = false;
        const indices = this.#indices;
        const components = this.#components;

        const type_id = type.type_id;


        const id = entry(indices, type_id, () => {
            const id = Components.#registerComponentInner(components, { type: type, storage_type: type.storage_type } satisfies ComponentDescriptor)
            is_new_registration = true;
            return id;
        })

        if (is_new_registration) {
            // const required_components = new RequiredComponents();
            // type.register_required_components(id, this, required_components, 0, recursion_check_stack);
            // const info = this.#components[id];
            // info.required_components = required_components;
        }

        return id;
    }

    registerRequiredComponents<T extends Component, R extends Component>(requiree: T, required: R, ctor: new () => InstanceType<R>) {
        TODO('Components.register_required_components()', requiree, required, ctor)
        // const required_components = this.get_required_components_mut(requiree);

        // const has = required_components.value.get(required);
        // if (is_some(has) && has.inheritance_depth === 0) {
        //     return RequiredComponentsError.DuplicateRegistration(requiree, required);
        // }

        // /**
        //  * Register the required component for the requiree.
        //  * This is a direct requirement with a depth of 0
        //  */
        // required_components.register_by_id(required, ctor, 0);
        // const required_by = this.get_required_by_mut(required);
        // required_by.insert(requiree);

        // const inherited_requirements = this.register_inherited_required_components(requiree);

        // const req_by = this.get_required_by(requiree);
        // if (req_by) {
        //     this.get_required_by_mut(required).extend(required_by);

        //     for (const required_by_id of required_by.iter()) {
        //         const required_components = this.get_required_components_mut(required_by_id);
        //         const depth = required_components.value.get(requiree).inheritance_depth;
        //         required_components.register_by_id(required, ctor, depth + 1);

        //         for (const [component_id, component] of inherited_requirements) {
        //             required_components.register_dynamic(component_id, component.constructor, component.inheritance_depth + depth + 1);
        //         }
        //     }
        // }
    }

    registerInheritedRequiredComponents(requiree: ComponentId, required: ComponentId): [ComponentId, RequiredComponent][] {
        return TODO('Components.register_inherited_required_components()', required, requiree)
        //     const required_component_info = this.get_info(required);
        //     const inherited_requirements = required_component_info
        //         .required_components()
        //         .value
        //         .iter()
        //         .map(([component_id, required_component]) => [component_id, new required_component(required_component.constructor, required_component.inheritance_depth + 1)])
        //         .collect();

        //     for (const [component_id, component] of inherited_requirements.iter()) {
        //         const required_components = this.get_required_component_mut(requiree)

        //         required_components.register_dynamic(
        //             component_id,
        //             component.constructor,
        //             component.inheritance_depth
        //         )

        //         const required_by = this.get_required_by_mut(component_id);
        //         required_by.insert(requiree);
        //     }

        //     return inherited_requirements;
    }

    registerRequiredComponentsManual(
        type: Component,
        required: Component,
        required_components: RequiredComponents,
        ctor: new () => Component,
        inheritance_depth: number,
        recursion_check_stack: ComponentId[]
    ) {
        TODO('Components.register_required_components_manual()', type, required, required_components, ctor, inheritance_depth, recursion_check_stack)
        // const requiree = this.register_component_internal(type, recursion_check_stack);
        // const req = this.register_component_internal(required, recursion_check_stack);
        // this.register_required_components_manual_unchecked(required, requiree, req, required_components, ctor, inheritance_depth);
    }

    registerRequiredComponentsManualUnchecked(
        req: Component,
        requiree: ComponentId,
        required: Component,
        required_components: RequiredComponents,
        ctor: new () => Component,
        inheritance_depth: number
    ) {
        TODO('Components.register_required_components_manual_unchecked()', req, requiree, required, required_components, ctor, inheritance_depth)
        // if (required === requiree) {
        //     return
        // }

        // required_components.register_by_id(required, ctor, inheritance_depth);

        // const required_by = this.get_required_by_mut(required);
        // required_by.insert(requiree);

        // const required_array = this.get_info(required)!
        //     .required_components()
        //     .value

        // for (const [id, component] of required_array) {
        //     required_components.register_dynamic(
        //         id,
        //         component.constructor,
        //         component.inheritance_depth + 1
        //     )

        //     this.get_required_by_mut(id)!.insert(requiree);
        // }
    }

    getRequiredBy(id: ComponentId) {
        return TODO('Components.get_required_by()', id);
        // return this.#components[id]?.required_by;
    }

    getRequiredByMut(id: ComponentId) {
        return TODO('Components.get_required_by_mut()', id);
        // return this.#components[id]?.required_by;
    }

    getInfo(id: ComponentId): Option<ComponentInfo> {
        return this.#components[id]
    }

    info(id: ComponentId) {
        const info = this.#components[id];
        if (!info) {
            throw new Error(`Requested ComponentInfo for ${id} does not exist in this World. Did you forget to initialize it?`)
        }
        return info
    }

    getName(id: ComponentId): Option<string> {
        return this.getInfo(id)?.name;
    }

    getId(type: TypeId): Option<ComponentId> {
        return this.#indices.get(type.type_id);
    }

    getIdTypeId(type_id: UUID): Option<ComponentId> {
        return this.#indices.get(type_id);
    }

    resourceId(type: Resource): number {
        const id = this.#resource_indices.get(type.type_id);
        if (id == null) {
            throw new Error(`Requested Resource ${type.name} was not found in Components`)
        }
        return id;
    }

    getResourceId(type: TypeId): Option<ResourceId> {
        return this.#resource_indices.get(type.type_id);
    }

    getComponentId(type: Component): Option<ComponentId> {
        return this.#indices.get(type.type_id);
    }

    componentId(type: TypeId): ComponentId {
        const id = this.#indices.get(type.type_id);
        if (id == null) throw new Error(`Component ${type} does not exist in this [\`World\`] `);
        return id;
    }

    #getOrRegisterResourceWith(type_id: UUID, fn: () => ComponentDescriptor) {
        const components = this.#components;
        return entry(this.#resource_indices, type_id, () => Components.#registerComponentInner(components, fn()))
    }

    iter() {
        return iter(this.#components)
    }

    [Symbol.iterator]() {
        return this.iter();
    }

}

export class ThinComponents {
    #components: ThinComponentInfo[];
    #indices: Map<UUID, ComponentId>;
    #resource_indices: Map<UUID, ComponentId>;

    constructor(components: ThinComponentInfo[] = [], indices: Map<UUID, ComponentId> = new Map(), resource_indices: Map<UUID, ComponentId> = new Map()) {
        this.#components = components;
        this.#indices = indices;
        this.#resource_indices = resource_indices;
    }

    static #registerComponentInner(components: ThinComponentInfo[], descriptor: ThinComponentDescriptor) {
        const component_id = components.length;
        const info = new ThinComponentInfo(component_id, descriptor);
        components.push(info);
        return component_id;
    }

    hasTypeId(type_id: UUID): boolean {
        return this.#indices.has(type_id);
    }

    hasComponent(component: ComponentMetadata): boolean {
        return this.#indices.has(component.type_id)
    }

    hasResource(resource: ThinResource): boolean {
        return this.#resource_indices.has(resource.type_id)
    }

    hasResourceTypeId(type_id: UUID): boolean {
        return this.#resource_indices.has(type_id)
    }

    registerComponent(type: ComponentMetadata) {
        return this.registerComponentInternal(type as any, [])
    }

    registerResource(type: ThinResource) {
        return this.#getOrRegisterResourceWith(type.type_id,
            () => ({ type, storage_type: StorageType.SparseSet })
        )
    }

    registerComponentInternal(
        type: ComponentMetadata,
        // @ts-expect-error
        recursion_check_stack: ComponentId[]) {
        let is_new_registration = false;
        const indices = this.#indices;
        const components = this.#components;

        const type_id = type.type_id;


        const id = entry(indices, type_id, () => {
            const id = ThinComponents.#registerComponentInner(components, { storage_type: type.storage_type, type: type as any })
            is_new_registration = true;
            return id;
        })

        if (is_new_registration) {
            // const required_components = new RequiredComponents();
            // type.register_required_components(id, this, required_components, 0, recursion_check_stack);
            // const info = this.#components[id];
            // info.required_components = required_components;
        }

        return id;
    }

    registerRequiredComponents<T extends Component, R extends Component>(requiree: T, required: R, ctor: new () => InstanceType<R>) {
        TODO('Components.register_required_components()', requiree, required, ctor)
        // const required_components = this.get_required_components_mut(requiree);

        // const has = required_components.value.get(required);
        // if (is_some(has) && has.inheritance_depth === 0) {
        //     return RequiredComponentsError.DuplicateRegistration(requiree, required);
        // }

        // /**
        //  * Register the required component for the requiree.
        //  * This is a direct requirement with a depth of 0
        //  */
        // required_components.register_by_id(required, ctor, 0);
        // const required_by = this.get_required_by_mut(required);
        // required_by.insert(requiree);

        // const inherited_requirements = this.register_inherited_required_components(requiree);

        // const req_by = this.get_required_by(requiree);
        // if (req_by) {
        //     this.get_required_by_mut(required).extend(required_by);

        //     for (const required_by_id of required_by.iter()) {
        //         const required_components = this.get_required_components_mut(required_by_id);
        //         const depth = required_components.value.get(requiree).inheritance_depth;
        //         required_components.register_by_id(required, ctor, depth + 1);

        //         for (const [component_id, component] of inherited_requirements) {
        //             required_components.register_dynamic(component_id, component.constructor, component.inheritance_depth + depth + 1);
        //         }
        //     }
        // }
    }

    registerInheritedRequiredComponents(requiree: ComponentId, required: ComponentId): [ComponentId, RequiredComponent][] {
        return TODO('Components.register_inherited_required_components()', required, requiree)
        //     const required_component_info = this.get_info(required);
        //     const inherited_requirements = required_component_info
        //         .required_components()
        //         .value
        //         .iter()
        //         .map(([component_id, required_component]) => [component_id, new required_component(required_component.constructor, required_component.inheritance_depth + 1)])
        //         .collect();

        //     for (const [component_id, component] of inherited_requirements.iter()) {
        //         const required_components = this.get_required_component_mut(requiree)

        //         required_components.register_dynamic(
        //             component_id,
        //             component.constructor,
        //             component.inheritance_depth
        //         )

        //         const required_by = this.get_required_by_mut(component_id);
        //         required_by.insert(requiree);
        //     }

        //     return inherited_requirements;
    }

    registerRequiredComponentsManual(
        type: Component,
        required: Component,
        required_components: RequiredComponents,
        ctor: new () => Component,
        inheritance_depth: number,
        recursion_check_stack: ComponentId[]
    ) {
        TODO('Components.register_required_components_manual()', type, required, required_components, ctor, inheritance_depth, recursion_check_stack)
        // const requiree = this.register_component_internal(type, recursion_check_stack);
        // const req = this.register_component_internal(required, recursion_check_stack);
        // this.register_required_components_manual_unchecked(required, requiree, req, required_components, ctor, inheritance_depth);
    }

    registerRequiredComponentsManualUnchecked(
        req: Component,
        requiree: ComponentId,
        required: Component,
        required_components: RequiredComponents,
        ctor: new () => Component,
        inheritance_depth: number
    ) {
        TODO('Components.register_required_components_manual_unchecked()', req, requiree, required, required_components, ctor, inheritance_depth)
        // if (required === requiree) {
        //     return
        // }

        // required_components.register_by_id(required, ctor, inheritance_depth);

        // const required_by = this.get_required_by_mut(required);
        // required_by.insert(requiree);

        // const required_array = this.get_info(required)!
        //     .required_components()
        //     .value

        // for (const [id, component] of required_array) {
        //     required_components.register_dynamic(
        //         id,
        //         component.constructor,
        //         component.inheritance_depth + 1
        //     )

        //     this.get_required_by_mut(id)!.insert(requiree);
        // }
    }

    getRequiredBy(id: ComponentId) {
        return TODO('Components.get_required_by()', id);
        // return this.#components[id]?.required_by;
    }

    getRequiredByMut(id: ComponentId) {
        return TODO('Components.get_required_by_mut()', id);
        // return this.#components[id]?.required_by;
    }

    getInfo(id: ComponentId): Option<ThinComponentInfo> {
        return this.#components[id]
    }

    getName(id: ComponentId): Option<string> {
        return this.getInfo(id)?.name;
    }

    getId(type: TypeId): Option<ComponentId> {
        return this.#indices.get(type.type_id)
    }

    getIdTypeId(type_id: UUID): Option<ComponentId> {
        return this.#indices.get(type_id);
    }

    resourceId(type: Resource): number {
        const id = this.#resource_indices.get(type.type_id);
        if (id == null) {
            throw new Error(`Requested Resource ${type.name} was not found in Components`)
        }
        return id;
    }

    getResourceId(type: Component): Option<ResourceId> {
        return this.#resource_indices.get(type.type_id);
    }

    getComponentId(type: Component): Option<ComponentId> {
        return this.#indices.get(type.type_id);

    }

    componentId(type: Component): ComponentId {
        const id = this.#indices.get(type.type_id);
        if (id == null) {
            throw new Error(`Requested Resource ${type.name} was not found in Components`)
        }
        return id;

    }

    #getOrRegisterResourceWith(type_id: UUID, fn: () => ThinComponentDescriptor) {
        const components = this.#components;
        return entry(this.#resource_indices, type_id, () => ThinComponents.#registerComponentInner(components, fn()))
    }

    iter() {
        return iter(this.#components)
    }

    [Symbol.iterator]() {
        return this.iter();
    }
}

export function defineComponent<T>(ty: T, storage_type: StorageType = 0): T & Prettify<ComponentMetadata> {
    // @ts-expect-error
    ty.type_id = v4()
    // @ts-expect-error
    ty.storage_type = storage_type;
    return ty as T & ComponentMetadata;
}

export function defineMarker(): Component {
    const marker = class { }
    defineComponent(marker, 1);
    return marker as Component
}