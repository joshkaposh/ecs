// import type { Option } from 'joshkaposh-option'
// import { Component, ComponentId, ComponentInfo, Components } from "../component";
// import { Commands } from "../system/commands";
// import { World } from "../world";
// import { Entity } from "./entity";
// import { BundleInput } from '../world/entity-ref';

export { }

// class ComponentCloneCtx {
//     #component_id: ComponentId;
//     #source_component_ptr: object;
//     #target_component_written: boolean;
//     #bundle_scratch: BundleScratch;
//     #source: Entity;
//     #target: Entity;
//     #components: Components;
//     #component_info: ComponentInfo;
//     #entity_cloner: EntityCloner;
//     #mapper: EntityMapper;


//     constructor(
//         component_id: ComponentId,
//         source: Entity,
//         target: Entity,
//         source_component_ptr: object,
//         bundle_scratch: BundleScratch,
//         components: Components,
//         entity_cloner: EntityCloner,
//         mapper: EntityMapper,
//     ) {
//         this.#component_id = component_id;
//         this.#bundle_scratch = bundle_scratch;
//         this.#source = source;
//         this.#target = target;
//         this.#target_component_written = false;
//         this.#source_component_ptr = source_component_ptr;
//         this.#components = components;
//         this.#component_info = components.get_info(component_id)!
//         this.#entity_cloner = entity_cloner;
//         this.#mapper = mapper;
//     }

//     source() {
//         return this.#source
//     }

//     target() {
//         return this.#target
//     }

//     component_id() {
//         return this.#component_id;
//     }

//     component_info() {
//         return this.#component_info;
//     }

//     is_recursive() {
//         return this.#entity_cloner.is_recursive();
//     }

//     entity_mapper() {
//         return this.#mapper
//     }

//     read_source_component<T extends Component>(component: T): Option<InstanceType<T>> {
//         const id = this.#component_info.type_id()
//         if (id && id === component.type_id) {
//             return this.#source_component_ptr as InstanceType<T>;
//         }
//         return
//     }

//     write_target_component<C extends Component, T extends C>(component: T) {
//         component.visit_entities_mut(component, (entity) => {
//             entity = this.#mapper.get_mapped(entity);
//         })

//         const name = component.name;
//         if (this.#target_component_written) {
//             throw new Error(`Trying to write component ${name} multiple times`);
//         }

//         const id = this.#component_info.type_id();
//         if (!id || id !== component.type_id) {
//             throw new Error(`TypeId of type ${name} does not match source component TypeId`)
//         }

//         this.#bundle_scratch.push(this.#component_id, component);
//         this.#target_component_written = true;
//     }

//     write_target_component_ptr(clone_fn: (ptr: object, u8: number) => boolean) {
//         const target_component_data_ptr = this.#source_component_ptr.constructor();
//         if (clone_fn(this.#source_component_ptr, target_component_data_ptr)) {
//             this.#bundle_scratch.push_ptr(this.#component_id, target_component_data_ptr);
//             this.#target_component_written = true;
//         }
//     }

//     components() {
//         return this.#components;
//     }

//     queue_entity_clone(entity: Entity) {
//         this.#entity_cloner.__clone_queue.push(entity)
//     }



// }

// export class EntityCloner {
//     private __filter_allows_components: boolean;
//     private __filter: Set<ComponentId>;
//     private __clone_behavior_overrides: Map<ComponentId, ComponentCloneBehavior>;
//     private __move_components: boolean;
//     private __is_recursive: boolean;
//     private __default_clone_fn: ComponentCloneFn;
//     private __clone_queue: Entity[]; // VecDeque

//     constructor(
//         filter_allows_components = false,
//         filter: Set<ComponentId> = new Set(),
//         clone_behavior_overrides: Map<ComponentId, ComponentCloneBehavior> = new Map(),
//         move_components = false,
//         is_recursive = false,
//         default_clone_fn: ComponentCloneFn = ComponentCloneBehavior.golbal_default_fn(),
//         clone_queue: Entity[] = []
//     ) {
//         this.__filter_allows_components = filter_allows_components;
//         this.__filter = filter;
//         this.__clone_behavior_overrides = clone_behavior_overrides;
//         this.__move_components = move_components;
//         this.__is_recursive = is_recursive;
//         this.__default_clone_fn = default_clone_fn;
//         this.__clone_queue = clone_queue
//     }

//     static build(world: World) {
//         return new EntityClonerBuilder(world, true, new EntityCloner())
//     }

//     is_recursive() {
//         return this.__is_recursive;
//     }

//     private clone_entity_internal(world: World, source: Entity, mapper: EntityMapper) {
//         const target = mapper.get_mapped(source);

