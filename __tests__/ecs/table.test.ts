import { test, assert } from 'vitest'
import { iter, range } from 'joshkaposh-iterator';
import { Entity, Components, Storages, Tick, } from '../../src/ecs'
import { TableBuilder, TableId, TableRow, Tables } from '../../src/ecs/storage/table';

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