import { iter } from "joshkaposh-iterator";
import { is_none, type Option } from 'joshkaposh-option';
import { Class, TypeId } from "define";
import { StorageType } from "./storage";
import { World } from "./world";
import { u32 } from "../../intrinsics/src";
import { MAX_CHANGE_AGE } from "./change_detection";
import { Prettify, TODO } from "joshkaposh-iterator/src/util";
import { Table, TableRow } from "./storage/table";
import { SparseSets } from "./storage/sparse-set";
import { Entity } from "./entity";
import { entry, Instance } from "./util";

export type ComponentId = number;
export type ComponentMetadata = TypeId & { readonly storage_type: StorageType };
export type Component<T extends Class = Class> = T & Prettify<ComponentMetadata>;

export type ResourceId = number;
export type ResourceMetadata<R = new (...args: any[]) => any> = { from_world(world: World): Instance<R> };
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

export class TickCells {
    constructor(
        public added: Tick,
        public changed: Tick
    ) { }

    read() {
        return new ComponentTicks(this.added, this.changed)
    }
}

export type ComponentDescriptor = {
    readonly type: Component;
    readonly storage_type: StorageType;
}

export class ComponentInfo {
    #id: ComponentId;
    readonly descriptor: ComponentDescriptor;
    // #required_components: RequiredComponents;
    // #required_by: Set<ComponentId>

    constructor(id: ComponentId, descriptor: ComponentDescriptor) {
        this.#id = id;
        this.descriptor = descriptor;
        // this.#required_components = new RequiredComponents();
        // this.#required_by = new Set();
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

    register_dynamic(component_id: ComponentId, constructor: RequiredComponentConstructor, inheritance_depth: number) {
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
        TODO('RequiredComponents.register()', component, components, constructor, inheritance_depth)
        // const component_id = components.register_component(component);
        // this.register_by_id(component, component_id, constructor, inheritance_depth);
    }

    // register_by_id(component: Component, component_id: ComponentId, constructor: () => Component, inheritance_depth: number) {
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

    //     }
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

    static #register_component_inner(components: ComponentInfo[], descriptor: ComponentDescriptor) {
        const component_id = components.length;
        const info = new ComponentInfo(component_id, descriptor);
        components.push(info);
        return component_id;
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

    register_component(type: Component) {
        return this.register_component_internal(type, [])
    }

    register_resource(type: Resource) {
        return this.#get_or_register_resource_with(type.type_id, () => {
            return { type: type, storage_type: StorageType.SparseSet }
        })
    }

    register_component_internal(
        type: Component,
        // @ts-expect-error
        recursion_check_stack: ComponentId[]) {
        let is_new_registration = false;
        const indices = this.#indices;
        const components = this.#components;

        const type_id = type.type_id;


        const id = entry(indices, type_id, () => {
            const id = Components.#register_component_inner(components, { type: type, storage_type: type.storage_type } satisfies ComponentDescriptor)
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

    register_required_components<T extends Component, R extends Component>(requiree: T, required: R, ctor: new () => InstanceType<R>) {
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

    register_inherited_required_components(requiree: ComponentId, required: ComponentId): [ComponentId, RequiredComponent][] {
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

    register_required_components_manual(
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

    register_required_components_manual_unchecked(
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

    get_required_by(id: ComponentId) {
        return TODO('Components.get_required_by()', id);
        // return this.#components[id]?.required_by;
    }

    get_required_by_mut(id: ComponentId) {
        return TODO('Components.get_required_by_mut()', id);
        // return this.#components[id]?.required_by;
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

    iter() {
        return iter(this.#components)
    }

    #get_or_register_resource_with(type_id: UUID, fn: () => ComponentDescriptor) {
        const components = this.#components;
        return entry(this.#resource_indices, type_id, () => Components.#register_component_inner(components, fn()))
    }

    [Symbol.iterator]() {
        return this.iter();
    }

}