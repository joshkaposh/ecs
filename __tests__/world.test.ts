import { assert, test } from 'vitest'
import { World, StorageType, Component, Resource, define_component, define_resource, System, Condition } from '../src/ecs'

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

test('world', () => {
    const w = World.default();

    const id4 = w.init_component(A as Component);
    const id5 = w.init_component(B as Component);
    const id6 = w.init_component(C as Component);
    assert(
        id4 === 4 &&
        id5 === 5 &&
        id6 === 6
    )

    for (let i = 0; i < 200; i++) {
        w.spawn([new A(), new B(), new C()])
    }
    assert(w.entities().total_count() === 200)
    w.spawn_batch(Array.from({ length: 100 }, () => [new A(), new B(), new C()]))
    console.log(w.entities().total_count());

    // assert(w.entities().total_count() === 300)


})