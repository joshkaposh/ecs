import { assert, test } from 'vitest'
import { World, StorageType, Component, Resource, define_component, define_resource, System, Condition } from '../src/ecs'
import { iter, once, range } from 'joshkaposh-iterator'
import { Schedule } from '../src/ecs/schedule'

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

function count() { }

// const Count = define_system(count, () => [] as [])
// const sysA = define_system(function sysA() { }, () => [] as [])
// const sysB = define_system(function sysB() { }, () => [] as [])
// const sysC = define_system(function sysC() { }, () => [] as [])
let times = 0
// const RandBool = define_condition(function rand_bool(random: () => number) {
//     return random() >= 0.5;
// }, () => {
//     times += 1
//     console.log('ran ' + times);

//     return [Math.random()] as any
// })

const Update = new Schedule('Update')
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

    for (let i = 0; i < 200; i++) {
        w.spawn([new A(), new B(), new C()])
    }
    assert(w.entities().total_count() === 200)
})