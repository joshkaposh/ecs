import { assert, expect, test } from 'vitest'
import { is_none, is_some } from 'joshkaposh-option';
import { World } from 'ecs';
import { define_component } from 'define';
const A = define_component(class A { constructor(public value = 'A') { } })
const B = define_component(class B { constructor(public value = 'B') { } })
const C = define_component(class C { constructor(public value = 'C') { } })

test('bundle', () => {
    const w = new World();

    const e0 = w.spawn([new A('in table A')]);
    const e1 = w.spawn([new A('2nd in table A')]);
    const e2 = w.spawn([new A('in table B'), new B('in table B')]);

    const arch0 = e0.archetype();
    const arch1 = e2.archetype();

    assert(arch0.id() !== arch1.id());

    for (const archent of arch0.entities()) {
        const ent = w.get_entity(archent.id())!;
        const compA = ent.get(A)!;
        assert(compA.value === 'in table A' ||
            compA.value === '2nd in table A'
        )
    }

    for (const archent of arch1.entities()) {
        const ent = w.get_entity(archent.id())!;
        const compA = ent.get(A)!;
        const compB = ent.get(B)!;
        assert(compA.value === 'in table B' && compB.value === 'in table B')
    }

    assert(is_some(w.get_entity(e0.id())));
    assert(is_some(w.get_entity(e1.id())));

    expect(e0.get(A)!.value).toEqual('in table A');
    expect(e1.get(A)!.value).toEqual('2nd in table A');

    e0.despawn();

    assert(is_none(w.get_entity(e0.id())));
    assert(is_some(w.get_entity(e1.id())));

    const e3 = w.spawn([new A('3rd in table A')]);
    const id0 = e0.id();
    const id2 = e3.id();

    assert(id0.index() === id2.index()
        && id0.generation() !== id2.generation());

    w.spawn_batch([
        [new A('4th in table A')],
        [new A('5th in table A')],
        [new A('6th in table A')]
    ]).collect();
})