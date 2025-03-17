import { expect, test, assert, describe, it } from "vitest";
import { index, generation, Entities, EntityMap, EntitiesOld, EntityOld } from "ecs";
import { Identifier, IdKind } from "ecs/src/identifier";
import { skip_large } from '../constants'

test('entity-hashset', () => {
    const e = new EntityOld(0, 1);
    const set = new Set();

    set.add(e);
    assert(set.has(e));
    set.delete(e);
    assert(!set.has(e));

    const e2 = EntityOld.from_raw_and_generation(0xDEADBEEF, 0x5AADF00D);
    set.add(e2);
    assert(set.has(e2));
    set.delete(e2);
    assert(!set.has(e2));
})

test.skipIf(skip_large)('entity set/map large test', () => {
    const set = new Set();
    const map = new EntityMap();

    for (let i = 0; i < 10000; i++) {
        const e = EntityOld.from_raw(i);
        set.add(e);
        map.set(e, 'himom')
    }

    for (let i = 0; i < 10000; i++) {
        const e = EntityOld.from_raw(i);
        assert(set.has(e));
        assert(map.has(e));
        assert(map.get(e) === 'himom');

        set.delete(e);
        map.delete(e);
    }

    assert(set.size === 0);
    assert(map.size === 0);

})

test('entity-hashmap', () => {
    const map = new EntityMap<string>();

    // const e = Entity.from_raw_and_generation(0xDEADBEEF, 0x5AADF00D);

    // map.set(e, 'himom');
    // assert(map.get(e) === 'himom');
    // assert(map.insert(e, 'hidad') === 'himom');
    // assert(map.delete(e));
    // assert(map.size === 0);

    // const len = 10000

    // for (let i = 0; i < len; i++) {
    //     const e = Entity.from_raw(i);
    //     map.set(e, `entity-${i}`);
    // }

    // assert(map.size as number === len)

    // for (let i = 0; i < len; i++) {
    //     assert(map.delete(Entity.from_raw(i)));
    // }
})

test('entity_bits_roundtrip', () => {
    const e = EntityOld.from_raw_and_generation(0xDEADBEEF, 0x5AADF00D);
    expect(EntityOld.from_bits(e.to_bits())).toEqual(e);
})

test('id_construction', () => {
    const id = new Identifier(12, 55, IdKind.Entity);
    assert(id.low() === 12);
    assert(id.high() === 55);
})

test('entity_reserve_entity_len', () => {
    const e = new Entities();
    e.reserve_entity();
    e.flush(() => { });
    assert(e.length === 1);
})

function log_entity(entity: number) {
    console.log(`Entity {index: ${index(entity)}, generation: ${generation(entity)}}`);

}

describe.concurrent('what the heck', async () => {
    it.concurrent('test1', { timeout: 5000 }, async ({ expect }) => {
        const entities = new Entities();

        // console.log('Max Generation: ', e.index());

        // let e = entities.reserve_entity();
        // // entities.free(e);
        // let gen = egen(e);
        // while (true) {
        // entities.flush(() => { })
        // entities.free(e);
        // entities.reserve_entity();
        // if (egen(e) < gen) {
        //     break
        // }
        // gen = egen(e);
        // }


    })
})

test('reuses indices', () => {
    const e = new EntitiesOld();
    let e0 = e.alloc();
    let e1 = e.alloc();
    let e2 = e.alloc();
    let e3 = e.alloc();
    let e4 = e.alloc();

    assert(e0.index() === 0 && e0.generation() === 1);
    assert(e1.index() === 1 && e1.generation() === 1);
    assert(e2.index() === 2 && e2.generation() === 1);
    assert(e3.index() === 3 && e3.generation() === 1);
    assert(e4.index() === 4 && e4.generation() === 1);

    e.free(e1);
    e.free(e2);
    e.free(e3);
    e1 = e.alloc();
    e2 = e.alloc();
    e3 = e.alloc();

    console.log(`${e0}, ${e1}, ${e2},${e3}, ${e4}`);

    // assert(e0.index() === 0 && e0.generation() === 1);
    // assert(e1.index() === 1 && e1.generation() === 1);
    // assert(e2.index() === 2 && e2.generation() === 1);
    // assert(e3.index() === 3 && e3.generation() === 1);
    // assert(e4.index() === 4 && e4.generation() === 1);

})

