import { assert, expect, test } from 'vitest'
import { With, Without, World, Maybe, Added, Write, EntityRef, Changed, QueryBuilder, Entity, Component, QueryState } from 'ecs'
import { define_component, define_marker } from 'define';
import { skip_large } from '../constants';

const A = define_component(class A { constructor(public value = 'hello world!') { } })
const B = define_component(class B { constructor(public value = 'getting groovy!') { } })
const C = define_component(class C { constructor(public value = 'c!') { } })
const D = define_component(class D { constructor(public value = 'd!') { } })

function assert_throws(fn) {
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

function qiter(world: World, state: QueryState<any>) {
    return state.iter(world, world.last_change_tick(), world.change_tick())
}

const Team = {
    Blue: define_marker(),
    Red: define_marker(),
} as const;

const skip_non_change_detection = false;

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

    w.register_component(A)
    w.register_component(B)
    w.register_component(C)
    w.register_component(D)
    w.register_component(Team.Red);
    w.register_component(Team.Blue)

    w.spawn(new A('red'), new B('red'), new Team.Red())
    w.spawn(new A('red'), new B('red'), new Team.Red())
    w.spawn(new A('blue'), new B('blue'), new Team.Blue())
    w.spawn(new A('blue'), new B('blue'), new Team.Blue())

    const qred = w.query_filtered([A, B], [With(Team.Red)]);
    const qblue = w.query_filtered([A, B], [With(Team.Blue)]);

    const qab = w.query([A, B]);

    const qa = w.query([A]);
    const qa_mut = w.query([Write(A)]);

    // const query_a_added = w.query_filtered([A], [Added(A)]);
    // w.clear_trackers();

    // assert(query_a_added.iter().count() === 0);
    w.spawn(new A())
    w.spawn(new A())
    w.spawn(new A())
    // assert(query_a_added.iter().count() === 3);
    // w.clear_trackers();
    // assert(query_a_added.iter().count() === 0);

    assert(qiter(w, qa).count() === 7);

    assert(qiter(w, qred).count() === 2 && qiter(w, qred).all(([a, b]) => a.value === 'red' && b.value === 'red'));
    assert(qiter(w, qblue).count() === 2 && qiter(w, qblue).all(([a, b]) => a.value === 'blue' && b.value === 'blue'));
    assert(qiter(w, qab).count() === 4)

    for (const [a] of qiter(w, qa)) {
        assert_throws(() => {
            a.value = 'not allowed'
        })

    }

    for (const [a] of qiter(w, qa_mut)) {
        a.value = 'mutated'
    }

    assert(qiter(w, qa_mut).all(([a]) => a.value === 'mutated'))
})

test.skipIf(skip_non_change_detection)('query_mut', () => {
    const w = new World();
    w.spawn(new A(), new B());
    w.spawn(new A(), new B());
    w.spawn(new A(), new B());

    const q = w.query([A]);
    assert(qiter(w, q).count() === 3);
    assert(qiter(w, q).count() === 3);

    for (const [a] of qiter(w, q)) {
        assert_throws(() => a.value = 'modified')
    }
    assert(qiter(w, q).all(([t]) => t.value !== 'modified'))
    const qm = w.query([Write(A)])
    for (const [a] of qiter(w, qm)) {
        a.value = 'modified'
    }

    assert(qiter(w, q).all(([t]) => t.value === 'modified'))

})

test.skipIf(skip_non_change_detection)('query_entity', () => {
    const w = new World();
    w.spawn(new A());
    w.spawn(new A());
    w.spawn(new A());

    const q = w.query([Entity, Write(A)]);
    for (const [e, a1] of qiter(w, q)) {
        const a2 = w.get(e, A)!;
        a1.value = 'modified';
        assert(a1.value === a2.value);
    }
})

test.skipIf(skip_non_change_detection)('query_entity_ref', () => {
    const w = new World();
    w.spawn(new A());
    w.spawn(new A());
    w.spawn(new A());

    const q = w.query([EntityRef, Write(A)]);
    for (const [r, a1] of qiter(w, q)) {
        const a2 = r.get(A)!;
        a1.value = 'modified';
        assert(a1.value === a2.value);
    }
})

test.skipIf(skip_non_change_detection)('query', () => {
    const w = new World();

    const qa = w.query([A]);
    const qab = w.query([A, B]);


    w.spawn(new A())

    assert(qiter(w, qa).count() === 1);

    w.spawn(new A('second a'), new B('second b'))

    assert(qiter(w, qa).count() === 2);
    assert(qiter(w, qab).count() === 1);

    w.spawn(new A('third a'), new B('third b'));
    w.spawn(new A('lonely a'));

    assert(qiter(w, qab).count() === 2);
    assert(qiter(w, qa).count() === 4);

    w.spawn(new A(), new C());

    assert(qiter(w, qab).count() === 2);
    assert(qiter(w, qa).count() === 5);
})

