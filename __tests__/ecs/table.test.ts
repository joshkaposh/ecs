import { test, assert } from 'vitest'
import { iter, range } from 'joshkaposh-iterator';
import { EntityOld, Components, Storages, Tick, id, Entity } from 'ecs'
import { Table, TableBuilder, TableId, TableRow, Tables } from 'ecs/src/storage/table';
import { define_component } from 'define';

const W = define_component(class W { constructor(public table_row: TableRow) { } })

function alloc(table: Table, entity: Entity, component_id: number, value: any) {
    // @ts-expect-error
    const row = table.__allocate(entity);
    // @ts-expect-error
    table.get_column(component_id)!.__initialize(row, value, new Tick(0))
}

test('only_one_empty_table', () => {
    const components = new Components();
    const tables = new Tables();

    const component_ids = [];
    const table_id = tables.__get_id_or_insert(component_ids, components);

    assert(table_id === TableId.empty)
})

const TestA = define_component(class TestA { constructor(public value = 'test_a') { } })
const TestB = define_component(class TestB { constructor(public value = 'test_b') { } })

test('move_to_superset', () => {
    const components = new Components();
    const storages = new Storages();

    const aid = components.register_component(TestA);
    const bid = components.register_component(TestB);

    const table_a_ids = [aid];
    const table_ab_ids = [aid, bid];

    const tables = storages.tables;
    tables.__get_id_or_insert(table_a_ids, components)

    const table_a_id = tables.__get_id_or_insert(table_a_ids, components)
    const table_ab_id = tables.__get_id_or_insert(table_ab_ids, components)
    const table_a = tables.get(table_a_id)!;
    const table_ab = tables.get(table_ab_id)!;

    alloc(table_a, id(0), aid, new TestA());

    // @ts-expect-error
    table_a.__move_to_superset_unchecked(0, table_ab);

    assert(!table_a.get_component(aid, 0))
    assert(!!table_ab.get_component(aid, 0))
})

test('table', () => {
    const components = new Components();

    const component_id = components.register_component(W);

    const columns = [component_id];

    const table = TableBuilder.with_capacity(0, columns.length)
        .add_column(components.get_info(component_id!)!)
        .build();

    const entities = iter(range(0, 200)).map(i => id(i)).collect()

    for (const entity of entities) {
        // @ts-expect-error
        const row = table.__allocate(entity);
        const value = new W(row);
        // @ts-expect-error
        table.get_column(component_id!)!.__initialize(row, value, new Tick(0))
    }

    assert(table.entity_capacity() === 256)
    assert(table.entity_count() === 200);
})