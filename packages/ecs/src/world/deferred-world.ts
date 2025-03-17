import { ErrorExt } from "joshkaposh-option";
import { Component } from "../component";
import { Entity, EntitySet } from "../entity";
import { Commands } from "../system/commands";
import { fetch_deferred_mut, WorldEntityFetch } from "./entity-fetch";
import { EntityFetchError } from "./error";
import { World } from "./world";

export class DeferredWorld {
    #world: World;
    constructor(world: World) {
        this.#world = world;
    }

    commands() {
        const command_queue = this.#world.get_raw_command_queue();
        return Commands.new_raw_from_entities(command_queue, this.#world.entities())
    }

    get_mut<T extends Component>(entity: Entity, type: T) {
        const mut = this.get_entity_mut(entity);
        if (mut instanceof EntityFetchError) {
            return
        }
        return mut.get_mut(type)
    }

    modify_component<T extends Component, R>(entity: Entity, type: T, fn: (component: InstanceType<T>) => R) {
        // const component_id = this.component_id(type);

        // let entity_cell;

    }

    get_entity_mut<T extends WorldEntityFetch>(entities: T) {
        return fetch_deferred_mut(this.#world, entities)
    }

    entity_mut<T extends WorldEntityFetch>(entities: T) {
        const refs = this.get_entity_mut(entities);
        if (refs instanceof ErrorExt) {
            throw refs;
        }
        return refs
    }



}