import { TODO } from 'joshkaposh-iterator/src/util'
import { Archetype } from '../../archetype';
import { Bundle, InsertMode } from '../../bundle';
import { Mut } from '../../change_detection';
import { Component, ComponentId, Resource, Tick } from '../../component';
import { Entities, Entity, EntityDoesNotExistDetails } from '../../entity';
import { Event } from '../../event';
import { ScheduleLabel } from '../../schedule';
import { SystemIn } from '../system';
import { Instance, MutOrReadonlyArray } from '../../util';
import { CommandQueue, DeferredWorld, FromWorld, RawCommandQueue, World } from '../../world';
import { BundleInput, EntityWorldMut } from '../../world/entity-ref';
import { SystemMeta } from '../function-system';
import { SystemParam, SystemParamClass, Deferred, SystemBuffer } from '../system-param';
import {
    Command, init_resource, insert_batch, insert_resource, remove_resource,
    run_schedule,
    // run_system, run_system_cached, run_system_cached_with, run_system_with,
    send_event, spawn_batch,
    // trigger, trigger_targets, unregister_system, unregister_system_cached
} from './command';
import {
    clear, despawn, EntityCommand, insert, insert_by_id, insert_if_new, log_components, move_components,
    // observe,
    remove, remove_with_requires, retain
} from './entity-command';

export * from './command';
export * from './entity-command';

// type InternalQueue = Deferred<CommandQueue> | RawCommandQueue;

type InternalQueue = CommandQueue | RawCommandQueue;

type FetchState = [typeof Deferred, Entities];

export class Commands implements SystemParamClass<typeof Commands> {
    #queue: InternalQueue;
    #entities: Entities;

    constructor(queue: InternalQueue, entities: Entities) {
        this.#queue = queue;
        this.#entities = entities;
    }

    static from_world(world: World) {
        return new Commands(world.getRawCommandQueue(), world.entities);
    }

    static new(queue: CommandQueue, world: World) {
        return Commands.new_from_entities(queue, world.entities);
    }

    static new_from_entities(queue: CommandQueue, entities: Entities): Commands {
        return TODO('Commands.new_from_entities()')
        // return new Commands(Deferred(queue), entities)
    }

    static new_raw_from_entities(queue: RawCommandQueue, entities: Entities) {
        return new Commands(queue, entities)
    }

    //* SystemParam impl
    static init_state(world: World, system_meta: SystemMeta): FetchState {
        return [Deferred.init_state(
            world,
            system_meta,
            Commands as unknown as SystemBuffer
        ),
        world.entities
        ]
    }

    static new_archetype(state: FetchState, archetype: Archetype, system_meta: SystemMeta) {
        state[0].new_archetype(state, archetype, system_meta);
        state[1].new_archetype(state, archetype, system_meta)
    }

    static exec(state: FetchState, system_meta: SystemMeta, world: World) {
        state[0].exec(state, system_meta, world);
        state[1].exec(state, system_meta, world);
    }

    static queue(state: FetchState, system_meta: SystemMeta, world: DeferredWorld) {
        state[0].queue(state[0] as any, system_meta, world);
        state[1].queue(state[1], system_meta, world);
    }

    static validate_param(state: FetchState, system_meta: SystemMeta, world: World) {
        // @ts-expect-error
        return state[0].validate_param(state, system_meta, world) ??
            // @ts-expect-error
            state[1].validate_param(state, system_meta, world);
    }

    static get_param(state: FetchState, _system_meta: SystemMeta, _world: World, _change_tick: Tick) {
        return new Commands(state[0] as any, state[1]);
    }


    get() {
        return this;
    }

    append(other: CommandQueue) {
        const queue = this.#queue;
        if (queue instanceof CommandQueue) {
            // queue.bytes.append(other.bytes);
            queue.append(other);
        } else {
            TODO('Commands.append RawCommandQueue branch')
            // queue.bytes.as_mut().append(other);
        }
    }

