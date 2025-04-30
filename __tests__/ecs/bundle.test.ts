import { assert, test } from 'vitest';
import { World } from 'ecs';

class Comp { constructor(public x = 0, public y = 0, public z = 0) { } }

test('bundle', () => {
    const w = new World();

    w.spawn(new Comp());
    const info = w.bundles.get(0);
    w.spawn(new Comp());
    assert(w.bundles.get(1) == null);
});
