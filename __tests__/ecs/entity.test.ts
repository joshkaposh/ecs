import { test, assert } from "vitest";
import { index, generation, Entities } from "ecs";
import { Identifier, IdKind } from "ecs/src/identifier";

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

test('reuses indices', () => {
    const e = new Entities();
    let e0 = e.alloc();
    let e1 = e.alloc();
    let e2 = e.alloc();
    let e3 = e.alloc();
    let e4 = e.alloc();

    assert(index(e0) === 0 && generation(e0) === 1);
    assert(index(e1) === 1 && generation(e1) === 1);
    assert(index(e2) === 2 && generation(e2) === 1);
    assert(index(e3) === 3 && generation(e3) === 1);
    assert(index(e4) === 4 && generation(e4) === 1);

    e.free(e1);
    e.free(e2);
    e.free(e3);

    e1 = e.alloc();
    e2 = e.alloc();
    e3 = e.alloc();

    assert(index(e0) === 0 && generation(e0) === 1);
    assert(index(e1) === 3 && generation(e1) === 2);
    assert(index(e2) === 2 && generation(e2) === 2);
    assert(index(e3) === 1 && generation(e3) === 2);
    assert(index(e4) === 4 && generation(e4) === 1);


    // const entities = new Entities();
    //     let e0 = entities.reserve_entity();
    //     let e1 = entities.reserve_entity();
    //     let e2 = entities.reserve_entity();
    //     let e3 = entities.reserve_entity();
    //     let e4 = entities.reserve_entity();

    //     log_entity(e0);
    //     log_entity(e1);
    //     log_entity(e2);
    //     log_entity(e3);
    //     log_entity(e4);
})

test('reserve_entity_len', () => {
    const e0 = new Entities();
    e0.reserve_entity()
    e0.flush(() => { })
    assert(e0.length === 1)

    const e1 = new Entities();
    e1.reserve_entity()
    e1.flush(() => { })
    assert(e1.length === 1)
})

test('get_reserved_and_invalid', () => {
    const entities0 = new Entities();
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

test('reserve_generations', () => {
    const entities = new Entities();
    const e0 = entities.alloc();
    entities.free(e0);
    // @ts-expect-error
    assert(entities.__reserve_generations(index(e0), 1));
})

test('reserve_generations_and_alloc', () => {
    const GENERATIONS = 10;
    const entities = new Entities();
    const e = entities.alloc();
    entities.free(e);
    // @ts-expect-error
    assert(entities.__reserve_generations(index(e), GENERATIONS));

    // The very next entity allocated should be a further generation on the same index
    const nexte = entities.alloc();
    assert(index(nexte) === index(e));
    assert(generation(nexte) > generation(e) + GENERATIONS);

})