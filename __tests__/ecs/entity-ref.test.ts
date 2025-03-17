import { expect, test, assert } from "vitest";
import { is_some } from "joshkaposh-option";
import { World } from "ecs";
import { define_component } from "define";

const AComp = define_component(class AComp { constructor(public value = 'a') { } })
const BComp = define_component(class BComp { constructor(public value = 'b') { } })
const CComp = define_component(class CComp { constructor(public value = 'c') { } })

test('insert/remove()', () => {
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

test('insert/remove_by_id()', () => {
    const w = new World();

    const aid = w.register_component(AComp);
    const bid = w.register_component(BComp);

    const id = w.spawn_empty().id();
    const entity = w.entity_mut(id);

    entity.insert_by_id(aid, new AComp('inserted-a'));
    entity.insert_by_id(bid, new BComp('inserted-b'));

    expect(w.get(id, AComp)).toEqual(new AComp('inserted-a'));
    expect(w.get(id, BComp)).toEqual(new BComp('inserted-b'));
    expect(entity.get(AComp)).toEqual(new AComp('inserted-a'));
    expect(entity.get(BComp)).toEqual(new BComp('inserted-b'));

    entity.remove_by_id(aid);
    entity.remove_by_id(bid);

    assert(!w.get(id, AComp));
    assert(!w.get(id, BComp));
})

test('insert/remove_by_ids()', () => {
    const w = new World();

    const aid = w.register_component(AComp);
    const bid = w.register_component(BComp);
    const cid = w.register_component(CComp);

    const id = w.spawn_empty().id();
    const entity = w.entity_mut(id);

    entity.insert_by_ids([aid, bid], [new AComp('inserted-a'), new BComp('inserted-b')]);
    expect(entity.get(AComp)).toEqual(new AComp('inserted-a'))
    expect(entity.get(BComp)).toEqual(new BComp('inserted-b'))

    entity.remove_by_ids([aid, bid]);

    assert(!entity.get(AComp));
    assert(!entity.get(BComp));
    assert(!w.get(id, AComp));
    assert(!w.get(id, BComp));

    entity.insert_by_ids([aid, bid, cid], [new AComp(), new BComp(), new CComp()]);
    entity.remove_by_ids([bid, aid]);

    assert(is_some(entity.get(CComp)));
    assert(!entity.get(AComp));
    assert(!entity.get(BComp));
    expect(w.get(id, CComp)).toEqual(new CComp());
    assert(!w.get(id, AComp));
    assert(!w.get(id, BComp));
})

test('retain()', () => {
    const w = new World();

    w.register_component(AComp)
    w.register_component(BComp)
    w.register_component(CComp)


    const id = w.spawn_empty().id();
    const entity = w.entity_mut(id);

    entity.insert([new AComp(), new BComp(), new CComp()]);

    entity.retain([new AComp()]);

    assert(entity.contains(AComp));
    assert(!entity.contains(BComp));
    assert(!entity.contains(CComp));

    assert(is_some(w.get(id, AComp)));
    assert(!w.get(id, BComp));
    assert(!w.get(id, CComp));
})

test('clear()', () => {
    const w = new World();
    w.register_component(AComp)
    w.register_component(BComp)
    w.register_component(CComp)

    const id = w.spawn_empty().id();
    const entity = w.entity_mut(id);

    entity.insert([new AComp(), new BComp(), new CComp()]);
    entity.clear();

    assert(!entity.contains(AComp));
    assert(!entity.contains(BComp));
    assert(!entity.contains(CComp));
})

test('components()', () => {
    const w = new World();
    w.register_component(AComp)
    w.register_component(BComp)
    w.register_component(CComp)


    const id = w.spawn_empty().id();
    const entity = w.entity_mut(id);

    assert(!entity.get_components([AComp]));

    entity.insert([new AComp()]);
    expect(entity.components([AComp])).toEqual([new AComp()]);
})