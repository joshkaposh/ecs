import { ExactSizeIterator, done, item, iter } from 'joshkaposh-iterator';
import { type Bundle, type Entity, type World, Bundles, BundleSpawner, ThinBundle, ThinBundleSpawner, ThinWorld } from '../index';
import type { MutOrReadonlyArray } from '../util';

export class SpawnBatchIter extends ExactSizeIterator<Entity> {
    #inner: ExactSizeIterator<Bundle>;
    #spawner: BundleSpawner;

    constructor(world: World, iterable: (MutOrReadonlyArray<any>)[]) {
        super();
        // Ensure all entity allocations are accounted for so `self.entities` can realloc if
        // necessary
        world.flush();

        const bundle_iter = iter(iterable.flat())

        const change_tick = world.changeTick;

        const [lower, upper] = bundle_iter.size_hint();
        const length = upper ?? lower;
        world.entities.reserve(length);

        const bundle = Bundles.dynamicBundle(iterable[0] as unknown as any[]);

        const spawner = BundleSpawner.new(bundle, world, change_tick);
        spawner.reserveStorage(length);

        this.#inner = bundle_iter.len() === 1 ? bundle : bundle_iter.map(b => Bundles.dynamicBundle(b)) as any;
        this.#spawner = spawner;
    }

    into_iter(): ExactSizeIterator<Entity> {
        this.#inner.into_iter();
        return this;
    }

    next(): IteratorResult<Entity, any> {
        const bundle = this.#inner.next();
        if (bundle.done) {
            return done()
        }
        return item(this.#spawner.spawn(bundle.value));
    }

    len(): number {
        return this.#inner.len();
    }

    size_hint(): [number, number] {
        return this.#inner.size_hint();
    }

    drop() {
        for (const _ of this) { }
        this.#spawner.flushCommands();
        return this;
    }

    [Symbol.dispose]() {
        this.drop();
    }
}


export class ThinSpawnManyIter extends ExactSizeIterator<Entity> {
    #inner: ThinBundle[];
    #spawner: ThinBundleSpawner;
    #index: number;
    constructor(world: ThinWorld, bundle: ThinBundle, bundles: ThinBundle[]) {
        super();

        world.flush();

        const change_tick = world.changeTick;

        const length = bundles.length;
        world.entities.reserve(length);

        const spawner = ThinBundleSpawner.new(world, bundle, change_tick);
        spawner.reserveStorage(length);

        this.#inner = bundles;
        this.#index = -1;
        this.#spawner = spawner;
    }

    into_iter() {
        return this;
    }

    next(): IteratorResult<Entity> {
        this.#index++;
        const index = this.#index;
        if (index >= this.#inner.length) {
            return done();
        }
        const bundle = this.#inner[index];
        return item(this.#spawner.spawn(bundle))
    }

    size_hint() {
        const lower = Math.max(this.#index, 0);
        const upper = this.#inner.length - lower;
        return [lower, upper] as [number, number];
    }

    drop() {
        const inner = this.#inner;
        const len = inner.length, spawner = this.#spawner;

        for (let i = this.#index; i < len; i++) {
            spawner.spawn(inner[i])
        }
    }

    collect() {
        const inner = this.#inner;
        const len = inner.length, spawner = this.#spawner;
        const array = new Array(len - Math.max(this.#index, 0));

        for (let i = this.#index; i < len; i++) {
            spawner.spawn(inner[i])
        }

        return array;
    }
}