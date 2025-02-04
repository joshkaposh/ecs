import { assert, expect, test } from 'vitest'
import { With, Without, World, Maybe, Added, Write, EntityRef, Changed, QueryBuilder, Entity } from 'ecs'
import { define_component, define_marker } from 'define';

const A = define_component(class B { constructor(public value = 'hello world!') { } })
const B = define_component(class B { constructor(public value = 'getting groovy!') { } })
const C = define_component(class B { constructor(public value = 'c!') { } })
const D = define_component(class B { constructor(public value = 'd!') { } })

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

const Team = {
    Blue: define_marker(),
    Red: define_marker(),
} as const;

test('query_builder', () => {
    const w = new World();
    const query = new QueryBuilder(w, [A])
        .with(B)
        .without(C)
        .build();

    w.spawn([new A('lonely A')])
    w.spawn([new A('A with B'), new B()])
    w.spawn([new A('A with B and C'), new B(), new C()])

    for (const [a, b, c] of query) {

    }
})

test('query_with_marker', () => {

    const w = new World();

    w.register_component(A)
    w.register_component(B)
    w.register_component(C)
    w.register_component(D)
    w.register_component(Team.Red);
    w.register_component(Team.Blue)

    w.spawn([new A('red'), new B('red'), new Team.Red()])
    w.spawn([new A('red'), new B('red'), new Team.Red()])
    w.spawn([new A('blue'), new B('blue'), new Team.Blue()])
    w.spawn([new A('blue'), new B('blue'), new Team.Blue()])

    const q_red = w.query_filtered([A, B], [With(Team.Red)]);
    const q_blue = w.query_filtered([A, B], [With(Team.Blue)]);

    const q_ab = w.query([A, B]);

    const q_a = w.query([A]);
    const q_a_mut = w.query([Write(A)]);

    const query_a_added = w.query_filtered([A], [Added(A)]);
    w.clear_trackers();

    assert(query_a_added.iter().count() === 0);
    w.spawn([new A()])
    w.spawn([new A()])
    w.spawn([new A()])
    assert(query_a_added.iter().count() === 3);
    w.clear_trackers();
    assert(query_a_added.iter().count() === 0);

    assert(q_a.iter().count() === 7);

    assert(q_red.iter().count() === 2 && q_red.iter().all(([a, b]) => a.value === 'red' && b.value === 'red'));
    assert(q_blue.iter().count() === 2 && q_blue.iter().all(([a, b]) => a.value === 'blue' && b.value === 'blue'));
    assert(q_ab.iter().count() === 4)

    for (const [a] of q_a.iter()) {
        assert_throws(() => {
            a.value = 'not allowed'
        })

    }

    for (const [a] of q_a_mut) {
        a.value = 'mutated'
    }

    assert(q_a_mut.iter().all(([a]) => a.value === 'mutated'))

})

test('query_mut', () => {
    const w = new World();
    w.spawn([new A(), new B()]);
    w.spawn([new A(), new B()]);
    w.spawn([new A(), new B()]);

    const q = w.query([A]);
    assert(q.iter().count() === 3);
    assert(q.iter().count() === 3);

    for (const [a] of q.iter()) {
        assert_throws(() => a.value = 'modified')
    }
    assert(q.iter().all(([t]) => t.value !== 'modified'))
    const qm = w.query([Write(A)])
    for (const [a] of qm.iter()) {
        a.value = 'modified'
    }

    assert(q.iter().all(([t]) => t.value === 'modified'))

})

test('query_entity', () => {
    const w = new World();
    w.spawn([new A()]);
    w.spawn([new A()]);
    w.spawn([new A()]);

    const q = w.query([Entity, Write(A)]);
    for (const [e, a1] of q.iter()) {
        const a2 = w.get(e, A)!;
        a1.value = 'modified';
        assert(a1.value === a2.value);
    }
})

test('query_entity_ref', () => {
    const w = new World();
    w.spawn([new A()]);
    w.spawn([new A()]);
    w.spawn([new A()]);

    const q = w.query([EntityRef, Write(A)]);
    for (const [r, a1] of q.iter()) {
        const a2 = r.get(A)!;
        a1.value = 'modified';
        assert(a1.value === a2.value);
    }
})

test('query', () => {
    const w = new World();

    w.spawn([new A(), new B()])
    w.spawn([new A('second a'), new B('second b')])

    const qab = w.query([A, B]);
    const qa = w.query([A]);

    assert(qa.iter().count() === 2);
    assert(qab.iter().count() === 2);

    w.spawn([new A('third a'), new B('third b')])
    w.spawn([new A('lonely a')])

    assert(qab.iter().count() === 3);
    assert(qa.iter().count() === 4);

    for (const [a, b] of qab) {

    }
})

