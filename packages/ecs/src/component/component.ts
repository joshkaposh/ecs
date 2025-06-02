import { iter } from "joshkaposh-iterator";
import { assert, split_first, TODO } from "joshkaposh-iterator/src/util";
import { u32, type Option } from 'joshkaposh-option';
import type { ThinComponent, ThinResource } from "define";
import { StorageType } from "../storage";
import type { World } from "../world";
import type { Table, TableRow, SparseSets } from "../storage";
import type { Entity } from "../entity";
import type { SystemMeta } from "../system/function-system";
import { Class, debug_assert, entry, is_class, type TypeId } from "../util";
import type { Component, ComponentHook, ComponentId, Resource, ResourceId, Tick } from './component.types'
import { MAX_CHANGE_AGE } from "../change_detection";
import { ArchetypeFlags } from "../archetype";
import { RelationshipHookMode } from "../relationship";
import { set } from "fixed-bit-set/src/bit";
import { BundleInfo } from "../bundle";
import { split_at, split_last } from "../array-helpers";

const PoisonError = {
    into_inner() {
        return new Error('PoisonError');
    }
} as const;

export function relative_to(tick: number, other: number) {
    return u32.wrapping_sub(tick, other);
}

export function is_newer_than(tick: number, last_run: number, this_run: number) {
    const ticks_since_insert = Math.min(relative_to(this_run, tick), MAX_CHANGE_AGE);
    const ticks_since_system = Math.min(relative_to(this_run, last_run), MAX_CHANGE_AGE);

    return ticks_since_system > ticks_since_insert;
}

export function check_tick(self: number, tick: number) {
    return relative_to(tick, self) > MAX_CHANGE_AGE;
}

export function check_tick_and_assign(self: number, tick: number) {
    return check_tick(self, tick) ? relative_to(tick, MAX_CHANGE_AGE) : self;
}

export function is_component(ty: any): ty is Component {
    return is_class(ty) && 'type_id' in ty && 'storage_type' in ty;
}

export function is_thin_component(ty: any): ty is ThinComponent {
    return is_class(ty) && 'type_id' in ty && 'storage_type' in ty && 'thin' in ty;
}

export class HookContext {
    entity: Entity;
    component_id: ComponentId;
    relationship_hook_mode: RelationshipHookMode;

    constructor(entity: Entity, component_id: ComponentId, relationship_hook_mode: RelationshipHookMode) {
        this.entity = entity;
        this.component_id = component_id;
        this.relationship_hook_mode = relationship_hook_mode;
    }
}

export class ComponentHooks {
    on_add: Option<ComponentHook>;
    on_insert: Option<ComponentHook>;
    on_replace: Option<ComponentHook>;
    on_remove: Option<ComponentHook>;
    on_despawn: Option<ComponentHook>;

    constructor(
        on_add: Option<ComponentHook> = null,
        on_insert: Option<ComponentHook> = null,
        on_replace: Option<ComponentHook> = null,
        on_remove: Option<ComponentHook> = null,
        on_despawn: Option<ComponentHook> = null
    ) {
        this.on_add = on_add;
        this.on_insert = on_insert;
        this.on_replace = on_replace;
        this.on_remove = on_remove;
        this.on_despawn = on_despawn;
    }

    updateFromComponent(component: Component) {
        let hook;
        if (hook = component.on_add()) {
            this.onAdd(hook);
        } else if (hook = component.on_insert()) {
            this.onInsert(hook);

        } else if (hook = component.on_replace()) {
            this.onReplace(hook);

        } else if (hook = component.on_remove()) {
            this.onRemove(hook);
        } else if (hook = component.on_despawn()) {
            this.onDespawn(hook);
        }

        return this;
    }

    onAdd(hook: ComponentHook) {
        this.on_add ??= hook;
        return this;
    };

    onInsert(hook: ComponentHook) {
        this.on_insert ??= hook;
        return this;
    };