//         const source_entity = world.get_entity(source);
//         if (!source_entity) {
//             throw new Error('Source entity must exist');
//         }

//         const archetype = source_entity.archetype();
//         const bundle_scratch = BundleScratch.with_capacity(archetype.component_count());
//         const commands = Commands.new_from_entities(world.get_raw_command_queue(), world.entities());

//         const comp_array = archetype.__components_array();
//         for (let i = 0; i < comp_array.length; i++) {
//             const component = comp_array[i];
//             if (!this.is_cloning_allowed(component)) {
//                 continue;
//             }

//             const clone_behavior = this.__clone_behavior_overrides.get(component);
//             let handler;
//             if (clone_behavior) {
//                 handler = clone_behavior.resolve(this.__default_clone_fn);
//             } else {
//                 handler = world.components()
//                     .get_info(component)
//                     ?.clone_behavior()
//                     .resolve(this.__default_clone_fn) ??
//                     this.__default_clone_fn;
//             }

//             const source_component_ptr = source_entity.get_by_id(component)!;

//             const ctx = new ComponentCloneCtx(
//                 component,
//                 source,
//                 target,
//                 source_component_ptr,
//                 bundle_scratch,
//                 world.components(),
//                 this,
//                 mapper
//             )

//             handler(commands, ctx);
//         }

//         world.flush();

//         if (!world.entities().contains(target)) {
//             throw new Error('Target entity does not exist.')
//         }

//         if (this.__move_components) {
//             // @ts-expect-error
//             world.entity_mut(source).remove_by_ids(bundle_scratch.__component_ids)
//         }

//         bundle_scratch.write(world, target);
//         return target;
//     }

//     clone_entity(world: World, source: Entity, target: Entity) {
//         const map = new EntityHashMap<Entity>();
//         map.set_mapped(source, target);
//         this.clone_entity_mapped(world, source, map);
//     }

//     spawn_clone(world: World, source: Entity) {
//         const target = world.spawn_empty().id();
//         this.clone_entity(world, source, target);
//         return target;
//     }

//     clone_entity_mapped(world: World, source: Entity, mapper: EntityMapper) {
//         const target = this.clone_entity_internal(world, source, mapper);
//         let queued = this.__clone_queue.shift();
//         while (queued) {
//             const target = world.entities().reserve_entity();
//             mapper.set_mapped(queued, target)
//         }
//         return target;
//     }

//     is_cloning_allowed(component_id: ComponentId) {
//         const allowed = this.__filter_allows_components;
//         const has = this.__filter.has(component_id);
//         return (allowed && has) || (!allowed && !has);
//     }
// }


// /**
//  * Exandable scratch space for defining a dynamic bundle.
//  */
// class BundleScratch {
//     private __component_ids: ComponentId[];
//     private __component_ptrs: object[] //PtrMut[]

//     constructor(component_ids: ComponentId[], component_ptrs: object[]) {
//         this.__component_ids = component_ids;
//         this.__component_ptrs = component_ptrs;
//     }

//     static with_capacity(capacity: number) {
//         // return new BundleScratch(new Array(capacity), new Array(capacity))
//         return new BundleScratch([], []);
//     }

//     push_ptr(id: ComponentId, ptr: object) {
//         this.__component_ids.push(id);
//         this.__component_ptrs.push(ptr);
//     }

//     push(id: ComponentId, component: Component) {
//         const ptr = new component();
//         this.__component_ids.push(id);
//         this.__component_ptrs.push(ptr);
//     }

//     /**
//      * Writes the scratch components to the given entity in the given world.
//      *
//      * ! SAFETY: All ComponentId's values in this instance must come from world.
//      */
//     write(world: World, entity: Entity) {
//         world.entity_mut(entity).insert_by_ids(this.__component_ids, this.__component_ptrs);
//     }
// }

// export class EntityClonerBuilder {
//     #world: World;
//     #entity_cloner: EntityCloner;
//     #attach_required_components: boolean;
//     constructor(
//         world: World,
//         attach_required_components: boolean,
//         entity_cloner: EntityCloner
//     ) {
//         this.#world = world;
//         this.#attach_required_components = attach_required_components;
//         this.#entity_cloner = entity_cloner;
//     }

//     clone_entity(source: Entity, target: Entity) {
//         this.#entity_cloner.clone_entity(this.#world, source, target);
//         return this;
//     }

//     finish() {
//         return this.#entity_cloner;
//     }

//     without_required_components(builder: (builder: EntityClonerBuilder) => void) {
//         this.#attach_required_components = false;
//         builder(this);
//         this.#attach_required_components = true;
//         return true;
//     }

