import { Iterator, Ok, Option } from "joshkaposh-iterator";
import { Bundle } from "../bundle";
import { Entities, Entity } from "../entity";
import { World } from "../world";
import { Component, Resource } from "../component";

export type Command = {
    apply(world: World): void;
} | ((world: World) => void);

type Deferred<T> = T[];

type CommandQueue = any;

export class Commands {
    #queue: Deferred<CommandQueue>;
    #entities: Entities;
    constructor(queue: CommandQueue, world: World) {
        this.#queue = queue;
        this.#entities = world.entities();
    }

    /**
     * @summary
     * Take all commands from 'other' and append them to 'this', leaving 'other' empty.
     */
    append(other: CommandQueue) {
        this.#queue.append(other);
    }

    spawn_empty(): EntityCommands {
        const entity = this.#entities.reserve_entity();
        return new EntityCommands(entity, this)
    }

    get_or_spawn(entity: Entity): EntityCommands {
        this.add((world: World) => {
            world.get_or_spawn(entity)
        })
        return new EntityCommands(entity, this);
    }

    spawn(bundle: Bundle): EntityCommands {
        const e = this.spawn_empty();
        e.insert(bundle);
        return e;
    }

    entity(entity: Entity): EntityCommands {
        const e = this.get_entity(entity);
        if (!e) {
            throw new Error(`Attempting to create an EntityCommands for entity (${entity.index()}, ${entity.generation()}), which doesn't exist`)
        }
        return e;
    }

    get_entity(entity: Entity): Option<EntityCommands> {
        return this.#entities.contains(entity) ? new EntityCommands(entity, this) : null;
    }

    spawn_batch(bundles_iter: Iterator<Bundle>) {
        this.#queue.push(spawn_batch(bundles_iter))
    }

    insert_or_spawn_batch(bundles: Iterator<[Entity, Bundle]>) {
        this.#queue.push(insert_or_spawn_batch(bundles))
    }

    init_resource(resource: any) {
        this.#queue.push(init_resource.bind(null, resource));
    }

    insert_resource(resouce: any) {
        this.#queue.push(insert_resource(resource))
    }

    remove_resource(resource: any) {
        this.#queue.push(remove_resource.bind(null, resource));
    }

    add(command: Command) {
        return this.#queue.push(command)
    }
}

type EntityCommandTrait<Marker = Ok> = {
    apply(id: Entity, world: World): void;
    with_entity(entity: Entity): WithEntity<Marker, EntityCommandTrait<Marker>>;
} | ((id: Entity, world: World) => void);

class WithEntity<Marker, C extends EntityCommandTrait<Marker>> implements Command {
    #cmd: C;
    #id: Entity;
    constructor(cmd: C, id: Entity) {
        this.#cmd = cmd;
        this.#id = id;
    }

    apply(world: World): void {
        this.#cmd.apply(this.#id, world);
    }
}

export class EntityCommands {
    #entity: Entity;
    #commands: Commands;
    constructor(entity: Entity, commands: Commands) {
        this.#entity = entity;
        this.#commands = commands;
    }

    id() {
        return this.#entity;
    }

    insert(bundle: Bundle): this {
        return this.add(insert(bundle))
    }

    try_insert(bundle: Bundle): this {
        return this.add(try_insert(bundle))
    }

    remove(bundle: Bundle): this {
        return this.add(remove.bind(null, bundle))
    }

    despawn() {
        this.add(despawn)
    }

    add(command: EntityCommandTrait): this {
        this.__commands.add(command.with_entity(this.__entity));
        return this;
    }

    retain(bundle: Bundle): this {
        return this.add(retain(bundle))
    }

    log_components() {
        this.add(log_components())
    }
}

function spawn_batch(bundles: Iterator<Bundle>): Command {
    return {
        apply(world) {
            world.spawn_batch(bundles);
        },
    }
}

function insert_or_spawn_batch(bundles: Iterator<[Entity, Bundle]>): Command {
    return (world: World) => {
        const invalid = world.insert_or_spawn_batch(bundles);
        if (invalid instanceof Error) {
            console.error(`Failed to 'insert or spawn' bundle into the following invalid entities: ${invalid}`)
        }
    }
}

function despawn(entity: Entity, world: World) {
    world.despawn(entity);
}

function insert(bundle: Bundle): EntityCommandTrait {
    return (entity: Entity, world: World) => {
        const e = world.get_entity(entity);
        if (!e) {
            throw new Error(`Could not insert a bundle for entity (${entity.index()}, ${entity.generation()}) because it doesnt exist in this World`)
        }
        e.insert(bundle);
    }
}

function try_insert(bundle: Bundle): EntityCommandTrait {
    return (entity, world) => {
        world.get_entity(entity)?.insert(bundle);
    }
}

function remove(bundle: Bundle, entity: Entity, world: World) {
    world.get_entity(entity)?.remove(bundle);
}

function retain(bundle: Bundle, entity: Entity, world: World) {
    world.get_entity(entity)?.retain(bundle)
}

function init_resource(this: Resource<Component>, world: World) {
    world.init_resource(this);
}


function remove_resource(this: Resource<Component>, world: World) {
    world.remove_resource(this);
}

function insert_resource(resource: Resource): Command {
    return (world: World) => {
        world.insert_resource(resource)
    }
}

function log_components(entity: Entity, world: World) {
    console.log('Entity index = %d, generation = %d, component names = ', entity.index(), entity.generation(), world
        .inspect_entity()
        .into_iter()
        .map(component_info => component_info.name())
        .collect()
    );
}

