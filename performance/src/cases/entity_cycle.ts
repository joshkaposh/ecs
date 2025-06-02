import { defineComponent, defineSystem, set } from "define";
import { World, Schedule, Entity, With } from "ecs"

export default (count: number) => {
    const world = new World();

    const A = defineComponent(class A { constructor(public value: number) { } })
    const B = defineComponent(class B { constructor(public value: number) { } })

    const spawnB = defineSystem(b => b.commands().query([Entity, A]), (commands, queryA) => {
        for (const [e, a] of queryA) {
            commands.entity(e).insert(new B(a.value))
        }
    })

    const despawnB = defineSystem(b => b.commands().queryFiltered([Entity], [With(B)]), (commands, queryB) => {
        for (const [e] of queryB) {
            commands.entity(e as number).despawn();
        }
    })

    for (let i = 0; i < count; i++) {
        world.spawn(new A(i));
    }

    const pipeline = () => new Schedule().addSystems(set(spawnB, despawnB));

    return () => pipeline().run(world);
}