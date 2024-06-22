import { ErrorExt } from "joshkaposh-iterator";
import { Command } from ".";
import { Bundle } from "../bundle";
import { Entity } from "../entity";
import { World } from "../world";

type Commands = any;
type MutWorld = World;

function entity_command_from_fn(fn: (world: World) => void): Command {
    return {
        apply(world) {
            fn(world)
        }
    }
}

function entity_command_from_fn_entity_mut(fn: (world: World) => void) {
    return {
        apply(id: Entity, world: World) {
            fn(world.entity_mut(id));
        }
    } as const;
}

function entity_command_from_fn_entity(fn: (entity: Entity, world: MutWorld) => void) {
    return {
        apply(id: Entity, world: MutWorld) {
            fn(id, world);
        }
    } as const;
}

function spawn_batch(bundles: Bundle[], world: MutWorld) {
    world.spawn_batch(bundles);
}

function insert_or_spawn_batch(bundles: Bundle[]) {
    return (world: MutWorld) => {
        const err = world.insert_or_spawn_batch(bundles);
        if (err instanceof ErrorExt) {
            console.error("Failed to 'insert or spawn' bundle into the following invalid entities: ", err.get())
        }
    }
}

function despawn(entity: Entity, world: MutWorld) {
    world.despawn(entity);
}

function insert(bundle: Bundle) {
    return (entity: Entity, world: MutWorld) => {
        const e = world.get_entity(entity);
        if (e) {
            e.insert(bundle)
        } else {
            throw new Error(`Could not insert a bundle for entity (${entity.index()},${entity.generation()}) because it doesnt exist in this World`)
        }

    }
}

function try_insert(bundle: Bundle) {
    return (entity: Entity, world: MutWorld) => {
        const e = world.get_entity(entity);
        if (e) {
            e.insert(bundle)
        }
    }
}

// removes components from an entity
function remove(entity: Entity, bundle: Bundle, world: World) {
    world.get_entity(entity)?.remove(bundle);
}

// removes components from an entity expect those in bundle
function retain(entity: Entity, bundle: Bundle, world: World) {
    world.get_entity(entity)?.retain(bundle);
}

function init_resource(resource: any, world: MutWorld) {
    world.init_resource(resource);
}

function remove_resource(resource: any, world: MutWorld) {
    world.remove_resource(resource);
}

function insert_resource(resource: any) {
    return (world: MutWorld) => world.insert_resource(resource);
}

function log_components(entity: Entity, world: MutWorld) {
    const debug_infos = world
        .inspect_entity(entity)
        .into_iter()
        .map(component_info => component_info.name())
        .collect();
    console.log('Entity(%d, %d) - %O', entity.index(), entity.generation(), debug_infos);

}

export class EntityCommands {
    #entity: Entity;
    #commands: Commands;

    constructor(entity: Entity, commands: Commands) {
        this.#entity = entity;
        this.#commands = commands;
    }

    id(): Entity {
        return this.#entity
    }

    insert(bundle: Bundle): this {
        return this.add(insert(bundle))
    }

    try_insert(bundle: Bundle): this {
        return this.add(try_insert(bundle))
    }

    remove(bundle: Bundle): this {
        return this.add(remove(this.#entity, bundle))
    }

    despawn() {
        this.add(despawn)
    }

    // command: EntityCommand
    add(command: any): this {
        this.commands.add(command.with_entity(this.#entity));
        return this
    }

    // Removes all Component(s) from Entity expect those in Bundle
    retain(bundle: Bundle) {
        return this.add(retain(bundle))
    }

    log_components() {
        this.add(log_components)
    }

    commands() {
        return this.#commands;
    }
}