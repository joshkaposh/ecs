import { ExactSizeIterator, done, item } from 'joshkaposh-iterator';
import { Bundle, Bundles, BundleSpawner, DynamicBundle, Entity, World } from '../index';

export class SpawnBatchIter extends ExactSizeIterator<Entity> {
    #inner: ExactSizeIterator<Bundle & DynamicBundle>;
    #spawner: BundleSpawner

    constructor(world: World, iter: ExactSizeIterator<Bundle & DynamicBundle>, bundle: Bundle & DynamicBundle) {
        super();
        // Ensure all entity allocations are accounted for so `self.entities` can realloc if
        // necessary
        world.flush();

        const change_tick = world.change_tick();

        const [lower, upper] = iter.size_hint();
        const length = upper ?? lower;
        world.entities().reserve(length);

        const spawner = BundleSpawner.new(bundle, world, change_tick);
        spawner.reserve_storage(length);

        this.#inner = iter.map(b => Bundles.dynamic_bundle(b as any, world)) as any;
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

    [Symbol.dispose]() {
        for (const _ of this) {
        }
        this.#spawner.flush_commands()
    }
}