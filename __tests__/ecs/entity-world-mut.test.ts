import { expect, test, assert } from "vitest";
import { is_some } from "joshkaposh-option";
import { World } from "../../packages/ecs";
import { define_component } from "define";

const AComp = define_component(class AComp { constructor(public value = 'a') { } })
const BComp = define_component(class BComp { constructor(public value = 'b') { } })
const CComp = define_component(class CComp { constructor(public value = 'c') { } })

test('entity_world_mut', () => {
    const w = new World();

    w.register_component(AComp)
    w.register_component(BComp)

    w.spawn([new AComp()]);
    w.spawn([new AComp(), new BComp()]);

    const ent = w.spawn_empty();
    ent
        .insert([new AComp('inserted_a')])
        .insert([new BComp('inserted_b')]);


    expect(ent.get(AComp)).toEqual(new AComp('inserted_a'))
    expect(ent.get(BComp)).toEqual(new BComp('inserted_b'))

    ent.remove([BComp]);
    expect(ent.get(AComp)).toEqual(new AComp('inserted_a'))
    assert(!ent.get(BComp));

    ent.remove([AComp])

    assert(!ent.get(AComp));
    assert(!ent.get(BComp));

    assert(is_some(w.get_entity(ent.id())));
    assert(!ent.is_despawned())
    ent.despawn();
    assert(ent.is_despawned());
})