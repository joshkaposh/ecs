import { assert, test } from 'vitest';
import { Component, StorageType, World } from '../../src/ecs'
import { define_component } from '../../src/define';

class TableStored { constructor(public value: string) { } }
define_component(TableStored)
class SparseStored { constructor(public value: number) { } }
define_component(SparseStored, StorageType.SparseSet)

test('random_access', () => {
    const world = new World();

    const a = new TableStored('aaaaa');


    const e = world.spawn([new TableStored('abc'), new SparseStored(123)]).id();
    const f = world.spawn([new TableStored('def'), new SparseStored(456)]).id();

    assert(world.get(e, TableStored as Component).value === 'abc');
    assert(world.get(e, SparseStored as Component).value === 123);

    assert(world.get(f, TableStored as Component).value === 'def');
    assert(world.get(f, SparseStored as Component).value === 456);
})