    onReplace(hook: ComponentHook) {
        this.on_replace ??= hook;
        return this;
    };

    onRemove(hook: ComponentHook) {
        this.on_remove ??= hook;
        return this;
    };

    onDespawn(hook: ComponentHook) {
        this.on_despawn ??= hook;
        return this;
    };

}

export class ComponentTicks {
    added: Tick;
    changed: Tick;

    constructor(added: Tick = 0, changed: Tick = 0) {
        this.added = added;
        this.changed = changed;
    }

    is_added(last_run: Tick, this_run: Tick) {
        return is_newer_than(this.added, last_run, this_run);
    }

    is_changed(last_run: Tick, this_run: Tick) {
        return is_newer_than(this.changed, last_run, this_run);
    }

    set_changed(change_tick: Tick) {
        this.changed = change_tick;
    }
}

class ComponentIds {
    #next: number;

    constructor(next: number) {
        this.#next = next;
    }

    peek() {
        return this.#next;
    }

    next() {
        return this.#next += 1;
    }

    len() {
        return this.peek();
    }

    is_empty() {
        return this.len() === 0;
    }
}

export class ComponentsQueuedRegistrator {
    #components: Components;
    #ids: ComponentIds;

    constructor(components: Components, ids: ComponentIds) {
        this.#components = components;
        this.#ids = ids;
    }

    /**
     * Queues this function to run as a component registrator
     */
    forceRegisterArbitraryComponent(type_id: UUID, descriptor: ComponentDescriptor, func: (registrator: ComponentsRegistrator, component_id: ComponentId, descriptor: ComponentDescriptor) => void) {
        const id = this.#ids.next();
        this.#components
            .queued
            .components
            .set(type_id, new QueuedRegistration(func, id, descriptor))
    }

    /**
     * Queues this function to run as a resource registrator
     */
    forceRegisterArbitraryResource(type_id: UUID, descriptor: ComponentDescriptor, func: (registrator: ComponentsRegistrator, component_id: ComponentId, descriptor: ComponentDescriptor) => void) {
        const id = this.#ids.next();
        this.#components
            .queued
            .resources
            .set(type_id, new QueuedRegistration(func, id, descriptor))
    }


    /**
     * Queues this function to run as a dynamic registrator
     */
    forceRegisterArbitraryDynamic(descriptor: ComponentDescriptor, func: (registrator: ComponentsRegistrator, component_id: ComponentId, descriptor: ComponentDescriptor) => void) {
        this.#components
            .queued
            .dynamic_registrations
            .push(new QueuedRegistration(func, this.#ids.next(), descriptor));
    }

    queueRegisterComponent(component: Component) {
        return this.#components.componentId(component) ?? this.forceRegisterArbitraryComponent(component.type_id, {
            mutable: component.MUTABLE,
            type: component,
            type_id: component.type_id,
            storage_type: component.storage_type,
            drop: null,
            clone_behavior: ComponentCloneBehavior.Default
        }, (registrator, id) => registrator.registerComponentUnchecked(component, [], id))
    }

    queueRegisterComponentWithDescriptor(descriptor: ComponentDescriptor) {
        return this.forceRegisterArbitraryDynamic(descriptor, (registrator, id, descriptor) => registrator.registerComponentInner(id, descriptor))
    }

