import { assert, test } from 'vitest'
import { World, StorageType, Component, Resource, define_component, define_resource } from '../src/ecs'

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
    const w = World.default();

    const id0 = w.init_component(A as Component);
    const id1 = w.init_component(B as Component);
    const id2 = w.init_component(C as Component);

    assert(id0 === 0 && id1 === 1 && id2 === 2)
    const idm = w.init_component(Marker as Component);
    assert(idm === 3);
    const idr = w.init_resource(Counter as Resource<Component>);
    assert(idr === 4);
})