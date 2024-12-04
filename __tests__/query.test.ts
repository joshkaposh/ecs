import { assert, expect, test } from 'vitest'
import { define_component, define_marker, With, Without, World } from '../src/ecs'
import { is_some } from 'joshkaposh-option'
is_some

class A { constructor(public value = 'hello world!') { } }
define_component(A)
class B { constructor(public value = 'getting groovy!') { } }
define_component(B)
class C { }
define_component(C)
class D { }
define_component(D)


const Blue = define_marker();

test('query', () => {

    const w = new World();

    w.spawn([new A(), new B()])
    w.spawn([new A('second a'), new B('second b')])

    const qab = w.query([A, B]);
    const qa = w.query([A]);

    assert(qa.iter(w).count() === 2);

    w.spawn([new A('third a'), new B('third b')])
    w.spawn([new A('lonely a')])

    assert(qab.iter(w).count() === 3);
    assert(qa.iter(w).count() === 4);

})

test('query_with', () => {
    const w = new World();
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A()]);
    w.spawn([new A()]);
    const qa_with_b = w.query_filtered([A], [With(B)]);
    assert(qa_with_b.iter(w).count() === 2)
    expect(qa_with_b.iter(w).flatten().collect()).toEqual([new A('with_b'), new A('with_b')])
    w.spawn([new A(), new B(), new C()])
    w.spawn([new A(), new C()])
    assert(qa_with_b.iter(w).count() === 3);

})

test('query_without', () => {
    const w = new World();
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('without_b')]);
    w.spawn([new A('without_b')]);
    w.spawn([new A('with bc'), new B(), new C()]);

    const qa_without_b = w.query_filtered([A], [Without(B)]);
    assert(qa_without_b.iter(w).count() === 2);
    expect(qa_without_b.iter(w).flatten().collect()).toEqual([new A('without_b'), new A('without_b')])
    w.spawn([new A('without_b')])
    w.spawn([new A('without_b')])
    w.spawn([new A(), new C()])
    assert(qa_without_b.iter(w).count() === 5);
})

test('query_with_without', () => {
    const w = new World();
    w.spawn([new A('lonely a')]);
    w.spawn([new A('lonely a')]);
    w.spawn([new A('with_b_without_c'), new B()]);
    w.spawn([new A('with bc'), new B(), new C()]);
    w.spawn([new A('with bc'), new B(), new C()]);
    const q_a_with_b_without_c = w.query_filtered([A], [With(B), Without(C)])
    assert(q_a_with_b_without_c.iter(w).count() === 1);
    expect(q_a_with_b_without_c.iter(w).flatten().collect()).toEqual([new A('with_b_without_c')])
    w.spawn([new A('with bd'), new B(), new D()]);
    assert(q_a_with_b_without_c.iter(w).count() === 2);
})