    queueRegisterResource(resource: Resource) {
        return this.#components.resourceId(resource) ?? this.forceRegisterArbitraryResource(resource.type_id, {
            mutable: resource.MUTABLE,
            type: resource,
            type_id: resource.type_id,
            storage_type: StorageType.Table,
            drop: null,
            clone_behavior: ComponentCloneBehavior.Default
        }, (registrator, id, descriptor) => registrator.registerResourceUnchecked(resource.type_id, id, descriptor));
    }

    queueRegisterResourceWithDescriptor(descriptor: ComponentDescriptor) {
        return this.forceRegisterArbitraryDynamic(descriptor, (registrator, id) => registrator.registerComponentInner(id, descriptor));
    }


}


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

    get components() {
        return this.#components;
    }

    get ids() {
        return this.#ids;
    }

    asQueued() {
        return new ComponentsQueuedRegistrator(this.#components, this.#ids);
    }

    anyQueued() {
        return false;
    }

    applyQueuedRegistrations() {
        if (!this.anyQueued()) {
            return
        }

        const queued = this.#components.queued;
        let type_id: IteratorResult<UUID>;
        // components
        while (!(type_id = queued.components.keys().next()).done) {
            const registrator = queued.components.get(type_id.value)!;
            queued.components.delete(type_id.value);
            registrator.register(this);

        }

        // resources
        while (!(type_id = queued.resources.keys().next()).done) {
            const registrator = queued.resources.get(type_id.value)!;
            queued.resources.delete(type_id.value);
            registrator.register(this);
        }

        // dynamic
        if (queued.dynamic_registrations.length > 0) {
            const registrations = queued.dynamic_registrations;
            queued.dynamic_registrations = [];
            for (let i = 0; i < registrations.length; i++) {
                registrations[i].register(this)
            }
        }
    }

    registerComponent(component: Component) {
        return this.registerComponentChecked(component, [])
    }

    registerComponentChecked(component: Component, recursion_check_stack: ComponentId[]) {
        const type_id = component.type_id;
        let id = this.#components.getIdTypeId(type_id);

        if (id != null) {
            return id;
        }

        const registrator = this.#components.queued.components.get(type_id);
        this.#components.queued.components.delete(type_id);

        if (registrator) {
            return registrator.register(this)
        }

        id = this.ids.next();

        this.registerComponentUnchecked(component, recursion_check_stack, id);

        return id;

    }

    registerComponentUnchecked(type: Component, recursion_check_stack: ComponentId[], id: ComponentId) {
        const type_id = type.type_id;

        this.registerComponentInner(id, {
            type: type,
            type_id: type_id,
            storage_type: type.storage_type,
            mutable: type.MUTABLE,
            drop: null,
            clone_behavior: ComponentCloneBehavior.Default,

        });

        const prev = this.#components.hasTypeId(type_id);
        this.#components.registerComponent(type);
        const required_components = new RequiredComponents();
        type.registerRequiredComponents(
            id,
            this,
            required_components,
            0,
            recursion_check_stack
        );

        const info = this.#components
            .getInfo(id)!;

        info.hooks.updateFromComponent(type);
        info.required_components = required_components;

    }

    registerComponentWithDescriptor(descriptor: ComponentDescriptor) {
        const id = this.#ids.next()
        this.registerComponentInner(id, descriptor);
        return id;
    }

    registerRequiredComponentsManual(component: Component, required_type: Component, required_components: RequiredComponents, constructor: () => InstanceType<Component>, inheritance_depth: number, recursion_check_stack: ComponentId[]) {
        const requiree = this.registerComponentChecked(component, recursion_check_stack);
        const required = this.registerComponentChecked(required_type, recursion_check_stack);

        this.registerRequiredComponentsManualUnchecked(required_type, requiree, required, required_components, constructor, inheritance_depth);
    }

    registerRequiredComponentsManualUnchecked(_required_type: Component, _requiree: any, _required: any, _required_components: RequiredComponents, _constructor: () => InstanceType<Component>, _inheritance_depth: number) { }

    registerComponentInner(id: ComponentId, descriptor: ComponentDescriptor) {
        // const info = new ComponentInfo(id, descriptor);
        // const least_len = id + 1;
        // if (this.#components.len() < least_len) {
        // }
    }

    registerResource(resource: Resource) {
        return this.registerResourceWith(resource.type_id, () => ({
            type: resource,
            type_id: resource.type_id,
            storage_type: StorageType.Table,
            mutable: resource.MUTABLE ?? true,
            clone_behavior: ComponentCloneBehavior.Default,
            drop: null
        }));
    }

    registerResourceWith(_type_id: UUID, _descriptor: () => ComponentDescriptor) {

    }

    registerResourceUnchecked(_type_id: UUID, _id: ResourceId, _descriptor: ComponentDescriptor) {

    }
}

