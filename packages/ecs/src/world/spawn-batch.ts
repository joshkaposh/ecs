import { ExactSizeIterator, done, item, iter } from 'joshkaposh-iterator';
import { Bundle, Bundles, BundleSpawner, Entity, World } from '../index';
import { MutOrReadonlyArray } from '../util';

export class SpawnBatchIter extends ExactSizeIterator<Entity> {
    #inner: ExactSizeIterator<Bundle>;
    #spawner: BundleSpawner

    constructor(world: World, iterable: (MutOrReadonlyArray<any> | Bundle)[]) {
        super();
        // Ensure all entity allocations are accounted for so `self.entities` can realloc if
        // necessary
        world.flush();

        const bundle_iter = iter(iterable)

        const change_tick = world.change_tick();

        const [lower, upper] = bundle_iter.size_hint();
        const length = upper ?? lower;
        world.entities().reserve(length);

        const bundle = Bundles.dynamic_bundle(world, iterable[0] as unknown as any[]);

        const spawner = BundleSpawner.new(bundle, world, change_tick);
        spawner.reserve_storage(length);

        this.#inner = bundle_iter.map(b => Array.isArray(b) ? Bundles.dynamic_bundle(world, b as any) : b) as any;
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
        this.#spawner.flush_commands();
    }

    [Symbol.dispose]() {
        this.drop();
    }
}