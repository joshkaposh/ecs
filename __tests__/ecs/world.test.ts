import { assert, expect, test } from 'vitest'
import { TypedArray } from 'joshkaposh-option';

import {
    World,
} from 'ecs';
import {
    defineComponent,
} from 'define'
import { bench, bench_second } from '../performance';

const A = defineComponent(class A { constructor(public value = 'A') { } })
const B = defineComponent(class B { constructor(public value = 'B') { } })
const C = defineComponent(class C { constructor(public value = 'C') { } })
const D = defineComponent(class D { constructor(public value = 'D') { } })
const E = defineComponent(class E { constructor(public value = 'E') { } })


const Vect3 = {
    x: TypedArray.f32,
    y: TypedArray.f32,
    z: TypedArray.f32,
} as const;

// const Position = defineComponent2(Vect3);
// const Velocity = defineComponent2(Vect3);

// const HP = defineComponent2({
//     hp: Float32Array,
// });

// const ThinMarker = defineComponent2({}, StorageType.SparseSet);

test('components right tables', () => {
    const w = new World();

    let a = w.spawn(new A('himom'));
    w.spawn(new B());
    w.spawn(new C());
    w.spawn(new A(), new B())

    expect(a.get(A)).toEqual(new A('himom'));
})

// test('table entities', () => {
//     const w = new ThinWorld();

//     w.registerComponent(Position);
//     w.registerComponent(Position);
//     w.registerComponent(Position);

//     for (let i = 0; i < 100; i++) {
//         w.spawn(Position(i * 1, i * 2, i * 3));
//     }

//     for (let i = 0; i < 100; i++) {
//         w.spawn(Velocity(i * 1, i * 2, i * 3));
//     }


//     for (let i = 0; i < 100; i++) {
//         w.spawn(Position(i * 1, i * 2, i * 3), Velocity(i * 4, i * 5, i * 6));
//     }

//     const tables = w.storages.tables.iter().skip(1).collect();
//     tables.forEach(t => assert(t.entityCount === 100))

//     assert(index(tables[0].entities[0]) === 0);
//     assert(index(tables[0].entities[99]) === 99);

//     assert(index(tables[1].entities[0]) === 100);
//     assert(index(tables[1].entities[99]) === 199);

//     assert(index(tables[2].entities[0]) === 200);
//     assert(index(tables[2].entities[99]) === 299);
// })

// test('sparse entities', () => {
//     const w = new ThinWorld();
//     const mid = w.registerComponent(ThinMarker);

//     const ids = Array.from({ length: 50 }, (_, i) => [i, i + 1]);
//     const entities = new Array(50);

//     for (const [i, id] of ids) {
//         entities[i] = w.spawn(ThinMarker());
//     }

//     const sparse = w.storages.sparse_sets.get(mid)!;

//     for (let i = 15; i < 25; i++) {
//         sparse.remove(entities[i]);
//     }

//     for (let i = 15; i < 25; i++) {
//         sparse.insert(entities[i], [69, 420], 0);
//     }

//     assert(w.entities.length === 50);
// })

// test.skipIf(skip.large)('spawn_batch (large)', () => {
//     const w = new World();

//     test_spawn_batch(w, 100, () => [new A(), new B()]);
//     test_spawn_batch(w, 1000, () => [new A(), new B()]);
//     test_spawn_batch(w, 10_000, () => [new A(), new B()]);
//     test_spawn_batch(w, 100_000, () => [new A(), new B()]);
//     test_spawn_batch(w, 1_000_000, () => [new A(), new B()]);


// })

// test('spawn/spawn_batch', () => {
//     const w = new World();

//     const id4 = w.registerComponent(A);
//     const id5 = w.registerComponent(B);
//     const id6 = w.registerComponent(C);
//     assert(id4 === 4 && id5 === 5 && id6 === 6)

//     for (let i = 0; i < 200; i++) {
//         w.spawn([new A(), new B(), new C()])
//     }

//     assert(w.entities.length === 200 as number);

//     w.clearTrackers();