test('query_with', () => {
    const w = new World();
    w.register_component(A)
    w.register_component(B)
    w.register_component(C)

    w.spawn([new A('lonely a')])
    w.spawn([new A('lonely a')])

    const qa_with_b = w.query_filtered([A], [With(B)]);
    assert(qa_with_b.count() === 0);

    w.spawn([new A('with_b'), new B()])
    w.spawn([new A('with_b'), new B()])
    w.spawn([new C()])
    assert(qa_with_b.count() === 2);

    w.spawn([new A('without_b_with_c'), new C()])
    assert(qa_with_b.count() === 2);

    assert(qa_with_b.iter().all(([x]) => x.value === 'with_b'))
    assert(qa_with_b.iter().count() === 2);
    w.spawn([new A('with_b'), new B(), new C()])
    assert(qa_with_b.iter().count() === 3);
})

test('query_without', () => {
    const w = new World();
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('without_b')]);
    w.spawn([new A('without_b')]);
    w.spawn([new A('with bc'), new B(), new C()]);

    const qa_without_b = w.query_filtered([A], [Without(B)]);
    assert(qa_without_b.iter().count() === 2);
    expect(qa_without_b.iter().flatten().collect()).toEqual([new A('without_b'), new A('without_b')])
    w.spawn([new A('without_b')])
    w.spawn([new A('without_b')])
    w.spawn([new A(), new C()])
    assert(qa_without_b.iter().count() === 5);

    w.clear_entities();

    const qa_without_bd = w.query_filtered([A], [Without(B), Without(D)]);

    w.spawn([new A('with_bd'), new C(), new B(), new D()]);
    w.spawn([new A('with_bd'), new C(), new B(), new D()]);
    w.spawn([new A('with_bd'), new C(), new B(), new D()]);
    w.spawn([new A('with_d'), new D()]);
    w.spawn([new A('with_d'), new D()]);
    w.spawn([new A('with_d'), new D()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('lonely')]);
    w.spawn([new A('with_c'), new C()])

    assert(qa_without_bd.iter().all(([a]) => a.value !== 'with_b' && a.value !== 'with_d' && a.value !== 'with_bd'))
})

test('query_with_without', () => {
    const w = new World();
    w.spawn([new A('lonely a')]);
    w.spawn([new A('lonely a')]);
    w.spawn([new B()])
    w.spawn([new C()])
    w.spawn([new A('with_b_without_c'), new B()]);
    w.spawn([new A('with bc'), new B(), new C()]);
    w.spawn([new A('with bc'), new B(), new C()]);

    w.spawn([new A('with bc'), new B(), new C()]);
    const q_a_with_b_without_c = w.query_filtered([A], [With(B), Without(C)])
    assert(q_a_with_b_without_c.iter().count() === 1)

    w.spawn([new A('with bd'), new B(), new D()]);
})

test('query_maybe', () => {
    const w = new World();
    w.spawn([new A()])
    w.spawn([new A()])
    w.spawn([new A(), new B()])
    w.spawn([new A(), new B()])
    w.spawn([new A(), new B()])

    w.spawn([new A(), new C()])
    w.spawn([new A(), new C()])
    w.spawn([new A(), new C()])

    const q_a = w.query([A, B]);
    const q_a_maybe_b = w.query([A, Maybe(B)]);
    const q_ac_maybe_b = w.query([A, Maybe(B), C]);

    assert(q_a.iter().count() === 3)
    assert(q_a_maybe_b.iter().count() === 8);
    assert(q_ac_maybe_b.iter().count() === 3)
})

test('query_or', () => {
    const w = new World();

    w.spawn([new A(), new B(), new C()]);
    w.spawn([new A(), new B()]);
    w.spawn([new A(), new B()]);
    w.spawn([new A('lonely')]);

    const q = w.query_filtered([A], [Added(A), Added(B)])
    assert(q.iter().all(([a]) => a.value !== 'lonely'))
})

test('query_added', () => {
    const w = new World();

    let q_normal = w.query([A])
    let q_added = w.query_filtered([A], [Added(A)])

    const b = () => [new A(), new B(), new C()]

    w.spawn(b())
    w.spawn(b())
    w.spawn(b())

    w.clear_trackers();

    w.spawn(b())
    w.spawn(b())
    w.spawn(b())

    assert(q_added.iter().count() === 3)
    assert(q_normal.iter().count() === 6)

    w.clear_trackers();

    assert(q_added.iter().count() === 0);
    assert(q_normal.iter().count() === 6)
})

test('changed', () => {
    const w = new World();

    const q_normal = w.query_filtered([Entity], [With(A)])
    const q_changed = w.query_filtered([Entity, A], [Changed(A)]);

    const bundle = () => [new A(), new B(), new C()]

    w.spawn(bundle());
    w.spawn(bundle());
    w.spawn(bundle());

    const entities: Entity[] = Array.from(q_normal.iter().flatten());


    w.clear_trackers();


    assert(q_changed.count() === 0);

    for (const e of entities) {
        const comp = w.get_mut(e, A);
        comp!.value = 'changed'
    }


})
