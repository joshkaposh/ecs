import { assert } from 'joshkaposh-iterator/src/util';
import { ErrorExt } from "joshkaposh-option";
import type { Component, ComponentId } from "../component";
import type { Entity } from "../entity";
import { fetch_deferred_mut, WorldEntityFetch } from "./entity-fetch";
import { EntityFetchError } from "./error";
import { SystemMeta } from '../system';
import { Archetype } from '../archetype';
import { World } from "./world";
import { iter } from 'joshkaposh-iterator';
import { RelationshipHookMode } from '../relationship';

export type ON_ADD = typeof ON_ADD;
export const ON_ADD = 0;
export type ON_INSERT = typeof ON_INSERT;
export const ON_INSERT = 1;
export type ON_REPLACE = typeof ON_REPLACE;
export const ON_REPLACE = 2;
export type ON_REMOVE = typeof ON_REMOVE;
export const ON_REMOVE = 3;


type ObserverId = ON_ADD | ON_INSERT | ON_REPLACE | ON_REMOVE;

type HookContext = {
    entity: Entity;
    component_id: ComponentId;
    relationship_hook_mode: RelationshipHookMode;
}

function hook(world: DeferredWorld, context: HookContext) {

}

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

    get world() {
        return this.#world;
    }

    get commands() {
        return this.#world.commands
        // const command_queue = this.#world.getRawCommandQueue();
        // return Commands.new_raw_from_entities(command_queue, this.#world.entities)
    }

    get archetypes() {
        return this.#world.archetypes
    }

    get bundles() {
        return this.#world.bundles;
    }

    get changeTick() {
        return this.#world.changeTick;
    }

    /**
     * See {`World.entity`} for more information.
     */
    entity(entity: Entity) {
        return this.#world.entity(entity);
    }

    getMut<T extends Component>(entity: Entity, type: T) {
        const mut = fetch_deferred_mut(this.#world, entity);
        if (mut instanceof EntityFetchError) {
            return
        }
        return mut.getMut(type)
    }

    modifyComponentById<T extends Component, R>(entity: Entity, component_id: ComponentId, _fn: (component: InstanceType<T>) => R) {
        const cell = this.getEntityMut(entity);
        if (cell instanceof EntityFetchError) {
            return;
        }

        if (!cell.hasId(component_id)) {
            return;
        }

        const archetype = cell.archetype;
        this.triggerOnReplace(archetype, entity, [component_id],)
        return cell
    }

    triggerOnAdd(archetype: Archetype, entity: Entity, target: Iterable<ComponentId>) {
        if (archetype.hasAddHook) {
            for (const component_id of iter(target)) {
                const hooks = this.#world.components.getInfo(component_id)!.hooks
                if (hooks.on_add) {
                    hook(this, { entity, component_id, relationship_hook_mode: RelationshipHookMode.Run })
                }
            }
        }
    }
    triggerOnInsert(archetype: Archetype, entity: Entity, target: Iterable<ComponentId>) {
        if (archetype.hasInsertHook) {
            for (const component_id of iter(target)) {
                const hooks = this.#world.components.getInfo(component_id)!.hooks
                if (hooks.on_insert) {
                    hook(this, { entity, component_id, relationship_hook_mode: RelationshipHookMode.Run })
                }
            }
        }
    }
    triggerOnReplace(archetype: Archetype, entity: Entity, target: Iterable<ComponentId>) {
        if (archetype.hasReplaceHook) {
            for (const component_id of iter(target)) {
                const hooks = this.#world.components.getInfo(component_id)!.hooks
                if (hooks.on_replace) {
                    hook(this, { entity, component_id, relationship_hook_mode: RelationshipHookMode.Run })
                }
            }
        }
    }

    triggerOnRemove(archetype: Archetype, entity: Entity, target: Iterable<ComponentId>) {
        if (archetype.hasRemoveHook) {
            for (const component_id of iter(target)) {
                const hooks = this.#world.components.getInfo(component_id)!.hooks
                if (hooks.on_remove) {
                    hook(this, { entity, component_id, relationship_hook_mode: RelationshipHookMode.Run })
                }
            }
        }
    }
    triggerObservers(type: ObserverId, entity: Entity, target: Iterable<ComponentId>) {

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