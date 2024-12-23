import { assert, expect, test } from 'vitest'
import { define_component, define_marker, With, Without, World, TypeId, StorageType, Maybe, Added, Write, Read, ReadRef, EntityRef, Changed, Events, Query, Schedule, define_system } from '../../src/ecs'
import { Option, is_some } from 'joshkaposh-option';

class A {
    static type_id: TypeId['type_id'];
    static storage_type: StorageType;

    constructor(public value = 'hello world!') { }
}
class B {
    static type_id: TypeId['type_id'];
    static storage_type: StorageType;
    constructor(public value = 'getting groovy!') { }
}
class C {
    static type_id: TypeId['type_id'];
    static storage_type: StorageType;
}
class D {
    static type_id: TypeId['type_id'];
    static storage_type: StorageType;
}

define_component(A)
define_component(B)
define_component(C)
define_component(D)

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

class TestEvent { constructor(public value = 'TestEvent!') { } }

function is_key_pressed(events: Events<typeof TestEvent>) {
    const is_pressed = events.get_cursor().read(events).find((ev) => ev.value.includes('key'))
    return is_pressed
}

test('events', () => {
    const w = World.default();
    const events = Events.default(TestEvent);

    w.register_resource(events as any);
    w.insert_resource(events as any);


    const reader = events.get_cursor();
    events.send(new TestEvent('key A'))
    events.send(new TestEvent('key V'))
    events.send(new TestEvent('key W'));



    for (const ev of reader.read(events)) {
        console.log(ev);
    }

    events.update();
    events.send(new TestEvent('himom'));

    assert(is_key_pressed(events));
    events.clear();
    assert(!is_key_pressed(events));


})

function params<const Params extends readonly any[]>(...p: Params) {
    return p
}

const [a, b, c] = params('a', 'b', 'c')

test('query_with_marker', () => {

    const w = World.default();

    const s = new Schedule('First');
    // s.add_systems()

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

    assert(q_red.iter().count() === 2);
    assert(q_blue.iter().count() === 2);
    assert(q_ab.iter().count() === 4)


    for (const [a] of q_a.iter()) {
        assert_throws(() => {
            a.value = 'not allowed'
        })

    }

    for (const [a] of q_a_mut.iter()) {
        a.value = 'allowed!'
    }



    for (const [a, b] of q_red.iter()) {
    }

    for (const [a, b] of q_blue.iter()) {
    }


})

test('query_mut', () => {
    const w = World.new();
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

test('query_entity_ref', () => {
    const w = World.default();
    w.spawn([new A()]);
    w.spawn([new A()]);
    w.spawn([new A()]);

    const q = w.query([EntityRef, Write(A)]);
    for (const [r, a1] of q.iter()) {
        const a2 = r.get(A);
        a1.value = 'modified';
        assert(a1.value === a2.value);
    }
})

test('query', () => {

    const w = World.default();

    w.spawn([new A(), new B()])
    w.spawn([new A('second a'), new B('second b')])

    const qab = w.query([A, B]);
    const qa = w.query([A]);

    assert(qa.iter().count() === 2);

    w.spawn([new A('third a'), new B('third b')])
    w.spawn([new A('lonely a')])

    assert(qab.iter().count() === 3);
    assert(qa.iter().count() === 4);
})

test('query_with', () => {
    const w = World.default();
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A()]);
    w.spawn([new A()]);
    const qa_with_b = w.query_filtered([A], [With(B)]);
    console.log('a_with_b_count', qa_with_b.iter().count(), 2)
    expect(qa_with_b.iter().flatten().collect()).toEqual([new A('with_b'), new A('with_b')])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new C()])
    assert(qa_with_b.iter().count() === 3);

})

test('query_without', () => {
    const w = World.default();
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

    const qa_without_bd = w.query_filtered([A], [Without(D, B)]);

    w.spawn([new A('with_bd'), new C(), new B(), new D()]);
    w.spawn([new A('with_d'), new D()]);
    w.spawn([new A('with_b'), new B()]);

    let it = qa_without_bd.iter();
    console.log(it.next());

})

test('query_with_without', () => {
    const w = World.default();
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
    const w = World.default();
    w.spawn([new A()])
    w.spawn([new A()])
    w.spawn([new A(), new B()])
    w.spawn([new A(), new B()])
    w.spawn([new A(), new B()])

    w.spawn([new A(), new C()])
    w.spawn([new A(), new C()])
    w.spawn([new A(), new C()])

    const q = w.query([A, B]);
    const q2 = w.query([A, Maybe(B)]);
    const q3 = w.query([A, Maybe(B), C]);

    assert(q.iter().count() === 3)
    assert(q2.iter().count() === 8);
    assert(q3.iter().count() === 3)
})

test('query_or', () => {
    const w = World.default();

    w.spawn([new A(), new B(), new C()]);
    w.spawn([new A(), new B()]);
    w.spawn([new A(), new B()]);
    w.spawn([new A('lonely')]);

    const q = w.query_filtered([A], [Added(A), Added(B)])
    assert(q.iter().all(([a]) => a.value !== 'lonely'))
})

test('query_added', () => {
    const w = World.new();

    let q = w.query_filtered([A], [Added(A)])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])

    assert(q.iter().count() === 3)

    w.clear_trackers();

    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])

    assert(q.iter().count() === 3)

    w.clear_trackers();
    assert(q.iter().count() === 0)


})

test('changed', () => {
    const w = World.new();

    let q = w.query_filtered([Write(A)], [Changed(A)])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])

    assert(q.iter().count() === 3);

    w.clear_trackers()
    assert(q.iter().count() === 0);
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new B(), new C()])

    const comps: any[] = [];
    q.iter().for_each(([a]) => {
        comps.push(a);
    })
    w.clear_trackers();

    w.spawn([new A(), new B(), new C()])
})