import { assert } from 'joshkaposh-iterator/src/util';
import { ErrorExt } from "joshkaposh-option";
import { Component } from "../component";
import { Entity } from "../entity";
import { fetch_deferred_mut, WorldEntityFetch } from "./entity-fetch";
import { EntityFetchError } from "./error";
import { World } from "./world";
import { SystemMeta } from '../system';

export class DeferredWorld {
    #world: World;
    constructor(world: World) {
        this.#world = world;
    }

    static init_state(_world: World, system_meta: SystemMeta) {
        assert(!system_meta.__component_access_set.combined_access().has_any_read(), `DeferredWorld in system ${system_meta.name} conflicts with a previous access.`)
        system_meta.__component_access_set.write_all();
        system_meta.__archetype_component_access.write_all();
    }

    static get_param(_state: void, _system_meta: SystemMeta, world: World) {
        return new DeferredWorld(world);
    }

    get commands() {
        return this.#world.commands
        // const command_queue = this.#world.getRawCommandQueue();
        // return Commands.new_raw_from_entities(command_queue, this.#world.entities)
    }

    getMut<T extends Component>(entity: Entity, type: T) {
        const mut = fetch_deferred_mut(this.#world, entity);
        if (mut instanceof EntityFetchError) {
            return
        }
        return mut.getMut(type)
    }

    modifyComponent<T extends Component, R>(entity: Entity, type: T, fn: (component: InstanceType<T>) => R) {
        // const component_id = this.component_id(type);

        // let entity_cell;

    }

    getEntityMut<T extends WorldEntityFetch>(entities: T) {
        return fetch_deferred_mut(this.#world, entities)
    }

    entityMut<T extends WorldEntityFetch>(entities: T) {
        const refs = fetch_deferred_mut(this.#world, entities);
        if (refs instanceof ErrorExt) {
            throw refs;
        }
        return refs
    }



}