//     const batch = Array.from({ length: 100 }, (_, i) => [new A(`${i}`), new B(`${i}`), new C(`${i}`)]);
//     w.spawnBatch(batch);

//     assert(w.entities.length === 300);

//     assert(100 === w.queryFiltered([A, B, C], [Added(A), Added(B), Added(C)]).iter(w).count());
//     // console.log(w.queryFiltered([A, B, C], [Added(A), Added(B), Added(C)]).iter(w).collect())

//     // expect(w.queryFiltered([A, B, C], [Added(A), Added(B), Added(C)]).iter(w).collect())
//     // .toEqual(batch);



// })

// test('thin world spawn/spawn_batch', () => {
//     const w = new ThinWorld();

//     w.spawn(Position(0, 0, 0))
//     const table = w.storages.tables.get(1);


//     for (let i = 1; i < 50; i++) {
//         w.spawn(Position(i, i, i))
//         // console.log(table.length);
//         // table.iter_columns().for_each(col => console.log(col.length, col.data.map(field => field.length), col.added_ticks.length, col.changed_ticks.length));
//     }


//     // console.log('table length: ', table.length);
//     // table.iter_columns().for_each(col => console.log(
//     //     col.length,
//     //     col.added_ticks.length,
//     //     col.changed_ticks.length,
//     //     col.data,
//     //     col.added_ticks,
//     //     col.changed_ticks,

//     // ));
// })

test('spawn nested bundle', () => {
    const w = new World();
    const id = w.spawn(new A('one')).id;

    expect(w.get(id, A)).toEqual(new A('one'))
})

