import { expect, test, assert } from "vitest";
import { Component, World } from "../../src/ecs";
import { is_some } from "joshkaposh-option";
import { define_component } from "../../src/define";

class AComp { constructor(public value = 'a') { } }
define_component(AComp)
class BComp { constructor(public value = 'b') { } }
define_component(BComp)
class CComp { constructor(public value = 'c') { } }
define_component(CComp)

test('entity_world_mut', () => {
    const w = new World();

    w.register_component(AComp as Component)
    w.register_component(BComp as Component)

    w.spawn([new AComp()]);
    w.spawn([new AComp(), new BComp()]);

    const ent = w.spawn_empty();
    ent
        .insert([new AComp('inserted_a')])
        .insert([new BComp('inserted_b')]);


    expect(ent.get(AComp as Component)).toEqual(new AComp('inserted_a'))
    expect(ent.get(BComp as Component)).toEqual(new BComp('inserted_b'))

    ent.remove([BComp]);
    expect(ent.get(AComp as Component)).toEqual(new AComp('inserted_a'))
    assert(!ent.get(BComp as Component));

    ent.remove([AComp])

    assert(!ent.get(AComp as Component));
    assert(!ent.get(BComp as Component));

    assert(is_some(w.get_entity(ent.id())));
    assert(!ent.is_despawned())
    ent.despawn();
    assert(ent.is_despawned());
})