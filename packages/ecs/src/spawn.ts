import { done, ExactSizeIterator, item, iter, SizeHint } from "joshkaposh-iterator";
import { Bundle } from "./bundle";
import { Entity } from "./entity";
import { Relationship } from "./relationship";
import { World } from "./world";

export interface SpawnableList<R> {
    spawn(world: World, entity: Entity): void;
    size_hint(): number;
}

function arraySpawn<R extends Relationship, B extends Bundle>(world: World, relationship: R, bundle: B, entity: Entity) {

}

export class Spawn<R extends Relationship, B extends Bundle> implements SpawnableList<R> {
    readonly B: B[];
    readonly R: R;
    constructor(relationship: R, bundle: B[]) {
        this.R = relationship;
        this.B = bundle;
    }

    into_iter(): ExactSizeIterator<B> {
        return iter(this.B);
    }

    spawnBatch(world: World, entity: Entity): void {
        const R = this.R;
        const B = this.B;
        if (B.length === 1) {
        }

        world.spawnBatch(this.into_iter().map(b => [R.from(entity), b]) as any);
    }

    spawn(world: World, entity: Entity) {
        world.spawn(this.R.from(entity), this.B[0])
    }

    size_hint(): number {
        return this.B.length;
    }
}

type Tuple<T> = (T | T[])[]

type Tuples<T> = T[] | Tuple<T> | Tuple<T[]> | Tuple<Tuple<T>> | Tuple<Tuple<T[]>>

export function all_tuples_spawn<T extends Tuples<SpawnableList<Relationship>>>(tuples: T): SpawnableList<Relationship> {
    const flattened = tuples.flat(Infinity) as SpawnableList<Relationship>[]
    let len = flattened.length;
    return {
        spawn(world, entity) {
            for (let i = 0; i < flattened.length; i++) {
                len--;
                flattened[i].spawn(world, entity)
            }
        },
        size_hint() {
            return len;
        },
    }
}



export { }