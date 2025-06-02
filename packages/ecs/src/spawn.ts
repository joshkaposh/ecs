import { done, ExactSizeDoubleEndedIterator, ExactSizeIterator, item, iter, Iterator, SizeHint } from "joshkaposh-iterator";
import { Bundle } from "./bundle";
import { Entity } from "./entity";
import { Relationship } from "./relationship";
import { withRelatedEntities, World } from "./world";

export interface SpawnableList<R> {
    spawn(world: World, relationship: R, entity: Entity): void;
    size_hint(): number;
}

function arraySpawn<R extends Relationship, B extends Bundle>(world: World, relationship: R, bundle: B, entity: Entity) {

}

export class Spawn<R extends Relationship, B extends Bundle> implements SpawnableList<R> {
    readonly B: B;
    constructor(bundle: B) {
        this.B = bundle;
    }

    into_iter(): ExactSizeDoubleEndedIterator<B> {
        return iter.of(this.B);
    }

    spawnBatch(world: World, relationship: R, entity: Entity): void {
        world.spawnBatch(this.into_iter().map(b => [relationship.from(entity), b]) as any);
    }

    spawn(world: World, relationship: R, entity: Entity) {
        world.spawn([relationship.from(entity), this.B]);
    }

    size_hint(): number {
        return 1;
    }
}

export class SpawnIter<R extends Relationship, I extends Iterable<Bundle>> {
    #iterator: Iterator<Bundle>;
    constructor(iterable: I) {
        this.#iterator = iter(iterable);
    }

    spawn(world: World, relationship: R, entity: Entity) {
        for (const bundle of this.#iterator) {
            world.spawn([relationship.from(entity), bundle])
        }
    }

    size_hint() {
        return this.#iterator.size_hint()[0];
    }
}

export class SpawnWith<R extends Relationship, F extends (related_spawner: RelatedSpawner) => SpawnableList<R>> {
    F: F;
    constructor(func: F) {
        this.F = func;
    }

    spawn(world: World, relationship: R, entity: Entity) {
        withRelatedEntities(world, relationship, entity, this.F);
    }

    size_hint() {

    }
}

type RelatedSpawner = any;

type Tuple<T> = (T | T[])[]

type Tuples<T> = T[] | Tuple<T> | Tuple<T[]> | Tuple<Tuple<T>> | Tuple<Tuple<T[]>>

export function all_tuples_spawn<R extends Relationship, T extends Tuples<SpawnableList<R>>>(tuples: T): SpawnableList<R> {
    const flattened = tuples.flat(Infinity) as SpawnableList<R>[]
    let len = flattened.length;
    return {
        spawn(world, relationship, entity) {
            for (let i = 0; i < flattened.length; i++) {
                len--;
                flattened[i].spawn(world, relationship, entity)
            }
        },
        size_hint() {
            return len;
        },
    }
}