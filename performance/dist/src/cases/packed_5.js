import { defineComponent, defineSystem, set } from 'define';
import { World, Schedule } from 'ecs';
export default (count) => {
    const world = new World();
    const A = defineComponent(class A {
        value;
        constructor(value) {
            this.value = value;
        }
    });
    const B = defineComponent(class B {
        value;
        constructor(value) {
            this.value = value;
        }
    });
    const C = defineComponent(class C {
        value;
        constructor(value) {
            this.value = value;
        }
    });
    const D = defineComponent(class D {
        value;
        constructor(value) {
            this.value = value;
        }
    });
    const E = defineComponent(class E {
        value;
        constructor(value) {
            this.value = value;
        }
    });
    const packedA = defineSystem(b => b.query([A]), (queryA) => {
        for (const [a] of queryA) {
            a.value *= 2;
        }
    });
    const packedB = defineSystem(b => b.query([B]), (queryB) => {
        for (const [b] of queryB) {
            b.value *= 2;
        }
    });
    const packedC = defineSystem(b => b.query([C]), (queryC) => {
        for (const [c] of queryC) {
            c.value *= 2;
        }
    });
    const packedD = defineSystem(b => b.query([D]), (queryD) => {
        for (const [d] of queryD) {
            d.value *= 2;
        }
    });
    const packedE = defineSystem(b => b.query([E]), (queryE) => {
        for (const [e] of queryE) {
            e.value *= 2;
        }
    });
    for (let i = 0; i < count; i++) {
        world.spawn(new A(i), new B(i), new C(i), new D(i), new E(i));
    }
    const pipeline = () => new Schedule().addSystems(set(packedA, packedB, packedC, packedD, packedE).chain());
    return () => pipeline().run(world);
};
