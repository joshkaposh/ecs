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
    const systemAB = defineSystem(b => b.query([A, B]), (ab) => {
        for (const [a, b] of ab) {
            const x = a.value;
            a.value = b.value;
            b.value = x;
        }
    });
    const systemCD = defineSystem(b => b.query([C, D]), (cd) => {
        for (const [c, d] of cd) {
            const x = c.value;
            c.value = d.value;
            d.value = x;
        }
    });
    const systemCE = defineSystem(b => b.query([C, E]), (ce) => {
        for (const [c, e] of ce) {
            const x = c.value;
            c.value = e.value;
            e.value = x;
        }
    });
    for (let i = 0; i < count; i++) {
        world.spawn(new A(0), new B(1));
        world.spawn(new A(0), new B(1));
        world.spawn(new A(0), new B(1), new C(2));
        world.spawn(new A(0), new B(1), new C(2), new D(3));
        world.spawn(new A(0), new B(1), new C(2), new E(3));
    }
    const pipeline = () => new Schedule().addSystems(set(systemAB, systemCD, systemCE).chain());
    return () => pipeline().run(world);
};
