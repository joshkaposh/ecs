import { ExactSizeIterator, done, item } from 'joshkaposh-iterator';
import { Bundle, BundleSpawner, DynamicBundle, Entity, World } from '../index';

export class SpawnBatchIter extends ExactSizeIterator<Entity> {
    #inner: ExactSizeIterator<Bundle & DynamicBundle>;
    #spawner: BundleSpawner

    constructor(world: World, iter: ExactSizeIterator<Bundle & DynamicBundle>, item: Bundle & DynamicBundle) {
        super();
        // Ensure all entity allocations are accounted for so `self.entities` can realloc if
        // necessary
        world.flush();

        const [lower, upper] = iter.size_hint();
        const length = upper ?? lower;
        const bundle_info = world
            .bundles()
            .__init_info(item, world.components(), world.storages())
        world.entities().reserve(length);
        const spawner = bundle_info.__get_bundle_spawner(world.entities(), world.archetypes(), world.components(), world.storages());
        spawner.reserve_storage(length);

        this.#inner = iter;
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

    size_hint(): [number, number] {
        return this.#inner.size_hint();
    }
}