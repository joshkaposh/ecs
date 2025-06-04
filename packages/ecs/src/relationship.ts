import type { Iterator } from "joshkaposh-iterator";
import type { Entity } from "./entity";
import type { Component, HookContext } from "./component";
import type { DeferredWorld } from "./world";

export type RelationshipHookMode = 0 | 1 | 2;
export const RelationshipHookMode = {
    Run: 0,
    Skip: 1,
    RunIfNotLinked: 2,
} as const;

export interface RelationshipProps<T extends any = any> {
    readonly RelationshipTarget: RelationshipTarget<Relationship<T>>;
    get(): Entity;
    from(entity: Entity): Relationship<T>;
    onInsert?(world: DeferredWorld, context: HookContext): void;
    onReplace?(world: DeferredWorld, context: HookContext): void;
}

export interface Relationship<T extends any = any> extends Component, Required<RelationshipProps<T>> { }

export interface RelationshipTarget<R extends Relationship> extends Component {
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


