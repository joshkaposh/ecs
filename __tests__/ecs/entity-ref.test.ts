import { expect, test, assert } from "vitest";
import { Entity, EntityWorldMut, World } from "ecs";
import { defineComponent } from "define";

const AComp = defineComponent(class AComp { constructor(public value = 'a') { } })
const BComp = defineComponent(class BComp { constructor(public value = 'b') { } })
const CComp = defineComponent(class CComp { constructor(public value = 'c') { } })

const Square = defineComponent(class Square {
    x: number;
    y: number;
    index: number;

    constructor(x: number, y: number, index: number) {
        this.x = x;
        this.y = y;
        this.index = index;
    }
})

const Selected = defineComponent(class Selected {
    symbol: string
    constructor(symbol: string) {
        this.symbol = symbol;
    }
})

function get2dIndex(col: number, row: number, rows: number) {
    return row * rows + col;
}

test('get', () => {
    const w = new World();

    assert(w.get(w.spawn(new AComp()).id, AComp) != null);
})

test('bug from tic-tac-toe', () => {
    const w = new World();

    const entities: number[] = []
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const x = j * 32;
            const y = i * 32;
            const index = get2dIndex(j, i, 3);
            entities.push(w.spawn(new Square(x, y, index)).id);
        }
    }

    // const commands = w.commands;

    for (const id of entities) {
        const e = w.getEntityMut(id)!;
        e.insert(new Selected(`X: ${id}`))
    }


    for (const id of entities) {
        console.log('inserted', w.get(id, Selected));
    }

})

test('insert/remove()', () => {
    const w = new World();

    w.registerComponent(AComp)
    w.registerComponent(BComp)

    const ent = w.spawnEmpty();
    ent
        .insert(new AComp('inserted_a'))
        .insert(new BComp('inserted_b'));

    expect(ent.get(AComp)).toEqual(new AComp('inserted_a'))
    expect(ent.get(BComp)).toEqual(new BComp('inserted_b'))

    ent.remove(BComp);
    expect(ent.get(AComp)).toEqual(new AComp('inserted_a'))
    assert(!ent.get(BComp));

    ent.remove(AComp)

    assert(!ent.get(AComp));
    assert(!ent.get(BComp));

    assert(w.getEntity(ent.id) != null);
    assert(!ent.isDespawned())
    ent.despawn();
    assert(ent.isDespawned());
})

test('insert/removeById()', () => {
    const w = new World();

    const aid = w.registerComponent(AComp);
    const bid = w.registerComponent(BComp);

    const id = w.spawnEmpty().id;
    const entity = w.entityMut(id);

    entity.insert_by_id(aid, new AComp('inserted-a'));
    entity.insert_by_id(bid, new BComp('inserted-b'));

    expect(w.get(id, AComp)).toEqual(new AComp('inserted-a'));
    expect(w.get(id, BComp)).toEqual(new BComp('inserted-b'));
    expect(entity.get(AComp)).toEqual(new AComp('inserted-a'));
    expect(entity.get(BComp)).toEqual(new BComp('inserted-b'));

    entity.removeById(aid);
    entity.removeById(bid);

    assert(!w.get(id, AComp));
    assert(!w.get(id, BComp));
})

test('insert/removeByIds()', () => {
    const w = new World();

    const aid = w.registerComponent(AComp);
    const bid = w.registerComponent(BComp);
    const cid = w.registerComponent(CComp);

    const id = w.spawnEmpty().id;
    const entity = w.entityMut(id);

    entity.insert_by_ids([aid, bid], [new AComp('inserted-a'), new BComp('inserted-b')]);
    expect(entity.get(AComp)).toEqual(new AComp('inserted-a'))
    expect(entity.get(BComp)).toEqual(new BComp('inserted-b'))

    entity.removeByIds([aid, bid]);

    assert(!entity.get(AComp));
    assert(!entity.get(BComp));
    assert(!w.get(id, AComp));
    assert(!w.get(id, BComp));

    entity.insert_by_ids([aid, bid, cid], [new AComp(), new BComp(), new CComp()]);
    entity.removeByIds([bid, aid]);

    assert(entity.get(CComp) != null);
    assert(!entity.get(AComp));
    assert(!entity.get(BComp));
    expect(w.get(id, CComp)).toEqual(new CComp());
    assert(!w.get(id, AComp));
    assert(!w.get(id, BComp));
})

test('retain()', () => {
    const w = new World();

    w.registerComponent(AComp)
    w.registerComponent(BComp)
    w.registerComponent(CComp)


    const id = w.spawnEmpty().id;
    const entity = w.entityMut(id);

    entity.insert(new AComp(), new BComp(), new CComp());

    entity.retain(new AComp());

    assert(entity.has(AComp));
    assert(!entity.has(BComp));
    assert(!entity.has(CComp));

    assert(w.get(id, AComp) != null);
    assert(!w.get(id, BComp));
    assert(!w.get(id, CComp));
})

test('clear()', () => {
    const w = new World();
    w.registerComponent(AComp)
    w.registerComponent(BComp)
    w.registerComponent(CComp)

    const id = w.spawnEmpty().id;
    const entity = w.entityMut(id);

    entity.insert(new AComp(), new BComp(), new CComp());
    entity.clear();

    assert(!entity.has(AComp));
    assert(!entity.has(BComp));
    assert(!entity.has(CComp));
})

test('components()', () => {
    const w = new World();
    w.registerComponent(AComp)
    w.registerComponent(BComp)
    w.registerComponent(CComp)

    const id = w.spawnEmpty().id;
    const entity = w.entityMut(id);

    assert(!entity.getComponents([AComp]));
    entity.insert(new AComp());

    expect(entity.components([AComp])).toEqual([new AComp()]);

    entity.insert(new BComp());

    expect(entity.components([AComp])).toEqual([new AComp()]);
    expect(entity.components([AComp, BComp])).toEqual([new AComp(), new BComp()]);

    entity.insert(new CComp());

    expect(entity.components([AComp])).toEqual([new AComp()]);
    expect(entity.components([AComp, BComp])).toEqual([new AComp(), new BComp()]);
    expect(entity.components([AComp, BComp, CComp])).toEqual([new AComp(), new BComp(), new CComp()]);

    entity.remove(AComp);

    assert(null == entity.components([AComp]));
    assert(null == entity.components([AComp, BComp]));
    assert(null == entity.components([AComp, BComp, CComp]));
    expect(entity.components([BComp, CComp])).toEqual([new BComp(), new CComp()]);

    entity.remove(BComp);

    assert(null == entity.components([AComp]));
    assert(null == entity.components([AComp, BComp]));
    assert(null == entity.components([AComp, BComp, CComp]));
    expect(entity.components([CComp])).toEqual([new CComp()]);

    entity.remove(CComp);

    assert(null == entity.components([AComp]));
    assert(null == entity.components([BComp]));
    assert(null == entity.components([CComp]));
    assert(null == entity.components([AComp, BComp]));
    assert(null == entity.components([AComp, BComp, CComp]));
})