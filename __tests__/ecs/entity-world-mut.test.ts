import { test } from "vitest";
import { Component, define_component, World } from "../../src/ecs";

class AComp { constructor(public value = 'a') { } }
define_component(AComp)
class BComp { constructor(public value = 'b') { } }
define_component(BComp)
class CComp { constructor(public value = 'c') { } }
define_component(CComp)

test('entity_world_mut', () => {
    const w = World.default();

    const ent = w.spawn_empty()
    // ent.insert([new AComp()]);
    // console.log('EntityWorldMut', ent.get(AComp as Component));

    // w.spawn()
})