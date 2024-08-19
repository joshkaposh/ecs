import { assert, expect, test } from 'vitest'
import { is_none, is_some } from 'joshkaposh-option';
import { BundleImpl, Component, World, define_bundle, define_component } from '../src/ecs';

class A { constructor(public value = 'A') { } }
define_component(A)

class B { constructor(public value = 'B') { } }
define_component(B)

class C { constructor(public value = 'C') { } }
define_component(C)

// class MyBundle {}
const MyBundle = define_bundle([A as Component<A>, B as Component<B>]);

// test('custom_bundle', () => {
//     const w = World.default();
// })

test('bundle', () => {
    const w = World.default();

    const e0 = w.spawn([new A('in table A')]);
    const e1 = w.spawn([new A('2nd in table A')]);
    const e2 = w.spawn([new A('in table B'), new B('in table B')]);

    const arch0 = e0.archetype();
    const arch1 = e2.archetype();

    assert(arch0.id() !== arch1.id());
    console.log(arch0.table_id(), arch1.table_id());

    // console.log('arch0 entities len', arch0.entities().length);

    for (const archent of arch0.entities()) {
        const ent = w.get_entity(archent.id())!;
        const compA = ent.get(A as Component<A>)!;
        assert(compA.value === 'in table A' ||
            compA.value === '2nd in table A'
        )
    }

    for (const archent of arch1.entities()) {
        const ent = w.get_entity(archent.id())!;
        const compA = ent.get(A as Component<A>)!;
        const compB = ent.get(B as Component<B>)!;
        assert(compA.value === 'in table B' && compB.value === 'in table B')
    }

    assert(is_some(w.get_entity(e0.id())));
    assert(is_some(w.get_entity(e1.id())));

    expect(e0.get(A as Component<A>)!.value).toEqual('in table A');
    expect(e1.get(A as Component<A>)!.value).toEqual('2nd in table A');

    e0.despawn();

    assert(is_none(w.get_entity(e0.id())));
    assert(is_some(w.get_entity(e1.id())));

    const e3 = w.spawn([new A('3rd in table A')]);
    const id0 = e0.id();
    const id2 = e3.id();

    assert(id0.index() === id2.index()
        && id0.generation() !== id2.generation());

    w.spawn_batch(
        [new A('4th in table A')],
        [new A('5th in table A')],
        [new A('6th in table A')]
    ).collect();


    for (const archent of arch0.entities()) {
        const ent = w.get_entity(archent.id())!;
        const compA = ent.get(A as Component<A>)!;
        console.log(compA.value);
    }
})