test('EntityWorldMut insert', () => {
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


function spawn(world: World, times: number) {
    for (let i = 0; i < times; i++) {
        world.spawn(new A(`batch-a-${i}`), new B(`batch-b-${i}`), new C(`batch-c-${i}`), new D(`batch-d-${i}`));
    }
}

function spawnBatch(world: World, times: number, collect = false) {
    return world.spawnBatch(Array.from({ length: times }, (_, i) => [new A(`batch-a-${i}`), new B(`batch-b-${i}`), new C(`batch-c-${i}`), new D(`batch-d-${i}`)]), collect);
}

test('spawn performance', () => {
    function setup() {
        const world = new World();
        world.registerComponent(A);
        world.registerComponent(B);
        world.registerComponent(C);
        world.registerComponent(D);

        return world;
    }

    function spawn(count: number) {
        const world = setup();
        return () => {
            world.spawn(new A(), new B(), new C(), new D());
        }
    }

    // function spawnFast(count: number) {
    //     const world = setup();
    //     return () => {
    //         world.spawnFast(new A(), new B(), new C(), new D());
    //     }
    // }

    function spawnBatch(count: number) {
        const world = setup();
        return () => {
            world.spawnBatch(Array.from({ length: count }, () => [new A(), new B(), new C(), new D()]))
        }
    }

    // function spawnBatchFast(count: number) {
    //     const world = setup();
    //     return () => {
    //         world.spawnBatchFast(Array.from({ length: count }, () => [new A(), new B(), new C(), new D()]))
    //     }
    // }

    const count = 1000;
    const total = bench(count, spawn);
    // const fast_total = bench(count, spawnFast);

    console.log(`Spawn {
            op/sec: ${total.hz}
            ms/op: ${total.ms}
        }`);

    // console.log(`SpawnFast {
    //         op/sec: ${fast_total.hz}
    //         ms/op: ${fast_total.ms}
    //     }`);

    // const total_batch = bench_second(count, spawnBatch);
    // const fast_total_batch = bench_second(count, spawnBatchFast);

    // console.log(`SpawnBatch {
    //         op/sec: ${total_batch.hz}
    //         ms/op: ${total_batch.ms}
    //     }`);

    // console.log(`SpawnBatchFast {
    //         op/sec: ${fast_total_batch.hz}
    //         ms/op: ${fast_total_batch.ms}
    //     }`);


}, 10000)


// test('world.spawn / spawnBatch performance', () => {
//     const times = 1000;
//     const results = [];
//     results.push(run_bench(times, () => {
//         const world = new World();
//         world.registerComponent(A);
//         world.registerComponent(B);
//         world.registerComponent(C);
//         world.registerComponent(D);
//         return () => spawn(world, times)
//     }));

//     results.push(run_bench(times, () => {
//         const world = new World();
//         world.registerComponent(A);
//         world.registerComponent(B);
//         world.registerComponent(C);
//         world.registerComponent(D);

//         return () => spawnBatch(world, times)
//     }));

//     results.push(run_bench(times, () => {
//         const world = new World();
//         world.registerComponent(A);
//         world.registerComponent(B);
//         world.registerComponent(C);
//         world.registerComponent(D);

//         return () => spawnBatch(world, times, true)
//     }));

//     // results.push(run_bench(times, () => {
//     //     const world = new World();
//     //     world.registerComponent(A);
//     //     world.registerComponent(B);
//     //     world.registerComponent(C);
//     //     world.registerComponent(D);

//     //     return () => spawnBatch(world, times, true);
//     // }));
//     console.log('| spawn |');
//     console.log(`ops/sec | spawn = ${results[0][0]}, batch = ${results[1][0]} batch collect = ${results[2][0]} |`);
//     console.log(`ms/op | spawn = ${results[0][1]}, batch = ${results[1][1]} batch collect = ${results[2][1]} |`);

// })

// test('system query performance', () => {
//     const times = 1000;
//     const results = [];

//     const createSystem = (a: Component, b: Component) => defineSystem(builder => builder.query([a, b]), (query) => {
//         for (const [a, b] of query) {
//             const x = a.value;
//             a.value = b.value;
//             b.value = x;
//         }
//     })

//     results.push(run_bench(times, () => {
//         const world = new World();

//         world.registerComponent(A);
//         world.registerComponent(B);
//         world.registerComponent(C);
//         world.registerComponent(D);

//         for (let i = 0; i < times; i++) {
//             world.spawn(new A(`${i}`));
//             world.spawn(new A(`${i}`), new B(`${i}`));
//             world.spawn(new A(`${i}`), new B(`${i}`), new C(`${i}`));
//             world.spawn(new A(`${i}`), new B(`${i}`), new C(`${i}`), new D(`${i}`));
//             world.spawn(new A(`${i}`), new B(`${i}`), new C(`${i}`), new E(`${i}`));
//         }

//         const s = new Schedule();
//         s.addSystems(set(createSystem(A, B), createSystem(C, D), createSystem(C, E)).chain());
//         s.initialize(world);
//         return () => {
//             s.run(world);
//         };
//     }));

//     console.log(`| query | ops/sec ${results[0][0]} | ms/op | ${results[0][1]} |`);
// })

test('world.insert_batch()', () => {
    const w = new World();

    const id = w.spawnEmpty().id;
    w.insertBatch([[id, [new A('inserted')]]])
    expect(w.get(id, A)).toEqual(new A('inserted'))

    const entities = Array.from({ length: 5 }, () => w.spawnEmpty().id)
    const batch = entities.map((id, i) => [id, [new A(`inserted-${i}`)]] as [number, [InstanceType<typeof A>]])

    w.insertBatch(batch);
    batch.forEach(([id, a]) => expect(w.get(id, A)).toEqual(a[0]))
})

// test('world.insert_batch_if_new()', () => {
//     const w = new World();

//     const entities = w.spawnBatch(Array.from({ length: 5 }, (_, i) => [new A(`spawned-${i}`)]), true);
//     const batch = entities.map((e, i) => [e, [new A(`inserted-${i}`), new B(`inserted-${i}`)]] as [number, [InstanceType<typeof A>, InstanceType<typeof B>]]);
//     w.insertBatchIfNew(batch);

//     console.log('insertBatch,', entities);

//     assert(w.entities.length === 5);
//     entities.forEach((e, i) => {
//         expect(w.get(e, A)).toEqual(new A(`spawned-${i}`));
//         expect(w.get(e, B)).toEqual(new B(`inserted-${i}`));
//     });

// })
