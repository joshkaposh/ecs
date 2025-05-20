import { test, assert, expect } from 'vitest'
import { iter, range } from 'joshkaposh-iterator';
import { Components, Storages, id, Entity, ThinComponents, StorageType, ThinWorld } from 'ecs'
import { Table, TableBuilder, TableId, TableRow, Tables, ThinTable, ThinTableBuilder } from 'ecs/src/storage/table';
import { defineComponent2, defineComponent } from 'define';
import { TypedArray } from 'joshkaposh-option';

const W = defineComponent(class W { constructor(public table_row: TableRow) { } })

function alloc(table: Table, entity: Entity, component_id: number, value: any) {
    const row = table.allocate(entity);
    // @ts-expect-error
    table.getColumn(component_id)!.__initialize(row, value, 0)
}

function alloc2(table: ThinTable, entity: Entity, component_id: number, value: number[]) {
    const row = table.allocate(entity);
    table.getColumn(component_id)!.initialize(row, value, 0);
}

test('only_one_empty_table', () => {
    const components = new Components();
    const tables = new Tables();

    const component_ids: any[] = [];
    const table_id = tables.__getIdOrSet(component_ids, components);

    assert(table_id === TableId.empty);
})

const TestA = defineComponent(class TestA { constructor(public value = 'test_a') { } })
const TestB = defineComponent(class TestB { constructor(public value = 'test_b') { } })

const Vect3 = {
    x: TypedArray.f32,
    y: TypedArray.f32,
    z: TypedArray.f32,
}

const Pos = defineComponent2(Vect3);
const Vel = defineComponent2(Vect3);

const Empty = defineComponent2({});
const EmptyMarker = defineComponent2({}, StorageType.SparseSet);


test('no fields', () => {

    const w = new ThinWorld();
    const empty_id = w.registerComponent(Empty);
    const empty_marker_id = w.registerComponent(EmptyMarker);

    let entity = w.spawn(Empty());
    const table = w.storages.tables.get(entity.archetype.tableId);

    expect(w.get(entity.id, Empty as any)).toEqual([]);
    assert(w.get(0, Empty as any) == null);
    assert(table.length === 1 && table.getColumn(empty_id)?.length === 1)

    entity = w.spawn(EmptyMarker());
    expect(w.get(entity.id, EmptyMarker as any)).toEqual([]);
    expect(w.storages.sparse_sets.get(empty_marker_id)!.get(entity.id)).toEqual([])
    assert(w.get(0, EmptyMarker as any) == null);
    assert(w.storages.sparse_sets.get(empty_marker_id)?.length === 1)

})

test('move_to_superset', () => {
    const components = new Components();
    const storages = new Storages();

    const aid = components.registerComponent(TestA);
    const bid = components.registerComponent(TestB);

    const table_a_ids = [aid];
    const table_ab_ids = [aid, bid];

    const tables = storages.tables;
    tables.__getIdOrSet(table_a_ids, components)

    const table_a_id = tables.__getIdOrSet(table_a_ids, components)
    const table_ab_id = tables.__getIdOrSet(table_ab_ids, components)
    const table_a = tables.get(table_a_id)!;
    const table_ab = tables.get(table_ab_id)!;

    alloc(table_a, id(0), aid, new TestA());

    // @ts-expect-error
    table_a.__moveToSupersetUnchecked(0, table_ab);

    assert(!table_a.getComponent(aid, 0))
    assert(!!table_ab.getComponent(aid, 0))
})

test('thin move_to_superset', () => {
    const components = new ThinComponents();

    const aid = components.registerComponent(Pos);
    const bid = components.registerComponent(Vel);

    const table_a_ids = [aid];
    const table_ab_ids = [aid, bid];

    const table_a = ThinTableBuilder.withCapacity(0, table_a_ids.length).addColumn(components.getInfo(aid)!).build();
    const table_ab = ThinTableBuilder.withCapacity(0, table_ab_ids.length).addColumn(components.getInfo(aid)!).addColumn(components.getInfo(bid)!).build();


    alloc2(table_a, id(0), aid, [69, 420, 1337]);

    expect(table_a.getComponent(aid, 0)).toEqual([69, 420, 1337]);

    table_a.moveToSupersetUnchecked(0, table_ab);

    assert(table_a.length === 0 && table_ab.length === 1);
    assert(table_a.getComponent(aid, 0) == null);
    expect(table_ab.getComponent(aid, 0)).toEqual([69, 420, 1337]);
})

// test('thin table', () => {
//     const components = new ThinComponents();
//     const component_id = components.registerComponent(Pos);
//     const columns = [component_id];

//     const table = ThinTableBuilder
//         .withCapacity(0, columns.length)
//         .addColumn(components.getInfo(component_id)!)
//         .build();

//     range(0, 200).map(i => {
//         const e = id(i)
//         alloc2(table, e, component_id, [1, 3, 5]);
//         return e
//     }).for_each(() => { })

//     assert(table.entityCount === 200);
//     assert(table.capacity === 256);
// })

test('table', () => {
    const components = new Components();
    const component_id = components.registerComponent(W);
    const columns = [component_id];

    const table = TableBuilder.withCapacity(0, columns.length)
        .addColumn(components.getInfo(component_id!)!)
        .build();

    const entities = iter(range(0, 200)).map(i => id(i)).collect()

    for (const entity of entities) {
        const row = table.allocate(entity);
        const value = new W(row);
        // @ts-expect-error
        table.getColumn(component_id!)!.__initialize(row, value, 0)
    }

    assert(table.entityCapacity === 256)
    assert(table.entityCount === 200);
})