import { defineComponent } from "define"
import type { Entity } from "../entity"
import { ComponentCloneBehavior, HookContext, StorageType, World } from "..";

export const ObservedBy = defineComponent(class ObservedBy {
    entities: Entity[];
    constructor(entities: Entity[] = []) {
        this.entities = entities;
    }
}, {
    storage_type: StorageType.SparseSet,
    on_remove() {
        return (world: World, { entity }: HookContext) => {
            const ent = world.getMut(entity, ObservedBy)!.v;
            const observed_by = ent.entities;
            ent.entities = [];

            for (let i = 0; i < observed_by.length; i++) {
                const e = observed_by[i];
                let total_entities, despawned_watched_entities;

                const entity_mut = world.getEntityMut(e);
                if (!entity_mut) {
                    continue
                }

                const state = entity_mut.getMut(Observer);
                if (!state) {
                    continue
                }

                state.v.despawned_watched_entities += 1;

                total_entities = state.v.descriptor.entities.length;
                despawned_watched_entities = state.v.despawned_watched_entities;

                if (total_entities === despawned_watched_entities) {
                    world.commands.entity(e).despawn();
                }
            }
        }
    },

    clone_behavior() {
        return ComponentCloneBehavior.Ignore
    }
})

export { }