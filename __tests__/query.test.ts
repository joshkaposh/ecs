import { assert, test } from 'vitest'
import { define_component, define_marker, With, Without, World } from '../src/ecs'
import { is_some } from 'joshkaposh-option'
is_some

class A { constructor(public value = 'hello world!') { } }
define_component(A)
class B { constructor(public value = 'getting groovy!') { } }
define_component(B)
class C { }
define_component(C)

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
})

test('query_without', () => {
    const w = new World();
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('with_b'), new B()]);
    w.spawn([new A('only a')]);
    w.spawn([new A('only a')]);
    w.spawn([new A('with bc'), new B(), new C()]);

    const qa_without_b = w.query_filtered([A], [Without(B)]);

    assert(qa_without_b.iter(w).count() === 2);
    w.spawn([new A()])
    w.spawn([new A()])
    w.spawn([new A()])
    assert(qa_without_b.iter(w).count() === 5);

})