type SourceComponent = any;
type ComponentCloneCtx = any;
export type ComponentCloneFn = (source_component: SourceComponent, component_clone_context: ComponentCloneCtx) => void;

export type ComponentCloneBehavior = 0 | 1 | ComponentCloneFn;
export const ComponentCloneBehavior = {
    Default: 0, Ignore: 1,
    Custom(fn: ComponentCloneFn) { return fn }
} as const;

export interface ComponentDescriptor<T extends {} = Class> {
    readonly type: T;
    readonly type_id: UUID;
    readonly storage_type: StorageType;
    readonly mutable: boolean;
    readonly drop: Option<(ptr: {}) => void>
    readonly clone_behavior: ComponentCloneBehavior;
}

export function ComponentDescriptor(type: Component): ComponentDescriptor {
    return {
        type,
        type_id: type.type_id,
        storage_type: type.storage_type,
        mutable: type.MUTABLE,
        clone_behavior: ComponentCloneBehavior.Default,
        drop: null
    }
}

export type ThinComponentDescriptor = {
    readonly type: ThinComponent;
    readonly storage_type: StorageType;
}

export class ComponentInfo {
    #id: ComponentId;
    #descriptor: ComponentDescriptor;
    required_components: RequiredComponents;
    required_by: Set<ComponentId>
    #hooks: ComponentHooks;

    constructor(id: ComponentId, descriptor: ComponentDescriptor) {
        this.#id = id;
        this.#descriptor = descriptor;
        this.required_components = new RequiredComponents();
        this.required_by = new Set();
        this.#hooks = new ComponentHooks();
    }

    get id() {
        return this.#id;
    }

    get name() {
        return this.#descriptor.type.name;
    }

    get mutable() {
        return this.#descriptor.mutable;
    }

    get type_id() {
        return this.#descriptor.type_id;
    }

    get storage_type() {
        return this.#descriptor.storage_type;
    }

    get clone_behavior() {
        return this.#descriptor.clone_behavior;
    }

    get type() {
        return this.#descriptor.type;
    }

    get descriptor() {
        return this.#descriptor;
    }

    get hooks() {
        return this.#hooks;
    }

    updateArchetypeFlags(flags: ArchetypeFlags) {
        const { on_add, on_insert, on_replace, on_remove, on_despawn } = this.#hooks;
        if (on_add) {
            flags = set(flags, ArchetypeFlags.ON_ADD_HOOK);
        }

        if (on_insert) {
            flags = set(flags, ArchetypeFlags.ON_INSERT_HOOK);
        }

        if (on_replace) {
            flags = set(flags, ArchetypeFlags.ON_REPLACE_HOOK);
        }

        if (on_remove) {
            flags = set(flags, ArchetypeFlags.ON_REMOVE_HOOK);
        }


        if (on_despawn) {
            flags = set(flags, ArchetypeFlags.ON_DESPAWN_HOOK);
        }

        return flags;

    }

    [Symbol.toPrimitive]() {
        return `ComponentDescriptor {
            name: ${this.name},
            storage_type: ${this.storage_type},
            type_id: ${this.type_id},
            mutable: ${this.mutable},
            clone_behavior: ${this.clone_behavior}
        }`
    }

