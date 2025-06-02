import { TODO } from 'joshkaposh-iterator/src/util'
import { Archetype } from '../../archetype';
import { Bundle, InsertMode } from '../../bundle';
// import { Mut } from '../../change_detection';
import { Component, ComponentId, Resource, Tick } from '../../component';
import { Entities, Entity, EntityDoesNotExistDetails } from '../../entity';
// import { Event } from '../../event';
// import { ScheduleLabel } from '../../schedule';
// import { SystemIn } from '../system';
import { MutOrReadonlyArray } from '../../util';
import { CommandQueue, DeferredWorld, FromWorld, RawCommandQueue, World } from '../../world';
import {
    BundleInput,
    // EntityWorldMut
} from '../../world/entity-ref';
import { SystemMeta } from '../function-system';
import { SystemParamClass, SystemBuffer, Deferred } from '../system-param';
import {
    Command, init_resource, insert_batch, insert_resource, remove_resource,
    run_schedule,
    send_event,
    // run_schedule,
    // run_system, run_system_cached, run_system_cached_with, run_system_with,
    // send_event,
    spawn_batch,
    // trigger, trigger_targets, unregister_system, unregister_system_cached
} from './command';
import {
    clear,
    despawn,
    // despawn,
    EntityCommand, insert, insert_by_id, insert_if_new, log_components, move_components,
    remove,
    // observe,
    // remove,
    remove_with_requires, retain
} from './entity-command';
import { CommandWithEntity } from '../../error';
import { Event } from '../../event';
import { ScheduleLabel } from '../../schedule';

export * from './command';
export * from './entity-command';

// type InternalQueue = Deferred<CommandQueue> | RawCommandQueue;

type InternalQueue = CommandQueue | RawCommandQueue;

type FetchState = [typeof Deferred, Entities];

export class Commands implements SystemParamClass<typeof Commands> {
    #queue: InternalQueue;
    #entities: Entities;

