import { defineComponent, defineSystem, set } from 'define';
import { World, Schedule } from 'ecs';

export default (count: number) => {
    const world = new World();

    const A = defineComponent(class A { constructor(public value: number) { } })
    const B = defineComponent(class B { constructor(public value: number) { } })
    const C = defineComponent(class C { constructor(public value: number) { } })
    const D = defineComponent(class D { constructor(public value: number) { } })
    const E = defineComponent(class E { constructor(public value: number) { } })

    const systemAB = defineSystem(b => b.query([A, B]), (ab) => {
        for (const [a, b] of ab) {
            const x = a.value;
            a.value = b.value;
            b.value = x;
        }
    })
    const systemCD = defineSystem(b => b.query([C, D]), (cd) => {
        for (const [c, d] of cd) {
            const x = c.value;
            c.value = d.value;
            d.value = x;
        }
    })
    const systemCE = defineSystem(b => b.query([C, E]), (ce) => {
        for (const [c, e] of ce) {
            const x = c.value;
            c.value = e.value;
            e.value = x;
        }
    })

    for (let i = 0; i < count; i++) {
        world.spawn(new A(0), new B(1));

        world.spawn(new A(0), new B(1));


        world.spawn(new A(0), new B(1), new C(2));

        world.spawn(new A(0), new B(1), new C(2), new D(3));

        world.spawn(new A(0), new B(1), new C(2), new E(3));
    }

    const pipeline = () => new Schedule().addSystems(set(systemAB, systemCD, systemCE).chain())

    return () => pipeline().run(world)
}