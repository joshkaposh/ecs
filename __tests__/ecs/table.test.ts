import { test, assert } from 'vitest'
import { iter, range } from 'joshkaposh-iterator';
import { Entity, Components, Storages, Tick, define_component, Component, } from '../../src/ecs'
import { Table, TableBuilder, TableId, TableRow, Tables } from '../../src/ecs/storage/table';

class W {
    constructor(public table_row: TableRow) { }
}

test('only_one_empty_table', () => {
    const components = Components.default();
    const tables = Tables.default();

    const component_ids = [];
    const table_id = tables.__get_id_or_insert(component_ids, components);

    assert(table_id === TableId.empty)
})

class TestA { constructor(public value = 'test_a') { } }
class TestB { constructor(public value = 'test_b') { } }
define_component(TestA)
define_component(TestB)

test('move_to_superset', () => {
    const components = Components.default();
    const storages = Storages.default();

    const aid = components.init_component(TestA as Component, storages);
    const bid = components.init_component(TestB as Component, storages);

    const table_a_ids = [aid];
    const table_ab_ids = [aid, bid];

    const tables = storages.tables;
    tables.__get_id_or_insert(table_a_ids, components)

    const table_a_id = tables.__get_id_or_insert(table_a_ids, components)
    const table_ab_id = tables.__get_id_or_insert(table_ab_ids, components)
    const table_a = tables.get(table_a_id)!;
    const table_ab = tables.get(table_ab_id)!;

    alloc(table_a, Entity.from_raw(0), aid, new TestA());

    console.log('exists??', table_a.get_column(aid), table_ab.get_column(aid));


    table_a.__move_to_superset_unchecked(0, table_ab);

    console.log(table_a.get_component(aid, 0));
    console.log(table_ab.get_component(aid, 0));
})

function alloc(table: Table, entity: Entity, component_id: number, value: any) {
    const row = table.__allocate(entity);
    table.get_column(component_id)!.__initialize(row, value, new Tick(0))

}

test('Table', () => {
    const components = Components.default();
    const storages = Storages.default();

    const component_id = components.init_component(W as any, storages)

    const columns = [component_id];

    const table = TableBuilder.with_capacity(0, columns.length)
        .add_column(components.get_info(component_id!)!)
        .build();

    const entities = iter(range(0, 200)).map(i => Entity.from_raw(i)).collect()

    for (const entity of entities) {
        const row = table.__allocate(entity);
        const value = new W(row);
        table.get_column(component_id!)!.__initialize(row, value, new Tick(0))
    }

    assert(table.entity_capacity() === 256)
    assert(table.entity_count() === 200);
})