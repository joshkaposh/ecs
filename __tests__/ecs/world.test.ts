import { assert, test } from 'vitest'
import { World, StorageType, Component, Resource, System, Condition } from '../../src/ecs'
import { define_component, define_resource } from '../../src/define'

class A { constructor(public value = 'A') { } }
define_component(A)
class B { constructor(public value = 'B') { } }
define_component(B)
class C { constructor(public value = 'C') { } }
define_component(C)

class Marker { }
define_component(Marker, StorageType.SparseSet);

class Counter { }
define_resource(Counter);

test('world', () => {
    const w = new World();

    const id4 = w.register_component(A as Component);
    const id5 = w.register_component(B as Component);
    const id6 = w.register_component(C as Component);
    assert(
        id4 === 4 &&
        id5 === 5 &&
        id6 === 6
    )

    for (let i = 0; i < 200; i++) {
        w.spawn([new A(), new B(), new C()])
    }
    assert(w.entities().total_count() === 200);

    const batch = Array.from({ length: 100 }, () => [new A(), new B(), new C()]);
    {
        using _ = w.spawn_batch(batch)
    }

    assert(w.entities().total_count() === 300)
})