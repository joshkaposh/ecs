import { expect, test, assert } from "vitest";
import { Entities, Entity } from "../../src/ecs";

// test('entity_bits_roundtrip', () => {
//     const e = Entity.from_raw_and_generation(0xDEADBEEF, 0x5AADF00D);
//     expect(Entity.from_bits(e.to_bits())).toEqual(e);
// })

test('reserve_entity_len', () => {
    const e = new Entities();
    e.reserve_entity()
    e.flush(() => { })
    assert(e.len() === 1)
})

test('get_reserved_and_invalid', () => {
    const entities = new Entities();
    const e = entities.reserve_entity();
    assert(entities.contains(e));
    assert(!entities.get(e));
    entities.flush(() => {
        // do nothing ... leaving entity location invalid
    })
    assert(entities.contains(e));
    assert(!entities.get(e));
})

test('entity_const', () => {
    const C1 = Entity.from_raw(42);
    assert(42 === C1.index());
    assert(1 === C1.generation());

    // const C2 = Entity.from_bits(0x0000_00ff_0000_00cc);
    // assert(0x0000_00cc === C2.index());
    // assert(0x0000_00ff === C2.generation());

    const C3 = Entity.from_raw(33).index();
    assert(33 === C3);

    // const C4 = Entity.from_bits(0x00dd_00ff_0000_0000).generation();
    // assert(0x00dd_00ff === C4);

})

test('reserve_generations', () => {
    const entities = new Entities();
    const entity = entities.alloc();
    entities.free(entity);

    assert(entities.__reserve_generations(entity.index(), 1));
})

test('reserve_generations_and_alloc', () => {
    const GENERATIONS = 10;

    const entities = new Entities();
    const entity = entities.alloc();
    entities.free(entity);

    assert(entities.__reserve_generations(entity.index(), GENERATIONS));

    // The very next entity allocated should be a further generation on the same index
    const next_entity = entities.alloc();
    assert(next_entity.index() === entity.index());
    assert(next_entity.generation() > entity.generation() + GENERATIONS);
})

test('entity_comparison', () => {
    assert(Entity.eq(
        Entity.from_raw_and_generation(123, 456),
        Entity.from_raw_and_generation(123, 456))
    );
    assert(!Entity.eq(
        Entity.from_raw_and_generation(123, 789),
        Entity.from_raw_and_generation(123, 456)
    ));
    assert(!Entity.eq(
        Entity.from_raw_and_generation(123, 456),
        Entity.from_raw_and_generation(123, 789))
    );
    assert(!Entity.eq(
        Entity.from_raw_and_generation(123, 456),
        Entity.from_raw_and_generation(456, 123)
    ))
})