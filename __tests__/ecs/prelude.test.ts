import { assert, test } from 'vitest';
import { Component, StorageType, World, define_component } from '../../packages/ecs'

const TableStored = define_component(class TableStored { constructor(public value: string) { } })
const SparseStored = define_component(class SparseStored { constructor(public value: number) { } }
    , StorageType.SparseSet)

test('random_access', () => {
    const world = new World();

    const a = new TableStored('aaaaa');


    const e = world.spawn([new TableStored('abc'), new SparseStored(123)]).id();
    const f = world.spawn([new TableStored('def'), new SparseStored(456)]).id();

    assert(world.get(e, TableStored)?.value === 'abc');
    assert(world.get(e, SparseStored)?.value === 123);

    assert(world.get(f, TableStored)?.value === 'def');
    assert(world.get(f, SparseStored)?.value === 456);
})