    spawn_empty() {
        return new EntityCommands(this.#entities.reserve_entity(), this);
    }

    spawn(...bundle: BundleInput) {
        return this.spawn_empty().insert(bundle);
    }

    entity(entity: Entity) {
        const commands = this.get_entity(entity);
        if (commands) {
            return new EntityCommands(entity, this);
        } else {
            throw new Error(`Attempting to create an EntityCommands for entity ${entity}, which ${EntityDoesNotExistDetails}`)
        }
    }

    get_entity(entity: Entity) {
        if (this.#entities.contains(entity)) {
            return new EntityCommands(entity, this);
        }

        return;
    }

    spawn_batch(bundles: BundleInput[]) {
        this.queue(spawn_batch(bundles));
    }

    queue<T, C extends Command<T> & HandleError<T>>(command: C) {
        this.#queue_internal(command.handle_error());
    }

    queue_handled<T, C extends Command<T> & HandleError<T>>(command: C, error_handler: (world: World, error: Error) => void) {
        this.#queue_internal(command.handle_error_with(error_handler));
    }

    #queue_internal(command: Command) {
        this.#queue.push(command);
    }

    insert_or_spawn_batch(bundles: BundleInput[]) {
        this.queue((world) => {
            const invalid_entities = world.insert_or_spawn_batch(bundles);
            if (invalid_entities) {
                throw new Error(`Failed to "insert or spawn" bundle of type ${bundles[0]} into the following invalid entities: ${invalid_entities} `)
            }
        })
    }

    insert_batch(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Replace))
    }

    insert_batch_if_new(bundles: BundleInput[]) {
        this.queue(insert_batch(bundles, InsertMode.Keep))
    }

    try_insert_batch(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Replace).handle_error_with(warn()))
    }

    try_insert_batch_if_new(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Keep).handle_error_with(warn()))
    }

    init_resource<R extends Resource>(resource: R & FromWorld<R>) {
        this.queue(init_resource(resource))
    }

    insert_resource<R extends Resource>(resource: R & FromWorld<R>) {
        this.queue(insert_resource(resource))
    }


    remove_resource<R extends Resource>(resource: R & FromWorld<R>) {
        this.queue(remove_resource(resource))
    }

    run_system(id: SystemId) {
        this.queue(run_system(id).handle_error_with(warn()))
    }

    run_system_with(id: SystemId, input: SystemIn<any>) {
        this.queue(run_system_with(id, input).handle_error_with(warn()));
    }

    register_system(system: IntoSystem<any, any>) {
        const entity = this.spawn_empty().id;
        const registered_system = RegisteredSystem.new(system.into_system());
        this.entity(entity).insert(system);
        return SystemId.from_entity(entity);
    }

    unregister_system(system_id: SystemId) {
        this.queue(unregister_system(system_id).handle_error_with(warn()))
    }

    unregister_system_cached(system_id: SystemId) {
        this.queue(unregister_system_cached(system_id).handle_error_with(warn()))
    }

    run_system_cached(system: IntoSystem<any, any>) {
        this.queue(run_system_cached(system).handle_error_with(warn()))
    }

    run_system_cached_with(system: IntoSystem<any, any>, input: SystemIn<any>) {
        this.queue(run_system_cached_with(system, input).handle_error_with(warn()))
    }

    trigger(event: Event) {
        this.queue(trigger(event))
    }

    trigger_targets(event: Event, targets: TriggerTargets) {
        this.queue(trigger_targets(event, targets))
    }

    add_observer(observer: IntoObserverSystem<Event, Bundle>) {
        return this.spawn(Observer.new(observer));
    }

    send_event(event: InstanceType<Event>) {
        this.queue(send_event(event));
        return this;
    }

    run_schedule(label: ScheduleLabel) {
        this.queue(run_schedule(label).handle_error_with(warn()))
    }
}

export class EntityCommands {
    #entity: Entity;
    #commands: Commands;

    constructor(entity: Entity, commands: Commands) {
        this.#entity = entity;
        this.#commands = commands;
    }

    get id() {
        return this.#entity
    }

    entry<T extends Component>(component: T): EntityEntryCommands {
        return new EntityEntryCommands(this, component)
    }

    insert(...bundle: BundleInput) {
        return this.queue(insert(bundle));
    }

