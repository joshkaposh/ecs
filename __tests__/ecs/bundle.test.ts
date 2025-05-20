import { assert, test } from 'vitest';
import { World } from 'ecs';
import { defineComponent } from 'define';

const Comp = defineComponent(class Comp { constructor(public x = 0, public y = 0, public z = 0) { } })

test('bundle', () => {
    const w = new World();
    w.spawn(new Comp());
    w.spawn(new Comp());
    assert(w.bundles.get(1) == null);
});
