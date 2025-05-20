import { assert, test } from 'vitest'
import { With, Without, World, Maybe, Added, mut, Changed, Entity } from 'ecs'
import { defineComponent2, defineComponent, defineMarker } from 'define';
import { TypedArray } from 'joshkaposh-option';
import { skip } from '../constants';

const A = defineComponent(class A { constructor(public value = 'hello world!') { } })
const B = defineComponent(class B { constructor(public value = 'getting groovy!') { } })
const C = defineComponent(class C { constructor(public value = 'c!') { } })
const D = defineComponent(class D { constructor(public value = 'd!') { } })

const AVec3 = defineComponent(class AVect3 { constructor(public x = 0, public y = 0, public z = 0) { } })
const BVec3 = defineComponent(class BVect3 { constructor(public x = 0, public y = 0, public z = 0) { } })
const CVec3 = defineComponent(class CVect3 { constructor(public x = 0, public y = 0, public z = 0) { } })
const DVec3 = defineComponent(class DVect3 { constructor(public x = 0, public y = 0, public z = 0) { } })


const Vect3 = {
    x: TypedArray.f32,
    y: TypedArray.f32,
    z: TypedArray.f32,
} as const;

const ThinVec3 = defineComponent2(Vect3);
const ThinA = defineComponent2(Vect3);
const ThinB = defineComponent2(Vect3);
const ThinC = defineComponent2(Vect3);

function assert_throws(fn: () => void) {
    assert((() => {
        let res = false
        try {
            fn()
        } catch (e) {
            res = true
        }

        return res
    })())

}

const Team = {
    Blue: defineMarker(),
    Red: defineMarker(),
} as const;

const skip_non_change_detection = true;
const skip_change_detection = true;

// test('large query', () => {
//     console.log('budget: ', 1000 / 60);
//     const arr1 = [];
//     const arr2 = [];
//     const arr3 = [];
//     const arr4 = [];

//     for (let i = 0; i < 50000; i++) {
//         arr1.push([new AVec3(i, i, i)]);
//         arr2.push([new AVec3(i, i, i), new BVec3(i, i, i)]);
//         arr3.push([new AVec3(i, i, i), new BVec3(i, i, i), new CVec3(i, i, i)]);
//         arr4.push([new AVec3(i, i, i), new BVec3(i, i, i), new DVec3(i, i, i)]);
//     }

//     // function loop_arrays(array1: any[], array2: any[], array3: any[], array4: any[]) {
//     //     for (const _ of array1) {
//     //         _
//     //     }

//     //     for (const _ of array2) {
//     //         _

//     //     }

//     //     for (const _ of array3) {
//     //         _

//     //     }

//     //     for (const _ of array4) {
//     //         _

//     //     }
//     // }

//     const times = 5000;
//     let average = 0, fastest = Infinity, slowest = 0;

//     console.log('total (times = %d, average: %d): ', times, average);
//     console.log('per query times (average: %d, fastest: %d, slowest: %d) ', average / times, fastest, slowest);


// })

test.skipIf(skip.large).concurrent('large query perf test', () => {
    const w = new World();

    console.log('budget: ', 1000 / 60);

    for (let i = 0; i < 50000; i++) {
        w.spawn(new AVec3(i, i, i));
        w.spawn(new AVec3(i, i, i), new BVec3(i, i, i));
        w.spawn(new AVec3(i, i, i), new BVec3(i, i, i), new CVec3(i, i, i));
        w.spawn(new AVec3(i, i, i), new BVec3(i, i, i), new DVec3(i, i, i));
        // w.spawn(new AVec3(i, i, i), new BVec3(i, i, i), new CVec3(i, i, i));
        // w.spawn(new AVec3(), new DVec3());
        // w.spawn(new AVec3(), new CVec3(), new DVec3());
        // w.spawn(new AVec3(), new BVec3(), new CVec3(), new DVec3());
    }

    const query = w.query([mut(AVec3), mut(BVec3)]);
    // const query = w.query([AVec3, BVec3]);

    // const times = 5000;
    const times = 1000;
    let average = 0, fastest = Infinity, slowest = 0;
    for (let i = 0; i < times; i++) {
        const then = performance.now();
        query.iter(w).for_each((e) => {
            const [a, b] = e;
        })
        const now = performance.now();
        const dur = now - then;
        average += dur;
        fastest = Math.min(fastest, dur);
        slowest = Math.max(slowest, dur);
    }

    console.log('total (times = %d, average: %d): ', times, average);
    console.log('per query times (average: %d, fastest: %d, slowest: %d) ', average / times, fastest, slowest);


}, 60000);

test.skipIf(skip_non_change_detection)('query_builder', () => {
    // const w = new World();
    // const query = new QueryBuilder(w, [A])
    //     .with(B)
    //     .without(C)
    //     .build();

    // w.spawn(new A('lonely A'))
    // w.spawn(new A('A with B'), new B())
    // w.spawn(new A('A with B and C'), new B(), new C())

    // for (const [a, b, c] of query) {

    // }
})

