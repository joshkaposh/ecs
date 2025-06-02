import { defineComponent, defineSystem, set } from "define";
import { World, Schedule, Entity, With } from "ecs";
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
    const spawnB = defineSystem(b => b.commands().query([Entity, A]), (commands, queryA) => {
        for (const [e, a] of queryA) {
            commands.entity(e).insert(new B(a.value));
        }
    });
    const despawnB = defineSystem(b => b.commands().queryFiltered([Entity], [With(B)]), (commands, queryB) => {
        for (const [e] of queryB) {
            commands.entity(e).despawn();
        }
    });
    for (let i = 0; i < count; i++) {
        world.spawn(new A(i));
    }
    const pipeline = () => new Schedule().addSystems(set(spawnB, despawnB));
    return () => pipeline().run(world);
};
