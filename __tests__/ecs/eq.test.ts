import { test, expect, assert } from 'vitest';
import { eq } from '../../packages/ecs/src/util';
import { Entity } from '../../packages/ecs';

test('eq', () => {
    const e1 = Entity.from_raw_and_generation(0, 1);
    const e2 = Entity.from_raw_and_generation(1, 1)

    eq(e1, e2);

    assert(eq(0, 0));
    assert(!eq(0, 1));
    assert(eq(Entity.from_raw(0), Entity.from_raw(0), 'string'));
    assert(!eq(Entity.from_raw(0), Entity.from_raw(1), 'string'));
    assert(eq(Entity.from_raw(0), Entity.from_raw(0), 'number'));
    assert(!eq(Entity.from_raw(0), Entity.from_raw(1), 'number'));
})