    [Symbol.toStringTag]() {
        return this[Symbol.toPrimitive]();
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

    get storage_type(): StorageType {
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

    updateArchetypeFlags(_flags: ArchetypeFlags) {

    }
}

/**
 * Queued component registration
 */
class QueuedRegistration {
    id: ComponentId;
    #registrator: (registrator: ComponentsRegistrator, component_id: ComponentId, descriptor: ComponentDescriptor) => void;
    #descriptor: ComponentDescriptor;

    constructor(registrator: (registrator: ComponentsRegistrator, component_id: ComponentId, descriptor: ComponentDescriptor) => void, id: ComponentId, descriptor: ComponentDescriptor) {
        this.#registrator = registrator;
        this.#descriptor = descriptor;
        this.id = id;
    }

    register(registrator: ComponentsRegistrator) {
        this.#registrator(registrator, this.id, this.#descriptor);
        return this.id;
    }
}

export class QueuedComponents {
    components: Map<UUID, QueuedRegistration>;
    resources: Map<UUID, QueuedRegistration>;
    dynamic_registrations: Array<QueuedRegistration>;

    constructor(
        components = new Map<UUID, QueuedRegistration>(),
        resources = new Map<UUID, QueuedRegistration>(),
        dynamic_registrations: QueuedRegistration[] = [],

    ) {
        this.components = components;
        this.resources = resources;
        this.dynamic_registrations = dynamic_registrations;
    }

    [Symbol.toPrimitive]() {
        const components = Array.from(this.components.entries()).map(([type_id, queued]) => [type_id, queued.id]);
        const resources = Array.from(this.resources.entries()).map(([type_id, queued]) => [type_id, queued.id]);
        const dynamic_registrations = this.dynamic_registrations.map(queued => queued.id);

        return `QueuedComponents {
            components: ${components},
            resources: ${resources},
            dynamic_registrations: ${dynamic_registrations}
        }`;
    }

    [Symbol.toStringTag]() {
        const components = Array.from(this.components.entries()).map(([type_id, queued]) => [type_id, queued.id]);
        const resources = Array.from(this.resources.entries()).map(([type_id, queued]) => [type_id, queued.id]);
        const dynamic_registrations = this.dynamic_registrations.map(queued => queued.id);

        return `QueuedComponents {
            components: ${components},
            resources: ${resources},
            dynamic_registrations: ${dynamic_registrations}
        }`;
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
    inner: Map<ComponentId, RequiredComponent>
    constructor() {
        this.inner = new Map();
    }

    registerDynamic(component_id: ComponentId, constructor: RequiredComponentConstructor, inheritance_depth: number) {
        const component = this.inner.get(component_id);
        if (component) {
            if (component.inheritance_depth > inheritance_depth) {
                component.ctor = constructor.clone();
            }
        } else {
            this.inner.set(component_id, new RequiredComponent(constructor, inheritance_depth))
        }
    }

    register(component: Component, components: Components, constructor: () => InstanceType<Component>, inheritance_depth: number) {
        this.registerById(component, components.registerComponent(component), constructor, inheritance_depth);
    }

    registerById(type: Component, component_id: ComponentId, constructor: () => InstanceType<Component>, inheritance_depth: number) {
        return this.registerDynamicWith(component_id, inheritance_depth, () => new RequiredComponentConstructor((table, sparse_sets, change_tick, table_row, entity) => {
            BundleInfo.initializeRequiredComponent(table, sparse_sets, change_tick, table_row, entity, component_id, type.storage_type, constructor());
        }));
    }

    registerDynamicWith(component_id: ComponentId, inheritance_depth: number, ctor: () => RequiredComponentConstructor) {
        const required_component = this.inner.get(component_id);
        if (required_component) {
            if (required_component.inheritance_depth > inheritance_depth) {
                required_component.ctor = ctor();
                required_component.inheritance_depth = inheritance_depth;
            }
        } else {
            this.inner.set(component_id, new RequiredComponent(ctor(), inheritance_depth));
        }
    }

    iterIds() {
        return iter(this.inner.keys());
    }

    removeExplicitComponents(components: ComponentId[]) {
        for (let i = 0; i < components.length; i++) {
            this.inner.delete(components[i]);
        }
    }

    /**
     * Merges `required_components` into this collection. This only inserts a required component
     * if it did not already exist *or* if the required component is more specific than the existing one
     * (in other words, if the inheritance depth is smaller).
     * 
     * @see [`RequiredComponents.registerDynamicWith`] for details.
     */
    merge(required_components: RequiredComponents) {
        for (const [component_id, { ctor, inheritance_depth }] of required_components.inner.entries()) {
            this.registerDynamicWith(component_id, inheritance_depth, () => ctor.clone());
        }
    }

    enforceNoRequiredComponentsRecursion(components: Components, recursion_check_stack: ComponentId[]) {
        const tuple = split_last(recursion_check_stack);
        if (tuple) {
            const [requiree, check] = tuple;
            const idx = check.indexOf(requiree);

            if (idx != -1) {
                const direct_recursion = idx === check.length - 1;
                if (direct_recursion) {
                    throw new Error(`Recursive required components detected: ${recursion_check_stack.map(id => components.getName(id)!).join(' -> ')}\nhelp: ${direct_recursion ? `remove require(${components.getName(requiree)!})` : 'If this is intentional, consider merging the components'}`);
                }

            }
        }
    }

}

export function component_clone_via_clone(type: Component, source: SourceComponent, ctx: ComponentCloneCtx) {
    const component = source.read(type);
    if (component) {
        ctx.writeTargetComponent(component.clone());
    }
}

export function component_clone_via_reflect(source: SourceComponent, ctx: ComponentCloneCtx) {
    const app_registry = ctx.type_registry();

    if (!app_registry) {
        return
    }

    const registry = app_registry.read();

    const source_component_reflect = source.readReflect(registry);
    if (!source_component_reflect) {
        return
    }

    const component_info = ctx.component_info;
    const type_id = component_info.type_id;

    const component = source_component_reflect.reflectClone();
    if (component) {
        const reflect_component = registry.getTypeData(ReflectComponent, type_id);
        if (reflect_component) {
            reflect_component.mapEntities(component, ctx.entityMapper());
        }

        ctx.writeTargetComponentReflect(component);
        return;
    }

    const reflect_from_reflect = registry.getTypeData(ReflectFromReflect, type_id);
    if (reflect_from_reflect) {
        const component = reflect_from_reflect.fromReflect(source_component_reflect.asPartialReflect());
        if (component) {
            const reflect_component = registry.getTypeData(ReflectComponent, type_id);
            if (reflect_component) {
                reflect_component.mapEntities(component, ctx.entityMapper());
            }
            ctx.writeTargetComponentReflect(component);
            return;
        }
    }

    const reflect_default = registry.getTypeData(ReflectDefault, type_id);
    if (reflect_default) {
        const component = reflect_default.default();
        component.apply(source_component_reflect.asPartialReflect());
        ctx.writeTargetComponentReflect(component);
        return;
    }

    let reflect_from_world = registry.getTypeData(ReflectFromWorld, type_id);
    if (reflect_from_world) {
        reflect_from_world = reflect_from_world.clone();
        const source_component_cloned = source_component_reflect.toDynamic();
        const target = ctx.target();
        const component_id = ctx.component_id();
        ctx.queueDeferred((world: any, mapper: any) => {
            const component = reflect_from_world.from_world(world);
            assert(type_id === component.type_id);
            component.apply(source_component_cloned.asPartialReflect());
            app_registry.read().getTypeData(ReflectComponent, type_id)?.mapEntities(component, mapper);

            world.entityMut(target).insertById(component_id, component);
        });
    }
}

export function component_clone_ignore(_source: SourceComponent, _ctx: ComponentCloneCtx) { }

function registerComponentInner(components: ComponentInfo[], descriptor: ComponentDescriptor) {
    const component_id = components.length;
    const info = new ComponentInfo(component_id, descriptor);
    components.push(info);
    return component_id;
}

export class Components {
    #components: ComponentInfo[];
    #indices: Map<UUID, ComponentId>;
    #resource_indices: Map<UUID, ComponentId>;
    #queued: QueuedComponents;

    constructor(components: ComponentInfo[] = [], indices: Map<UUID, ComponentId> = new Map(), resource_indices: Map<UUID, ComponentId> = new Map()) {
        this.#components = components;
        this.#indices = indices;
        this.#resource_indices = resource_indices;
        this.#queued = new QueuedComponents();
    }

    static init_state() { }

    static get_param(_state: void, _system_meta: SystemMeta, world: World) {
        return world.components;
    }

    get queued() {
        return this.#queued;
    }

    len() {
        return this.numQueued() + this.numRegistered();
    }

    /**
    * @returns true if there are no components registered with this instance.
    */
    isEmpty() {
        return this.len() === 0;
    }

    /**
    * @returns the number of components registered with this instance.
    */
    numQueued() {
        return this.#queued.components.length + queued.dynamic_registrations.length + queued.resources.length;
    }

    /**
    * @returns true if there are any components registered with this instance.
    */
    anyQueued() {
        return this.numQueued() > 0;
    }

    numRegistered() {
        return this.#components.length;
    }

    anyRegistered() {
        return this.#components.length > 0;
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


    validComponentId(component: Component) {
        return this.getIdTypeId(component.type_id);
    }

    validResourceId(resource: Resource) {
        return this.#resource_indices.get(resource.type_id);
    }

    getId(type: TypeId): Option<ComponentId> {
        return this.#indices.get(type.type_id);
    }

    getIdTypeId(type_id: UUID): Option<ComponentId> {
        return this.#indices.get(type_id);
    }

    resourceId(type: Resource): Option<number> {
        const id = this.#resource_indices.get(type.type_id);
        if (id != null) {
            return id;
        } else {
            return this.#queued.resources.get(type.type_id)?.id;
        }
    }

    componentId(type: Component): Option<ComponentId> {
        return this.#indices.get(type.type_id);
    }

    getInfo(id: ComponentId): Option<ComponentInfo> {
        return this.#components[id];
    }

    getDescriptor(id: ComponentId) {
        const info = this.#components[id];
        if (info) {
            return info.descriptor
        } else {

            function find(queued: { id: number }) {
                return queued.id === id;
            }

            const queued = this.#queued;

            for (const value of queued.components.values()) {
                const found = find(value);
                if (found) {
                    // @ts-expect-error
                    return value.descriptor;
                }
            }

            for (const value of queued.resources.values()) {
                const found = find(value);
                if (found) {
                    // @ts-expect-error
                    return value.descriptor;
                }
            }

            for (const value of queued.dynamic_registrations.values()) {
                const found = find(value);
                if (found) {
                    // @ts-expect-error
                    return value.descriptor;
                }
            }
        }

    }

    getName(id: ComponentId): Option<string> {
        const info = this.#components[id];
        if (info) {
            return info.name;
        } else {
            const queued = this.#queued;

            function find(queued: { id: number }) {
                return queued.id === id;
            }

            for (const value of queued.components.values()) {
                const found = find(value);
                if (found) {
                    // @ts-expect-error
                    return value.descriptor;
                }
            }

            for (const value of queued.resources.values()) {
                const found = find(value);
                if (found) {
                    // @ts-expect-error
                    return value.descriptor.name;
                }
            }

            for (const value of queued.dynamic_registrations.values()) {
                const found = find(value);
                if (found) {
                    // @ts-expect-error
                    return value.descriptor.name;
                }
            }

            return;
        }
    }

    getHooks(id: ComponentId) {
        return this.#components[id]?.hooks;
    }

    getRequiredComponents(id: ComponentId) {
        return this.#components[id]?.required_components;
    }

    registerComponent(type: Component) {
        return this.registerComponentInternal(type, [])
    }

    registerResource(type: Resource) {
        return this.#getOrRegisterResource(type.type_id, {
            type,
            type_id: type.type_id,
            storage_type: StorageType.SparseSet,
            mutable: true,
            clone_behavior: ComponentCloneBehavior.Default,
            drop: null
        })
    }

    registerComponentInternal(type: Component, _recursion_check_stack: ComponentId[]) {
        let is_new_registration = false;
        const indices = this.#indices;
        const components = this.#components;

        const type_id = type.type_id;


        const id = entry(indices, type_id, () => {
            const id = registerComponentInner(components, {
                type: type,
                type_id: type.type_id,
                storage_type: type.storage_type,
                mutable: type.MUTABLE,
                clone_behavior: 0,
                drop: null,
            })
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

    registerRequiredComponents<R extends Component>(type: Component, requiree: ComponentId, required: ComponentId, ctor: () => InstanceType<R>) {
        const required_components = this.getRequiredComponents(requiree);

        if (required_components.inner.get(required)?.inheritance_depth === 0) {
            return RequiredComponentsError.DuplicateRegistration(requiree, required);
        }

        /**
         * Register the required component for the requiree.
         * This is a direct requirement with a depth of 0
         */
        required_components.registerById(type, required, ctor, 0);
        const required_by = this.getRequiredBy(required);
        required_by.add(requiree);

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

    registerComponentInner(id: ComponentId, descriptor: ComponentDescriptor) {
        this.#components[id] = new ComponentInfo(id, descriptor);
    }

    registerResourceUnchecked(type_id: UUID, component_id: ComponentId, descriptor: ComponentDescriptor) {
        this.registerComponentInner(component_id, descriptor);
        const prev = this.#resource_indices.has(type_id);
        this.#resource_indices.set(type_id, component_id);
        debug_assert(prev == null);
    }

    getRequiredBy(id: ComponentId) {
        return this.#components[id]?.required_by;
    }

    #getOrRegisterResource(type_id: UUID, descriptor: ComponentDescriptor) {
        return entry(this.#resource_indices, type_id, () => registerComponentInner(this.#components, descriptor));
    }

    iterRegistered() {
        return iter(this.#components);
    }

    iter() {
        return iter(this.#components);
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

    hasComponent(component: Component): boolean {
        return this.#indices.has(component.type_id)
    }

    hasResource(resource: ThinResource): boolean {
        return this.#resource_indices.has(resource.type_id)
    }

    hasResourceTypeId(type_id: UUID): boolean {
        return this.#resource_indices.has(type_id)
    }

    registerComponent(type: Component) {
        return this.registerComponentInternal(type as any, [])
    }

    registerResource(type: ThinResource) {
        return this.#getOrRegisterResourceWith(type.type_id,
            () => ({ type, storage_type: StorageType.SparseSet })
        )
    }

    registerComponentInternal(
        type: Component,
        _recursion_check_stack: ComponentId[]) {
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

// interface ComponentConfig {
//     storage_type: StorageType;
//     relationship_target?: any;
// }

// export function defineComponent<T>(ty: T, { storage_type }: ComponentConfig = {
//     storage_type: 0
// }): T & Prettify<ComponentMetadata> {
//     // @ts-expect-error
//     ty.type_id = v4();
//     // @ts-expect-error
//     ty.storage_type = storage_type;
//     return ty as T & ComponentMetadata;
// }

// export function defineMarker(): Component {
//     const marker = class { }
//     defineComponent(marker, { storage_type: 1 });
//     return marker as Component
// }

// export function defineResource<R extends Class>(ty: R & Partial<ComponentMetadata> & Partial<ComponentMetadata> & {}): Resource<R> {
//     // @ts-expect-error
//     ty.type_id = v4();
//     // @ts-expect-error
//     ty.storage_type = 1;
//     // @ts-expect-error
//     ty.from_world ??= (_world: World) => {
//         return new ty() as InstanceType<R>;
//     }

//     return ty as Resource<R>
// }