function test_large_query(w: World, length: number, query: Component[], spawn: () => InstanceType<Component>[]) {
    w.clear_entities();

    const q = w.query(query);
    w.spawn_batch(Array.from({ length }, spawn));

    console.time('query');
    qiter(w, q).for_each(() => { });
    console.timeEnd('query');
}

// test('query fast', () => {
//     const w = new World();

//     const q = w.query([A, B]);

//     for (let i = 0; i < 1000000; i++) {
//         w.spawn(new A(), new B());
//     }


//     for (let i = 0; i < 10; i++) {

//         console.time('slow')
//         q.iter().for_each(() => { })
//         console.timeEnd('slow')

//         console.time('fast')
//         q.iter_fast().for_each(() => { })
//         console.timeEnd('fast')
//     }
// })

// test.skipIf(skip_large)('large_queries', () => {

//     const w = new World();

//     test_large_query(w, 100, [A, B], () => [new A(), new B()]);
//     test_large_query(w, 1000, [A, B], () => [new A(), new B()]);
//     test_large_query(w, 10000, [A, B], () => [new A(), new B()]);
//     test_large_query(w, 100_000, [A, B], () => [new A(), new B()]);
//     test_large_query(w, 1_000_000, [A, B], () => [new A(), new B()]);

// })

test.skipIf(skip_non_change_detection)('query_with', () => {
    const w = new World();
    w.register_component(A)
    w.register_component(B)
    w.register_component(C)

    w.spawn(new A('lonely a'))
    w.spawn(new A('lonely a'))

    const qa_with_b = w.query_filtered([A], [With(B)]);
    assert(qiter(w, qa_with_b).count() === 0);

    w.spawn(new A('with_b'), new B())
    w.spawn(new A('with_b'), new B())
    w.spawn(new C())
    assert(qiter(w, qa_with_b).count() === 2);

    w.spawn(new A('without_b_with_c'), new C())
    assert(qiter(w, qa_with_b).count() === 2);

    assert(qiter(w, qa_with_b).all(([x]) => x.value === 'with_b'))
    assert(qiter(w, qa_with_b).count() === 2);
    w.spawn(new A('with_b'), new B(), new C())
    assert(qiter(w, qa_with_b).count() === 3);
})

test.skipIf(skip_non_change_detection)('query_without', () => {
    const w = new World();
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('with_b'), new B());
    w.spawn(new A('without_b'));
    w.spawn(new A('without_b'));
    w.spawn(new A('with bc'), new B(), new C());

    const qa_without_b = w.query_filtered([A], [Without(B)]);
    assert(qiter(w, qa_without_b).count() === 2);
    qiter(w, qa_without_b).for_each(([a]) => {
        assert(a.value === 'without_b')
    })
    w.spawn(new A('without_b'))
    w.spawn(new A('without_b'))
    w.spawn(new A(), new C())
    assert(qiter(w, qa_without_b).count() === 5);

    w.clear_entities();

    const qa_without_bd = w.query_filtered([A], [Without(B), Without(D)]);

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

    assert(qiter(w, qa_without_bd).all(([a]) => a.value !== 'with_b' && a.value !== 'with_d' && a.value !== 'with_bd'))
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

    const q_a_with_b_without_c = w.query_filtered([A], [With(B), Without(C)])
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

    assert(qiter(w, qa).count() === 3)
    assert(qiter(w, qa_maybe_b).count() === 8);
    assert(qiter(w, qac_maybe_b).count() === 3)
})

test.skipIf(skip_non_change_detection)('query_or', () => {
    const w = new World();

    // w.spawn(new A(), new B(), new C());
    // w.spawn(new A(), new B());
    // w.spawn(new A(), new B());
    // w.spawn(new A('lonely'));

    // const q = w.query_filtered([A], [With(A), With(B)])
    // assert(qiter(w, q).all(([a]) => a.value !== 'lonely'))
})

// test('query_added', () => {
//     const w = new World();

//     const q_normal = w.query([A])
//     const q_added = w.query_filtered([A], [Added(A)])

//     w.clear_trackers();

//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());


//     assert(qiter(w, q_added).count() === 3)
//     assert(qiter(w, q_normal).count() === 3)

//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());

//     w.clear_trackers();

//     assert(qiter(w, q_added).count() === 0);
//     assert(qiter(w, q_normal).count() === 6)

//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());

//     assert(qiter(w, q_added).count() === 3);
//     assert(qiter(w, q_normal).count() === 9)
// })

// test('changed', () => {
//     const w = new World();

//     const q_changed = w.query_filtered([Entity], [Changed(A)]);

//     w.clear_trackers()

//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());
//     w.spawn(new A(), new B(), new C());

//     const entities = qiter(w, q_changed).flatten().collect() as Entity[];

//     assert(qiter(w, q_changed).count() === 3);
//     assert(qiter(w, q_changed).count() === 3);

//     assert(entities.length === 3);

//     w.clear_trackers();

//     assert(qiter(w, q_changed).count() === 0);

//     for (const e of entities) {
//         const mut = w.get_mut(e, A)!;
//         mut.v.value = 'changed';
//     }

//     assert(qiter(w, q_changed).count() === 3);

// })