//     with_default_clone_fn(clone_fn: ComponentCloneFn) {
//         // @ts-expect-error
//         this.#entity_cloner.__default_clone_fn = clone_fn;
//         return this;
//     }

//     move_components(enable: boolean) {
//         // @ts-expect-error
//         this.#entity_cloner.__move_components = enable;
//         return this;
//     }

//     allow(bundle: BundleInput) {
//         const b = this.#world.register_bundle(bundle);
//         const ids = b.explicit_components();
//         for (const id of ids) {
//             this.filter_allow(id)
//         }
//         return this;
//     }

//     allow_by_ids(ids: ComponentId[]) {
//         for (let i = 0; i < ids.length; i++) {
//             this.filter_allow(ids[i])
//         }
//         return this;
//     }

//     allow_by_type_ids(ids: UUID[]) {
//         for (let i = 0; i < ids.length; i++) {
//             const type_id = ids[i]
//             const id = this.#world.components().get_id_type_id(type_id)
//             if (typeof id === 'number') {
//                 this.filter_allow(id)
//             }
//         }
//         return this;
//     }

//     deny(bundle: BundleInput) {
//         const b = this.#world.register_bundle(bundle);
//         const ids = b.explicit_components();
//         for (const id of ids) {
//             this.filter_deny(id)
//         }
//         return this;
//     }

//     deny_by_ids(ids: ComponentId[]) {
//         for (let i = 0; i < ids.length; i++) {
//             this.filter_deny(ids[i])
//         }
//         return this;
//     }

//     deny_by_type_ids(ids: UUID[]) {
//         for (let i = 0; i < ids.length; i++) {
//             const type_id = ids[i]
//             const id = this.#world.components().get_id_type_id(type_id)
//             if (typeof id === 'number') {
//                 this.filter_deny(id)
//             }
//         }
//         return this;
//     }

//     deny_all() {
//         // @ts-expect-error
//         this.#entity_cloner.__filter_allows_components = true;
//         // @ts-expect-error
//         this.#entity_cloner.__filter.clear();
//         return this;
//     }

//     override_clone_behavior(type: Component, clone_behavior: ComponentCloneBehavior) {
//         const id = this.#world.components().component_id(type);
//         if (typeof id === 'number') {
//             // @ts-expect-error
//             this.#entity_cloner.__clone_behavior_overrides.insert(id, clone_behavior);
//         }
//         return this;
//     }

//     override_clone_behavior_with_id(component_id: ComponentId, clone_behavior: ComponentCloneBehavior) {
//         // @ts-expect-error
//         this.#entity_cloner.__clone_behavior_overrides.insert(component_id, clone_behavior);
//         return this;
//     }

//     remove_clone_behavior_override(type: Component, clone_behavior: ComponentCloneBehavior) {
//         const id = this.#world.components().component_id(type);
//         if (typeof id === 'number') {
//             // @ts-expect-error
//             this.#entity_cloner.__clone_behavior_overrides.remove(id, clone_behavior);
//         }
//         return this;
//     }

//     remove_clone_behavior_override_with_id(component_id: ComponentId, clone_behavior: ComponentCloneBehavior) {
//         // @ts-expect-error
//         this.#entity_cloner.__clone_behavior_overrides.remove(component_id, clone_behavior);
//         return this;
//     }

//     recursive(is_recursive: boolean) {
//         this.#entity_cloner.__is_recursive = is_recursive
//     }

//     filter_allow(component_id: ComponentId) {
//         // @ts-expect-error
//         const filter = this.#entity_cloner.__filter;
//         // @ts-expect-error
//         const allows_components = this.#entity_cloner.__filter_allows_components
//         if (allows_components) {
//             filter.add(component_id);
//         } else {
//             filter.delete(component_id)
//         }

//         if (this.#attach_required_components) {
//             const info = this.#world.components().get_info(component_id);
//             for (const required_id of info.required_components().iter_ids()) {
//                 if (allows_components) {
//                     filter.add(required_id)
//                 } else {
//                     filter.delete(required_id)
//                 }
//             }
//         }
//     }

//     filter_deny(component_id: ComponentId) {
//         // @ts-expect-error
//         const filter = this.#entity_cloner.__filter;
//         // @ts-expect-error
//         const allows_components = this.#entity_cloner.__filter_allows_components

//         if (allows_components) {
//             filter.delete(component_id)
//         } else {
//             filter.add(component_id)
//         }

//         if (this.#attach_required_components) {
//             const info = this.#world.components().get_info(component_id);
//             if (info) {
//                 for (const required_id of info.required_components().iter_ids()) {
//                     if (allows_components) {
//                         filter.delete(required_id);
//                     } else {
//                         filter.add(required_id);
//                     }
//                 }
//             }
//         }
//     }


// }