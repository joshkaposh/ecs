import type { Option } from 'joshkaposh-option';
import type { TypeId, Class } from '../util';
import type { DeferredWorld, FromWorld } from '../world/world.types';
import type { ComponentCloneBehavior, ComponentsRegistrator, HookContext, RequiredComponents } from './component';
import type { StorageType } from '../storage/storage-type';

type EntityMapper = any;

export interface ComponentHook {
    deferred_world: DeferredWorld;
    hook_context: HookContext;
};

export type ComponentId = number;

export interface ComponentMutability<M extends boolean = boolean> {
    readonly MUTABLE: M;
};

export interface ImmutableComponent extends ComponentMutability<false> { }

export interface MutableComponent extends ComponentMutability<true> { }

interface Base<M extends boolean> extends TypeId, ComponentMutability<M> { }

/**
 * Any javascript class. These should be small with no behavior.
 */
export interface Component<T extends Class = Class, M extends boolean = boolean> {
    new(...params: ConstructorParameters<T>): InstanceType<T>;
    readonly storage_type: StorageType;
    readonly type_id: UUID;
    readonly MUTABLE: M;
    /**
     * Gets the `onAdd` [`ComponentHook`] for this [`Component`] if one is defined
     */
    on_add(): Option<ComponentHook>;

    /**
     * Gets the `onInsert` [`ComponentHook`] for this [`Component`] if one is defined
     */
    on_insert(): Option<ComponentHook>;

    /**
     * Gets the `onReplace` [`ComponentHook`] for this [`Component`] if one is defined
     */
    on_replace(): Option<ComponentHook>;

    /**
     * Gets the `onRemove` [`ComponentHook`] for this [`Component`] if one is defined
     */
    on_remove(): Option<ComponentHook>;

    /**
     * Gets the `onDespawn` [`ComponentHook`] for this [`Component`] if one is defined
     */
    on_despawn(): Option<ComponentHook>;

    /**
     * Registers required components.
     */
    registerRequiredComponents(
        _component_id: ComponentId,
        _components: ComponentsRegistrator,
        _required_components: RequiredComponents,
        _inheritance_depth: number,
        _recursion_check_stack: ComponentId[]
    ): void;

    /**
     * Called when registering this component, allowing to override clone function (or disable cloning) for this component.
     */
    cloneBehavior(): ComponentCloneBehavior;

    mapEntities(this: InstanceType<Component<T>>, _mapper: EntityMapper): void;
}

export type ResourceId = number;

/**
 * Any javascript class that will be used as a singleton in the ecs.
 */
export type Resource<T extends Class = Class, M extends boolean = boolean> = Base<M> & FromWorld<T> & T;

/**
 * The change detection used by added and changed queries.
 */
export type Tick = number;