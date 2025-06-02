import { test } from 'vitest'
import { defineComponent } from 'define';
import { World, DeferredWorld } from 'ecs';

const A = defineComponent(class A { constructor(public value = 'A') { } })
const B = defineComponent(class B { constructor(public value = 'B') { } })
const C = defineComponent(class C { constructor(public value = 'C') { } })


test('deferred_world', () => {
    const w = new World();
    const df = new DeferredWorld(w);

    const batch = Array.from({ length: 5 }, () => [new A(), new B(), new C()])
    // const ids = w.spawnBatch(batch, true);
    // for (const id of ids) {
    //     const ewm = w.getEntityMut(id);
    //     const m = w.getMut(id, A)!;
    //     const em = df.getEntityMut(id);
    //     const m2 = df.getMut(id, A)!;
    // }

    // const ents = df.getEntityMut(ids);
})