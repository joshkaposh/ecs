import { test } from 'vitest'
import { define_component, World } from '../src/ecs'

const A = define_component(class A { constructor(public value = 'hello world!') { } })

const B = define_component(class B { constructor(public value = 'getting groovy!') { } })

const C = define_component(class C { })

test('query', () => {

    const w = new World();

    w.spawn([new A(), new B()])
    w.spawn([new A('second a'), new B('second b')])

    const q = w.query([A, B]);


    let it = q.iter(w);
    console.log(it.next().value);
    console.log(it.next().value);
    console.log(it.next().value);

    w.spawn([new A('third a'), new B('third b')])

    it = q.iter(w);

    console.log(it.next().value);
    console.log(it.next().value);
    console.log(it.next().value);

})