    insert_if(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.insert(bundle)
        }
        return this
    }

    insert_if_new(bundle: BundleInput) {
        return this.queue(insert_if_new(bundle));
    }

    insert_if_new_and(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.queue(insert_if_new(bundle));
        }

        return this;
    }

    insert_by_id(component_id: ComponentId, value: InstanceType<Component>) {
        return this.queue(insert_by_id(component_id, value));
    }

    // insert_by_id(component_id: ComponentId, value: InstanceType<Component>) {
    //     return this.queue_handled(insert_by_id(component_id, value), silent());
    // }

    try_insert(bundle: BundleInput) {
        return this.queue_handled(insert(bundle), silent());
    }

    try_insert_if(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.try_insert(bundle)
        }

        return this;
    }

    try_insert_if_new_and(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.try_insert_if_new(bundle)
        }

        return this;
    }


    try_insert_if_new(bundle: BundleInput) {
        return this.queue_handled(insert_if_new(bundle), silent())
    }

    remove(bundle: BundleInput) {
        return this.queue_handled(remove(bundle), warn())
    }


    try_remove(bundle: BundleInput) {
        return this.queue_handled(remove(bundle), silent())
    }

    remove_with_requires(bundle: BundleInput) {
        return this.queue(remove_with_requires(bundle))
    }

    clear() {
        return this.queue(clear())
    }

    despawn() {
        return this.queue_handled(despawn(), warn());
    }

    try_despawn() {
        return this.queue_handled(despawn(), silent());
    }

    queue<T, M, C extends EntityCommand<T> & CommandWithEntity<M>>(command: C) {
        this.#commands.queue(command.with_entity(this.#entity) as any);
        return this;
    }

    queue_handled<T, M, C extends EntityCommand<T> & CommandWithEntity<M>>(command: C, error_handler: (world: World, error: Error) => void) {
        this.#commands.queue_handled(command.with_entity(this.#entity) as any, error_handler);
        return this;
    }

    retain(bundle: BundleInput) {
        return this.queue(retain(bundle));
    }

    log_components() {
        return this.queue(log_components());
    }

    commands() {
        return this.#commands
    }

    trigger(event: Event) {
        this.#commands.trigger_targets(event, this.#entity);
        return this;
    }

    // observer(observer: IntoObserverSystem<Event, Bundle>) {
    //     return this.queue(observe(observer))
    // }

    // clone_with(target: Entity, config: (builder: EntityClonerBuilder) => void) {
    //     return this.queue(clone_with(target, config))
    // }

    // clone_and_spawn() {
    //     return this.clone_and_spawn_with(() => { });
    // }

    // clone_and_spawn_with(config: (builder: EntityClonerBuilder) => void) {
    //     const entity_clone = this.#commands.spawn_empty().id();
    //     this.clone_with(entity_clone, config);
    //     return new EntityCommands(this.#commands, this.#entity)
    // }

    // clone_components(target: Entity, bundle: BundleInput) {
    //     return this.queue(clone_components(target, bundle))
    // }

    move_components(entity: Entity, bundle: BundleInput) {
        return this.queue(move_components(entity, bundle))
    }
}

class EntityEntryCommands<T extends Component> {
    #entity_commands: EntityCommands;
    #type: T;

    constructor(entity_commands: EntityCommands, type: T) {
        this.#entity_commands = entity_commands;
        this.#type = type;
    }

    and_modify(modify: (value: Mut<T>) => void) {
        this.#entity_commands.queue((entity: EntityWorldMut) => {
            const value = entity.get_mut(this.#type);
            modify(value);
        })
        return this;
    }

    or_insert(type: InstanceType<T>) {
        this.#entity_commands.insert_if_new(type);
        return this;
    }

    or_try_insert(type: InstanceType<T>) {
        this.#entity_commands.try_insert_if_new(type);
        return this;
    }

    or_insert_with(type: () => InstanceType<T>) {
        return this.or_try_insert(type());
    }

    or_default<D extends T extends new () => InstanceType<T> ? T : never>(this: EntityEntryCommands<D>) {
        return this.or_insert(new this.#type() as InstanceType<T>)
    }

    entity() {
        return this.#entity_commands;
    }


}

