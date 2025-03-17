import { test, expect, assert } from 'vitest';
import { eq } from 'ecs/src/util';
import { EntityOld } from 'ecs';

test('eq', () => {
    const e1 = EntityOld.from_raw_and_generation(0, 1);
    const e2 = EntityOld.from_raw_and_generation(1, 1)

    eq(e1, e2);

    assert(eq(0, 0));
    assert(!eq(0, 1));
    assert(eq(EntityOld.from_raw(0), EntityOld.from_raw(0), 'string'));
    assert(!eq(EntityOld.from_raw(0), EntityOld.from_raw(1), 'string'));
    assert(eq(EntityOld.from_raw(0), EntityOld.from_raw(0), 'number'));
    assert(!eq(EntityOld.from_raw(0), EntityOld.from_raw(1), 'number'));
})