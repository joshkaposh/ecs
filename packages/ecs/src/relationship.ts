import { Iterator } from "joshkaposh-iterator";
import { Entity } from "./entity";
import { Component } from "./component";
import { DeferredWorld, EntityFetchError, EntityWorldMut } from "./world";

type HookContext = any;

export type RelationshipHookMode = number;
export const RelationshipHookMode = {
    Run: 0,
    Skip: 1,
    RunIfNotLinked: 2,
} as const;

interface RelationshipProps<T extends any = any> {
    readonly RelationshipTarget: RelationshipTarget<Relationship<T>>;
    get(): Entity;
    from(entity: Entity): Relationship<T>;
    onInsert?(world: DeferredWorld, context: HookContext): void;
    onReplace?(world: DeferredWorld, context: HookContext): void;

}

export type Relationship<T extends any = any> = Component & Required<RelationshipProps<T>>
type RelationshipTarget<R extends Relationship> = Component & {
    readonly LINKED_SPAWN: boolean;
    Relationship: R;
    Collection: RelationshipSourceCollection;
};

export interface RelationshipSourceCollection {
    new(capacity?: number): RelationshipSourceCollection;
    set length(new_length: number);
    get length(): number;
    get isEmpty(): boolean;
    add(entity: Entity): boolean;
    delete(entity: Entity): boolean;
    iter(): Iterator<Entity>;
    clear(): void;

    extendFromIter(iterable: Iterable<Entity>): void;
}



export function defineRelationship<T>(relationship: RelationshipProps<T>): Relationship<T> {
    relationship.onInsert ??= function onInsert(world: DeferredWorld, context: HookContext) {
        const { entity, relationship_hook_mode } = context;
        if (relationship_hook_mode === RelationshipHookMode.Run) {

        } else if (relationship_hook_mode === RelationshipHookMode.Skip) {
            return;
        } else {
            // RelationshipHookMode.RunIfNotLinked
            if (this.RelationshipTarget.LINKED_SPAWN) {
                return
            }
        }

        const target_entity = world.entity(entity);
        if (target_entity.id === entity) {
            console.warn(`The ({${this}}) ${target_entity} relationship on entity ${entity} points to itself.  The invalid `);
            world.commands.entity(entity).remove(this as any);
            return
        }

        const target_entity_mut = world.getEntityMut(target_entity as any) as any;

        if (!(target_entity_mut instanceof EntityFetchError)) {
            const relationship_target = target_entity_mut.getMut(this.RelationshipTarget);
            relationship_target.collection_mut_risky().add(entity);
        }

    }

    relationship.onReplace ??= function onReplace(world: DeferredWorld, context: HookContext) {

    }

    return relationship as Relationship<T>;
}

