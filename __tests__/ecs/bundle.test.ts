import { assert, expect, test } from 'vitest'
import { is_none, is_some } from 'joshkaposh-option';
import { define_bundle, World } from 'ecs';
import { define_component } from 'define';
const A = define_component(class A { constructor(public value = 'A') { } })
const B = define_component(class B { constructor(public value = 'B') { } })

// test('bundle', () => {
//     const w = new World();

//     const e0 = w.spawn(new A('in table A'));
//     const e1 = w.spawn(new A('2nd in table A'));
//     const e2 = w.spawn(new A('in table B'), new B('in table B'));

//     const arch0 = e0.archetype();
//     const arch1 = e2.archetype();

//     assert(arch0.id() !== arch1.id());

//     for (const archent of arch0.entities()) {
//         const ent = w.get_entity(archent.id())!;
//         const compA = ent.get(A)!;
//         assert(compA.value === 'in table A' ||
//             compA.value === '2nd in table A'
//         )
//     }

//     for (const archent of arch1.entities()) {
//         const ent = w.get_entity(archent.id())!;
//         const compA = ent.get(A)!;
//         const compB = ent.get(B)!;
//         assert(compA.value === 'in table B' && compB.value === 'in table B')
//     }

//     assert(is_some(w.get_entity(e0.id())));
//     assert(is_some(w.get_entity(e1.id())));

//     expect(e0.get(A)!.value).toEqual('in table A');
//     expect(e1.get(A)!.value).toEqual('2nd in table A');

//     e0.despawn();

//     assert(is_none(w.get_entity(e0.id())));
//     assert(is_some(w.get_entity(e1.id())));

//     const e3 = w.spawn(new A('3rd in table A'));
//     const id0 = e0.id();
//     const id2 = e3.id();

//     assert(id0.index() === id2.index()
//         && id0.generation() !== id2.generation());
// })

test('nested_bundle', () => {
    const w = new World();
    const MyBundle = define_bundle(w, [new A()]);

    w.spawn(MyBundle);
})

// test('insert', () => {
//     const w = new World();

//     const id = w.spawn_empty().id();
//     const entity = w.entity_mut(id);
//     entity.insert_if_new([new A('one')]);
//     entity.insert_if_new([new A('two')]);
//     entity.insert_if_new([new A('three')]);

//     entity.flush();

//     expect(w.get(id, A)).toEqual(new A('one'));
//     expect(entity.get(A)).toEqual(new A('one'));
// })