    constructor(queue: InternalQueue, entities: Entities) {
        if (queue instanceof Commands) {
            throw new Error('queue cannot be instance of commands')
        }
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
        return TODO('Commands.new_from_entities()', queue, entities);
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
            CommandQueue as any
        ),
        world.entities
        ]
    }

    static new_archetype(state: FetchState, archetype: Archetype, system_meta: SystemMeta) {
        Deferred.new_archetype(state[0] as any, archetype, system_meta);
    }

    static exec(state: FetchState, system_meta: SystemMeta, world: World) {
        Deferred.exec(state[0] as unknown as SystemBuffer, system_meta, world);
    }

    static queue(state: FetchState, system_meta: SystemMeta, world: DeferredWorld) {
        Deferred.queue(state[0] as unknown as SystemBuffer, system_meta, world);
    }

    static validate_param(state: FetchState, system_meta: SystemMeta, world: World) {
        Deferred.validate_param(state[0] as unknown as SystemBuffer, system_meta, world);
    }

    static get_param(state: FetchState, _system_meta: SystemMeta, _world: World, _change_tick: Tick) {
        return new Commands(state[0] as unknown as InternalQueue, state[1]);
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

    spawnEmpty() {
        return new EntityCommands(this.#entities.reserve_entity(), this);
    }

    spawn(...bundle: BundleInput) {
        return this.spawnEmpty().insert(bundle);
    }

    entity(entity: Entity) {
        const commands = this.getEntity(entity);
        if (commands) {
            return new EntityCommands(entity, this);
        } else {
            throw new Error(`Attempting to create an EntityCommands for entity ${entity}, which ${EntityDoesNotExistDetails}`)
        }
    }

    getEntity(entity: Entity) {
        return this.#entities.contains(entity) ? new EntityCommands(entity, this) : undefined;
    }

    spawnBatch(bundles: BundleInput[]) {
        this.queue(spawn_batch(bundles));
    }

    queue(command: Command) {
        this.#queue.push(command.handle_error());
    }

    queueHandled(command: Command, error_handler: (world: World, error: Error) => void) {
        this.#queue.push(command.handle_error_with(error_handler as any))
    }

    insertBatch(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Replace))
    }

    insertBatchIfNew(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Keep))
    }

    tryInsertBatch(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Replace).handle_error_with(console.warn))
    }

    tryInsertBatchIfNew(bundles: MutOrReadonlyArray<[Entity, Bundle][]>) {
        this.queue(insert_batch(bundles, InsertMode.Keep).handle_error_with(console.warn))
    }

    initResource<R extends Resource>(resource: R & FromWorld<R>) {
        this.queue(init_resource(resource))
    }

    insertResource<R extends Resource>(resource: R & FromWorld<R>) {
        this.queue(insert_resource(resource))
    }


    remove_resource<R extends Resource>(resource: R & FromWorld<R>) {
        this.queue(remove_resource(resource))
    }

    // run_system(id: SystemId) {
    //     this.queue(run_system(id).handle_error_with(warn()))
    // }

    // run_system_with(id: SystemId, input: SystemIn<any>) {
    //     this.queue(run_system_with(id, input).handle_error_with(warn()));
    // }

    // register_system(system: IntoSystem<any, any>) {
    //     const entity = this.spawn_empty().id;
    //     const registered_system = RegisteredSystem.new(system.into_system());
    //     this.entity(entity).insert(system);
    //     return SystemId.from_entity(entity);
    // }

    // unregister_system(system_id: SystemId) {
    //     this.queue(unregister_system(system_id).handle_error_with(warn()))
    // }

    // unregister_system_cached(system_id: SystemId) {
    //     this.queue(unregister_system_cached(system_id).handle_error_with(warn()))
    // }

    // run_system_cached(system: IntoSystem<any, any>) {
    //     this.queue(run_system_cached(system).handle_error_with(warn()))
    // }

    // run_system_cached_with(system: IntoSystem<any, any>, input: SystemIn<any>) {
    //     this.queue(run_system_cached_with(system, input).handle_error_with(warn()))
    // }

    // trigger(event: Event) {
    //     this.queue(trigger(event))
    // }

    // trigger_targets(event: Event, targets: TriggerTargets) {
    //     this.queue(trigger_targets(event, targets))
    // }

    // add_observer(observer: IntoObserverSystem<Event, Bundle>) {
    //     return this.spawn(Observer.new(observer));
    // }

    send_event(event: InstanceType<Event>) {
        this.queue(send_event(event));
        return this;
    }

    run_schedule(label: ScheduleLabel) {
        this.queue(run_schedule(label).handle_error_with(console.warn))
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

    entry<T extends Component>(component: T): EntityEntryCommands<T> {
        return new EntityEntryCommands(this, component)
    }

    insert(...bundle: BundleInput) {
        return this.queue(insert(bundle) as any);
    }

    insertIf(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.insert(bundle);
        }
        return this
    }

    insertIfNew(bundle: BundleInput) {
        return this.queue(insert_if_new(bundle) as any);
    }

    insertIfNewAnd(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.queue(insert_if_new(bundle) as any);
        }

        return this;
    }

    insertById(component_id: ComponentId, value: InstanceType<Component>) {
        return this.queue(insert_by_id(component_id, value) as any);
    }

    tryInsert(bundle: BundleInput) {
        return this.queueHandled(insert(bundle) as any, () => { });
    }

    tryInsertIf(bundle: BundleInput, condition: () => boolean) {
        if (condition()) {
            return this.tryInsert(bundle)
        }

        return this;
    }

    tryInsertIfNewAnd(bundle: BundleInput, condition: () => boolean) {
        return condition() ? this.tryInsertIfNew(bundle) : this;
    }

    tryInsertIfNew(bundle: BundleInput) {
        return this.queueHandled(insert_if_new(bundle) as any, () => { })
    }


    removeWithRequires(bundle: BundleInput) {
        return this.queue(remove_with_requires(bundle) as any)
    }

    remove(bundle: BundleInput) {
        this.queue(remove(bundle) as any);
    }

    tryRemove(bundle: BundleInput) {
        return this.queueHandled(remove(bundle) as any, () => { })
    }

    clear() {
        return this.queue(clear() as any)
    }

    despawn() {
        return this.queueHandled(despawn() as any, console.warn);
    }

    tryDespawn() {
        return this.queueHandled(despawn() as any, () => { });
    }

    queue<T, M, C extends EntityCommand<T> & CommandWithEntity<M>>(command: C) {
        this.#commands.queue(command.with_entity(this.#entity) as any);
        return this;
    }

    queueHandled<T, M, C extends EntityCommand<T> & CommandWithEntity<M>>(command: C, error_handler: (world: World, error: Error) => void) {
        this.#commands.queueHandled(command.with_entity(this.#entity) as any, error_handler);
        return this;
    }

    retain(bundle: BundleInput) {
        return this.queue(retain(bundle) as any);
    }

    logComponents() {
        return this.queue(log_components() as any);
    }

    get commands() {
        return this.#commands
    }

    // trigger(event: Event) {
    //     this.#commands.trigger_targets(event, this.#entity);
    //     return this;
    // }

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

    moveComponents(entity: Entity, bundle: BundleInput) {
        return this.queue(move_components(entity, bundle) as any)
    }
}
class EntityEntryCommands<T extends Component> {
    #entity_commands: EntityCommands;
    #type: T;

    constructor(entity_commands: EntityCommands, type: T) {
        this.#entity_commands = entity_commands;
        this.#type = type;
    }

    // and_modify(modify: (value: Mut<T>) => void) {
    //     // @ts-expect-error
    //     this.#entity_commands.queue(defineCommand(((entity) => {
    //         const value = entity.getMut(this.#entity_commands.id, this.#type);
    //         modify(value);
    //     })))
    //     return this;
    // }

    orInsert(type: BundleInput) {
        this.#entity_commands.insertIfNew(type);
        return this;
    }

    orTryInsert(type: BundleInput) {
        this.#entity_commands.tryInsertIfNew(type);
        return this;
    }

    orInsertWith(type: () => BundleInput) {
        return this.orTryInsert(type());
    }

    or_default<D extends T extends new () => BundleInput ? T : never>(this: EntityEntryCommands<D>) {
        return this.orInsert(new this.#type())
    }

    entity() {
        return this.#entity_commands;
    }


}

