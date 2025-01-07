import { test } from "vitest";
import { QueryBuilder, World, define_component } from "../../src/ecs";

class A { constructor(public value: number) { } }
define_component(A)
class B { constructor(public value: number) { } }
define_component(B)
class C { constructor(public value: number) { } }
define_component(C)

test('builder_with_without_static', () => {
    const world = new World();
    const entity_a = world.spawn([new A(0), new B(0)]).id();
    const entity_b = world.spawn([new A(0), new C(0)]).id();

    // const query_a = new QueryBuilder()
})