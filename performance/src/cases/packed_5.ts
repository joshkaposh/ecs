import { defineComponent, defineSystem, set } from 'define';
import { World, Schedule } from 'ecs';

export default (count: number) => {
    const world = new World();

    const A = defineComponent(class A { constructor(public value: number) { } })
    const B = defineComponent(class B { constructor(public value: number) { } })
    const C = defineComponent(class C { constructor(public value: number) { } })
    const D = defineComponent(class D { constructor(public value: number) { } })
    const E = defineComponent(class E { constructor(public value: number) { } })

    const packedA = defineSystem(b => b.query([A]), (queryA) => {
        for (const [a] of queryA) {
            a.value *= 2;
        }
    })

    const packedB = defineSystem(b => b.query([B]), (queryB) => {
        for (const [b] of queryB) {
            b.value *= 2;
        }
    })

    const packedC = defineSystem(b => b.query([C]), (queryC) => {
        for (const [c] of queryC) {
            c.value *= 2;
        }
    })

    const packedD = defineSystem(b => b.query([D]), (queryD) => {
        for (const [d] of queryD) {
            d.value *= 2;
        }
    })

    const packedE = defineSystem(b => b.query([E]), (queryE) => {
        for (const [e] of queryE) {
            e.value *= 2;
        }
    })

    for (let i = 0; i < count; i++) {
        world.spawn(new A(i), new B(i), new C(i), new D(i), new E(i));
    }

    const pipeline = () => new Schedule().addSystems(set(
        packedA,
        packedB,
        packedC,
        packedD,
        packedE
    ).chain())

    return () => pipeline().run(world)
}