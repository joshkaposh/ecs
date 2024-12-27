import { expect, test, assert } from "vitest";
import { Component, define_component, World } from "../../src/ecs";

class AComp { constructor(public value = 'a') { } }
define_component(AComp)
class BComp { constructor(public value = 'b') { } }
define_component(BComp)
class CComp { constructor(public value = 'c') { } }
define_component(CComp)

test('entity_world_mut', () => {
    const w = World.default();

    const ent = w.spawn_empty();
    ent
        .insert([new AComp('inserted_a')])
        .insert([new BComp('inserted_b')]);


    expect(ent.get(AComp as Component)).toEqual(new AComp('inserted_a'))
    expect(ent.get(BComp as Component)).toEqual(new BComp('inserted_b'))

    ent.remove([BComp]);
    expect(ent.get(AComp as Component)).toEqual(new AComp('inserted_a'))
    assert(!ent.get(BComp as Component));

    ent.remove([AComp]);
    // assert(!ent.get(AComp as Component));
    // assert(!ent.get(BComp as Component));

    // const ent2 = w.spawn_empty();
    // ent2.insert([new AComp()])
    //     .insert([new BComp()])
    //     .insert([new CComp()])

    // ent2.remove([BComp]);
    // console.log(ent2.get(AComp));
    // console.log(ent2.get(BComp));
    // // console.log(ent2.get(CComp));
    // ent2.insert([new BComp('second insert')])
    // // console.log(ent2.get(AComp));
    // // console.log(ent2.get(BComp));
    // // console.log(ent2.get(CComp));
    // ent2.remove([BComp])
})