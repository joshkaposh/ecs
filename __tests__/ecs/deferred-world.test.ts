import { test } from 'vitest'
import { World, DeferredWorld } from 'ecs';
import { define_component } from 'define';
import { PrettifyComponent } from 'ecs/src/util';

const A = define_component(class A { constructor(public value = 'A') { } })
const B = define_component(class B { constructor(public value = 'B') { } })
const C = define_component(class C { constructor(public value = 'C') { } })

test('deferred_world', () => {
    const w = new World();
    const df = new DeferredWorld(w);

    const batch = Array.from({ length: 5 }, () => [new A(), new B(), new C()])
    const ids = w.spawn_batch(batch);
    for (const id of ids) {
        const ewm = w.get_entity_mut(id);
        const m = w.get_mut(id, A)!;
        const em = df.get_entity_mut(id);
        const m2 = df.get_mut(id, A)!;
    }

    const ents = df.get_entity_mut(ids);

})