test.skipIf(skip_non_change_detection)('query_with_marker', () => {

    const w = new World();

    w.registerComponent(A)
    w.registerComponent(B)
    w.registerComponent(C)
    w.registerComponent(D)
    w.registerComponent(Team.Red);
    w.registerComponent(Team.Blue)

    w.spawn(new A('red'), new B('red'), new Team.Red())
    w.spawn(new A('red'), new B('red'), new Team.Red())
    w.spawn(new A('blue'), new B('blue'), new Team.Blue())
    w.spawn(new A('blue'), new B('blue'), new Team.Blue())

    const qred = w.queryFiltered([A, B], [With(Team.Red)]);
    const qblue = w.queryFiltered([A, B], [With(Team.Blue)]);

    const qab = w.query([A, B]);
    const qa = w.query([A]);

    w.spawn(new A())
    w.spawn(new A())
    w.spawn(new A())

    assert(qa.iter(w).count() === 7);

    assert(qred.iter(w).count() === 2 && qred.iter(w).all(([a, b]) => a.value === 'red' && b.value === 'red'));
    assert(qblue.iter(w).count() === 2 && qblue.iter(w).all(([a, b]) => a.value === 'blue' && b.value === 'blue'));
    assert(qab.iter(w).count() === 4)
})

test.skipIf(skip_non_change_detection)('query_mut', () => {
    const w = new World();
    w.spawn(new A(), new B());
    w.spawn(new A(), new B());
    w.spawn(new A(), new B());

    const q = w.query([A]);
    assert(q.iter(w).count() === 3);
    assert(q.iter(w).count() === 3);

    // assert(q.iter(w).all(([t]) => t.value !== 'modified'))

    const qm = w.query([mut(A)])
    for (const [a] of qm.iter(w)) {
        // a.v.value = 'modified'
    }

    // assert(q.iter(w).all(([t]) => t.value === 'modified'))

})

test.skipIf(skip_non_change_detection)('query_entity', () => {
    const w = new World();
    w.spawn(new A());
    w.spawn(new A());
    w.spawn(new A());

    const q = w.query([Entity, mut(A)]);

    const it = q.iter(w);

    const n = it.next();
    if (!n.done) {
        const [e, a] = n.value;
    }

    // for (const [_, a1] of q.iter(w)) {
    //     a1.v.value = 'modified';
    // }

    // for (const [e, a0] of q.iter(w)) {
    //     const a1 = w.get(e, A)!;
    //     assert(a0.v.value === a1.value)
    // }
})

test.skipIf(skip_non_change_detection)('query_entity_ref', () => {
    //     const w = new World();
    //     w.spawn(new A());
    //     w.spawn(new A());
    //     w.spawn(new A());

    //     const q = w.query([EntityRef, mut(A)]);
    //     for (const [r, a1] of q.iter(w)) {
    //         const a2 = r.get(A)!;
    //         a1.value = 'modified';
    //         assert(a1.value === a2.value);
    //     }
})

test.skipIf(skip_non_change_detection)('query', () => {
    const w = new World();

    const qa = w.query([A]);
    const qab = w.query([A, B]);

    w.spawn(new A()).id;

    assert(qa.iter(w).count() === 1);
    w.spawn(new A('second a'), new B('second b'))

    assert(qa.iter(w).count() === 2);
    assert(qab.iter(w).count() === 1);

    w.spawn(new A('third a'), new B('third b'));
    w.spawn(new A('lonely a'));

    assert(qab.iter(w).count() === 2);
    assert(qa.iter(w).count() === 4);

    w.spawn(new A(), new C());

    assert(qab.iter(w).count() === 2);
    assert(qa.iter(w).count() === 5);
})

test.skipIf(skip_non_change_detection)('query_with', () => {
    const w = new World();
    w.registerComponent(A)
    w.registerComponent(B)
    w.registerComponent(C)

    w.spawn(new A('lonely a'))
    w.spawn(new A('lonely a'))

    const qa_with_b = w.queryFiltered([A], [With(B)]);
    // assert(qiter(w, qa_with_b).count() === 0);

    w.spawn(new A('with_b'), new B())
    w.spawn(new A('with_b'), new B())
    w.spawn(new C())
    // assert(qiter(w, qa_with_b).count() === 2);

    w.spawn(new A('without_b_with_c'), new C())
    // assert(qiter(w, qa_with_b).count() === 2);

    // assert(qiter(w, qa_with_b).all(([x]) => x.value === 'with_b'))
    // assert(qiter(w, qa_with_b).count() === 2);
    w.spawn(new A('with_b'), new B(), new C())
    // assert(qiter(w, qa_with_b).count() === 3);
})

