import { assert, expect, test } from 'vitest'
import {
    Component,
    World,
} from 'ecs';
import {
    Class,
    define_component,
} from 'define'
import { skip_large } from '../constants';

const A = define_component(class A { constructor(public value = 'A') { } })
const B = define_component(class B { constructor(public value = 'B') { } })
const C = define_component(class C { constructor(public value = 'C') { } })
const D = define_component(class D { constructor(public value = 'D') { } })


type ClassStatic<S, T extends Class<S>> = InstanceType<T>;


class st2 implements ClassStatic<{ staticProp: 'test' }, typeof st2> {
    static staticProp = 'test' as const;
}

function test_spawn_batch(w: World, length: number, batch: () => InstanceType<Component>[]) {
    const b = Array.from({ length }, batch);
    console.log(`spawning entities: ${length}`);
    w.clear_all();
    console.time('spawn_batch');
    w.spawn_batch(b)
    console.timeEnd('spawn_batch');
}

test.skipIf(skip_large)('spawn_batch (large)', () => {
    const w = new World();

    test_spawn_batch(w, 100, () => [new A(), new B()]);
    test_spawn_batch(w, 1000, () => [new A(), new B()]);
    test_spawn_batch(w, 10_000, () => [new A(), new B()]);
    test_spawn_batch(w, 100_000, () => [new A(), new B()]);
    test_spawn_batch(w, 1_000_000, () => [new A(), new B()]);


})

test('spawn/spawn_batch', () => {
    const w = new World();

    const id4 = w.register_component(A);
    const id5 = w.register_component(B);
    const id6 = w.register_component(C);
    assert(id4 === 4 && id5 === 5 && id6 === 6)

    for (let i = 0; i < 200; i++) {
        w.spawn([new A(), new B(), new C()])
    }
    assert(w.entities().length === 200);

    const batch = Array.from({ length: 100 }, () => [new A(), new B(), new C()]);
    w.spawn_batch(batch);

    assert(w.entities().length === 300);
})

test('spawn_nested_bundle', () => {
    const w = new World();
    const id = w.spawn(new A('one')).id();

    expect(w.get(id, A)).toEqual(new A('one'))
})

test('entity_mut.insert()', () => {
    const w = new World();

    const entity_mut = w.spawn_empty();
    const id = entity_mut.id();
    entity_mut.insert([new A('inserted')]);

    expect(entity_mut.get(A)).toEqual(new A('inserted'));
    expect(w.get(id, A)).toEqual(new A('inserted'));

    entity_mut.insert([new B('inserted-b'), new C('inserted-c')]);

    expect(w.get(id, B)).toEqual(new B('inserted-b'));
    expect(w.get(id, C)).toEqual(new C('inserted-c'));
})

test('world.insert_batch()', () => {
    const w = new World();

    const id = w.spawn_empty().id();
    w.insert_batch([[id, [new A('inserted')]]])
    expect(w.get(id, A)).toEqual(new A('inserted'))

    const entities = Array.from({ length: 5 }, () => w.spawn_empty().id())
    const batch = entities.map((id, i) => [id, [new A(`inserted-${i}`)]] as const)

    w.insert_batch(batch);
    batch.forEach(([id, a]) => expect(w.get(id, A)).toEqual(a[0]))
})

test('world.insert_batch_if_new()', () => {
    const w = new World();

    const entities = w.spawn_batch(Array.from({ length: 5 }, (_, i) => [new A(`spawned-${i}`)]));
    const batch = entities.map((e, i) => [e, [new A(`inserted-${i}`), new B(`inserted-${i}`)]] as const);
    w.insert_batch_if_new(batch);

    assert(w.entities().length === 5);
    entities.forEach((e, i) => {
        expect(w.get(e, A)).toEqual(new A(`spawned-${i}`));
        expect(w.get(e, B)).toEqual(new B(`inserted-${i}`));
    });

})