test('fast reuses indices', () => {
    const entities = new Entities();
    let e0 = entities.reserve_entity();
    let e1 = entities.reserve_entity();
    let e2 = entities.reserve_entity();
    let e3 = entities.reserve_entity();
    let e4 = entities.reserve_entity();

    log_entity(e0);
    log_entity(e1);
    log_entity(e2);
    log_entity(e3);
    log_entity(e4);
})

test('reserve_entity_len', () => {
    const e0 = new EntitiesOld();
    e0.reserve_entity()
    e0.flush(() => { })
    assert(e0.len() === 1)

    const e1 = new Entities();
    e1.reserve_entity()
    e1.flush(() => { })
    assert(e1.length === 1)
})

test('get_reserved_and_invalid', () => {
    const entities0 = new EntitiesOld();
    const e0 = entities0.reserve_entity();
    assert(entities0.contains(e0));
    assert(!entities0.get(e0));
    entities0.flush(() => {
        // do nothing ... leaving entity location invalid
    })
    assert(entities0.contains(e0));
    assert(!entities0.get(e0));


    const entities1 = new Entities();
    const e1 = entities1.reserve_entity();
    assert(entities1.contains(e1));
    assert(!entities1.get(e1));
    entities1.flush(() => {
        // do nothing ... leaving entity location invalid
    })
    assert(entities1.contains(e1));
    assert(!entities1.get(e1));
})

test('entity const', () => {
    const C1 = EntityOld.from_raw(42);
    assert(42 === C1.index());
    assert(1 === C1.generation());

    // const C2 = Entity.from_bits(0x0000_00ff_0000_00ccn);

    // assert(0x0000_00cc === C2.index());
    // assert(0x0000_00ff === C2.generation());

    // const C3 = Entity.from_raw(33).index();
    // assert(33 === C3);

    // const C4 = Entity.from_bits(0x00dd_00ff_0000_0000n).generation();
    // assert(0x00dd_00ff === C4);

})

test('reserve_generations', () => {
    const entities0 = new EntitiesOld();
    const e0 = entities0.alloc();
    entities0.free(e0);
    // @ts-expect-error
    assert(entities0.__reserve_generations(e0.index(), 1));

    // const entities1 = new Entities();
    // const e1 = entities1.alloc();
    // entities1.free(e1);
    // // @ts-expect-error
    // assert(entities1.__reserve_generations(index(e1), 1));
})

test('reserve_generations_and_alloc', () => {
    const GENERATIONS = 10;
    const entities0 = new EntitiesOld();
    const e0 = entities0.alloc();
    entities0.free(e0);
    // @ts-expect-error
    assert(entities0.__reserve_generations(e0.index(), GENERATIONS));

    // The very next entity allocated should be a further generation on the same index
    const nexte0 = entities0.alloc();
    assert(nexte0.index() === e0.index());
    assert(nexte0.generation() > e0.generation() + GENERATIONS);


    // const entities1 = new Entities();
    // const e1 = entities1.alloc();
    // entities1.free(e1);
    // // @ts-expect-error
    // assert(entities1.__reserve_generations(index(e1), GENERATIONS));

    // // The very next entity allocated should be a further generation on the same index
    // const nexte1 = entities1.alloc();
    // assert(index(nexte1) === index(e1));
    // assert(generation(nexte1) > generation(e1) + GENERATIONS);
})

// test('entity_comparison', () => {
//     assert(Entity.eq(
//         Entity.from_raw_and_generation(123, 456),
//         Entity.from_raw_and_generation(123, 456))
//     );
//     assert(!Entity.eq(
//         Entity.from_raw_and_generation(123, 789),
//         Entity.from_raw_and_generation(123, 456)
//     ));
//     assert(!Entity.eq(
//         Entity.from_raw_and_generation(123, 456),
//         Entity.from_raw_and_generation(123, 789))
//     );
//     assert(!Entity.eq(
//         Entity.from_raw_and_generation(123, 456),
//         Entity.from_raw_and_generation(456, 123)
//     ))
// })