test.skipIf(skip_non_change_detection)('query_without', () => {
    const w = new World();
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('without_b'));
    w.spawn(new A('without_b'));
    w.spawn(new A('with bc'), new B(), new C());

    const qa_without_b = w.queryFiltered([A], [Without(B)]);
    // assert(qiter(w, qa_without_b).count() === 2);
    qa_without_b.iter(w).for_each(([a]) => {
        assert(a.value === 'without_b')
    })
    w.spawn(new A('without_b'))
    w.spawn(new A('without_b'))
    w.spawn(new A(), new C())
    // assert(qiter(w, qa_without_b).count() === 5);

    w.clearEntities();

    const qa_without_bd = w.queryFiltered([A], [Without(B), Without(D)]);

    w.spawn(new A('with_bd'), new C(), new B(), new D());
    w.spawn(new A('with_bd'), new C(), new B(), new D());
    w.spawn(new A('with_bd'), new C(), new B(), new D());
    w.spawn(new A('with_d'), new D());
    w.spawn(new A('with_d'), new D());
    w.spawn(new A('with_d'), new D());
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('lonely'));
    w.spawn(new A('with_c'), new C())

    assert(qa_without_bd.iter(w).all(([a]) => a.value !== 'with_b' && a.value !== 'with_d' && a.value !== 'with_bd'))
})

test.skipIf(skip_non_change_detection)('query_with_without', () => {
    const w = new World();
    w.spawn(new A('lonely a'));
    w.spawn(new A('lonely a'));
    w.spawn(new B())
    w.spawn(new C())
    w.spawn(new A('with_b_without_c'), new B());
    w.spawn(new A('with bc'), new B(), new C());
    w.spawn(new A('with bc'), new B(), new C());
    w.spawn(new A('with bc'), new B(), new C());

    const q_a_with_b_without_c = w.queryFiltered([A], [With(B), Without(C)])
    // assert(qiter(w, q_a_with_b_without_c).count() === 1)

    w.spawn(new A('with bd'), new B(), new D());
})

test.skipIf(skip_non_change_detection)('query_maybe', () => {
    const w = new World();
    w.spawn(new A())
    w.spawn(new A())
    w.spawn(new A(), new B())
    w.spawn(new A(), new B())
    w.spawn(new A(), new B())

    w.spawn(new A(), new C())
    w.spawn(new A(), new C())
    w.spawn(new A(), new C())

    const qa = w.query([A, B]);
    const qa_maybe_b = w.query([A, Maybe(B)]);
    const qac_maybe_b = w.query([A, Maybe(B), C]);

    // assert(qa.iter(w).count() === 3)
    // assert(qiter(w, qa_maybe_b).count() === 8);
    // assert(qiter(w, qac_maybe_b).count() === 3)
})

test.skipIf(skip_non_change_detection)('query_or', () => {
    const w = new World();

    // w.spawn(new A(), new B(), new C());
    // w.spawn(new A(), new B());
    // w.spawn(new A(), new B());
    // w.spawn(new A('lonely'));

    // const q = w.queryFiltered([A], [With(A), With(B)])
    // assert(q.iter(w).all(([a]) => a.value !== 'lonely'))
})

test.skipIf(skip_change_detection)('query_added', () => {
    const w = new World();

    const normal = w.query([A])
    const added = w.queryFiltered([A], [Added(A)])

    w.clearTrackers();

    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());

    assert(added.iter(w).count() === 3)
    assert(normal.iter(w).count() === 3)

    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());

    w.clearTrackers();

    assert(added.iter(w).count() === 0);
    assert(normal.iter(w).count() === 6)

    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());

    assert(added.iter(w).count() === 3);
    assert(normal.iter(w).count() === 9);

})

test.skipIf(skip_change_detection)('changed', () => {
    const w = new World();

    const normal = w.query([mut(A)])
    const changed = w.queryFiltered([A], [Changed(A)])

    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());

    w.clearTrackers()

    assert(normal.iter(w).count() === 3);
    assert(changed.iter(w).count() === 0);

    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());
    w.spawn(new A(), new B(), new C());

    assert(normal.iter(w).count() === 6);
    assert(changed.iter(w).count() === 3);

    w.clearTrackers();

    console.log('changed len', changed.iter(w).count());

    // assert(changed.iter(w).count() === 0);
    // assert(normal.iter(w).count() === 6);

    const it = normal.iter(w);
    for (let i = 0; i < 3; i++) {
        const [a] = it.next().value!;
        a.v;

    }

    console.log('changed len', changed.iter(w).count());

    // assert(changed.iter(w).count() === 3);

    for (const [a] of normal.iter(w)) {
        a.v;
    }

    // assert(changed.iter(w).count() === normal.iter(w).count());

    w.clearTrackers();

    // assert(changed.iter(w).count() == 0);
    // assert(normal.iter(w).count() === 6);
})
