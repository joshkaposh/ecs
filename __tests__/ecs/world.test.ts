import { assert, expect, test } from 'vitest'
import { TypedArray } from 'joshkaposh-option';

import {
    Added,
    Entity,
    index,
    StorageType,
    ThinWorld,
    World,
} from 'ecs';
import {
    defineComponent,
    defineComponent2,
} from 'define'

const A = defineComponent(class A { constructor(public value = 'A') { } })
const B = defineComponent(class B { constructor(public value = 'B') { } })
const C = defineComponent(class C { constructor(public value = 'C') { } })
const D = defineComponent(class D { constructor(public value = 'D') { } })

const Vect3 = {
    x: TypedArray.f32,
    y: TypedArray.f32,
    z: TypedArray.f32,
} as const;

const Position = defineComponent2(Vect3);
const Velocity = defineComponent2(Vect3);

const HP = defineComponent2({
    hp: Float32Array,
});

const ThinMarker = defineComponent2({}, StorageType.SparseSet);

test('components right tables', () => {
    const w = new World();

    let a = w.spawn(new A('himom'));
    w.spawn(new B());
    w.spawn(new C());
    w.spawn(new A(), new B())

    expect(a.get(A)).toEqual(new A('himom'));
})

test('table entities', () => {
    const w = new ThinWorld();

    w.registerComponent(Position);
    w.registerComponent(Position);
    w.registerComponent(Position);

    for (let i = 0; i < 100; i++) {
        w.spawn(Position(i * 1, i * 2, i * 3));
    }

    for (let i = 0; i < 100; i++) {
        w.spawn(Velocity(i * 1, i * 2, i * 3));
    }


    for (let i = 0; i < 100; i++) {
        w.spawn(Position(i * 1, i * 2, i * 3), Velocity(i * 4, i * 5, i * 6));
    }

    const tables = w.storages.tables.iter().skip(1).collect();
    tables.forEach(t => assert(t.entityCount === 100))

    assert(index(tables[0].entities[0]) === 0);
    assert(index(tables[0].entities[99]) === 99);

    assert(index(tables[1].entities[0]) === 100);
    assert(index(tables[1].entities[99]) === 199);

    assert(index(tables[2].entities[0]) === 200);
    assert(index(tables[2].entities[99]) === 299);
})

test('sparse entities', () => {
    const w = new ThinWorld();
    const mid = w.registerComponent(ThinMarker);

    const ids = Array.from({ length: 50 }, (_, i) => [i, i + 1]);
    const entities = new Array(50);

    for (const [i, id] of ids) {
        entities[i] = w.spawn(ThinMarker());
    }

    const sparse = w.storages.sparse_sets.get(mid)!;

    for (let i = 15; i < 25; i++) {
        sparse.remove(entities[i]);
    }

    for (let i = 15; i < 25; i++) {
        sparse.insert(entities[i], [69, 420], 0);
    }

    assert(w.entities.length === 50);
})

// test.skipIf(skip.large)('spawn_batch (large)', () => {
//     const w = new World();

//     test_spawn_batch(w, 100, () => [new A(), new B()]);
//     test_spawn_batch(w, 1000, () => [new A(), new B()]);
//     test_spawn_batch(w, 10_000, () => [new A(), new B()]);
//     test_spawn_batch(w, 100_000, () => [new A(), new B()]);
//     test_spawn_batch(w, 1_000_000, () => [new A(), new B()]);


// })

test('spawn/spawn_batch', () => {
    const w = new World();

    const id4 = w.registerComponent(A);
    const id5 = w.registerComponent(B);
    const id6 = w.registerComponent(C);
    assert(id4 === 4 && id5 === 5 && id6 === 6)

    for (let i = 0; i < 200; i++) {
        w.spawn([new A(), new B(), new C()])
    }

    assert(w.entities.length === 200 as number);

    w.clearTrackers();

    const batch = Array.from({ length: 100 }, (_, i) => [new A(`${i}`), new B(`${i}`), new C(`${i}`)]);
    w.spawnBatch(batch);

    assert(w.entities.length === 300);

    assert(100 === w.queryFiltered([A, B, C], [Added(A), Added(B), Added(C)]).iter(w).count());
    // console.log(w.queryFiltered([A, B, C], [Added(A), Added(B), Added(C)]).iter(w).collect())

    // expect(w.queryFiltered([A, B, C], [Added(A), Added(B), Added(C)]).iter(w).collect())
    // .toEqual(batch);



})

test('thin world spawn/spawn_batch', () => {
    const w = new ThinWorld();

    w.spawn(Position(0, 0, 0))
    const table = w.storages.tables.get(1);


    for (let i = 1; i < 50; i++) {
        w.spawn(Position(i, i, i))
        // console.log(table.length);
        // table.iter_columns().for_each(col => console.log(col.length, col.data.map(field => field.length), col.added_ticks.length, col.changed_ticks.length));
    }


    // console.log('table length: ', table.length);
    // table.iter_columns().for_each(col => console.log(
    //     col.length,
    //     col.added_ticks.length,
    //     col.changed_ticks.length,
    //     col.data,
    //     col.added_ticks,
    //     col.changed_ticks,

    // ));
})

test('spawn nested bundle', () => {
    const w = new World();
    const id = w.spawn(new A('one')).id;

    expect(w.get(id, A)).toEqual(new A('one'))
})

test('entity_mut.insert()', () => {
    const w = new World();

    const entity_mut = w.spawnEmpty();
    const id = entity_mut.id;
    entity_mut.insert([new A('inserted')]);

    expect(entity_mut.get(A)).toEqual(new A('inserted'));
    expect(w.get(id, A)).toEqual(new A('inserted'));

    entity_mut.insert([new B('inserted-b'), new C('inserted-c')]);

    expect(w.get(id, B)).toEqual(new B('inserted-b'));
    expect(w.get(id, C)).toEqual(new C('inserted-c'));
})

test('world.insert_batch()', () => {
    const w = new World();

    const id = w.spawnEmpty().id;
    w.insertBatch([[id, [new A('inserted')]]])
    expect(w.get(id, A)).toEqual(new A('inserted'))

    const entities = Array.from({ length: 5 }, () => w.spawnEmpty().id)
    const batch = entities.map((id, i) => [id, [new A(`inserted-${i}`)]] as const)

    w.insertBatch(batch);
    batch.forEach(([id, a]) => expect(w.get(id, A)).toEqual(a[0]))
})

test('world.insert_batch_if_new()', () => {
    const w = new World();

    const entities = w.spawnBatch(Array.from({ length: 5 }, (_, i) => [new A(`spawned-${i}`)]));
    const batch = entities.map((e, i) => [e, [new A(`inserted-${i}`), new B(`inserted-${i}`)]] as const);
    w.insertBatchIfNew(batch);

    assert(w.entities.length === 5);
    entities.forEach((e, i) => {
        expect(w.get(e, A)).toEqual(new A(`spawned-${i}`));
        expect(w.get(e, B)).toEqual(new B(`inserted-${i}`));
    });
})
