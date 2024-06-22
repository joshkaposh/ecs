import { test, assert } from 'vitest'
import { is_some, range } from 'joshkaposh-iterator'
import { Archetype, Archetypes, define_component, Component, Components, StorageType, Storages, Entity } from '../src/ecs'

class A { constructor(public value = 'A') { } }
define_component(A);
class B { constructor(public value = 'B') { } }
define_component(B);
class C { constructor(public value = 'C') { } }
define_component(C);

class MarkerA { }
define_component(MarkerA, StorageType.SparseSet);
class MarkerB { }
define_component(MarkerB, StorageType.SparseSet);

function alloc_entity(entity: Entity, archetype: Archetype, components: Components, storages: Storages) {
    const table = storages.tables.get(archetype.table_id())!;
    const row = table.__allocate(entity);
    // archetype is needed for querying
    archetype.__allocate(entity, row);


    for (const id of archetype.components()) {

        const type = components.get_info(id)!.type();
        const value = new type();
        if (archetype.get_storage_type(id) === StorageType.Table) {
            assert(is_some(table.get_column(id)))
            table.get_column(id)!.__initialize(row, value);
        } else {
            const sparse_set = storages.sparse_sets.get(id)!
            sparse_set.__insert(entity, value);
        }
    }
}

function query_entity(entity: Entity, archetype: Archetype, components: Components, storages: Storages) {
    // return archetype.enti
}

test('archetype', () => {
    const archetypes = new Archetypes();

    assert(is_some(archetypes.get(0)) === true)
    assert(is_some(archetypes.get(1)) === false)

    const components = Components.default();
    const storages = Storages.default();

    const a_id = components.init_component(A as Component, storages)
    const b_id = components.init_component(B as Component, storages)
    const c_id = components.init_component(C as Component, storages);

    const ma_id = components.init_component(MarkerA as Component, storages)
    const mb_id = components.init_component(MarkerB as Component, storages)

    assert(a_id === 0)
    assert(mb_id === 4)

    assert(components.get_info(a_id!)?.descriptor.storage_type === StorageType.Table)
    assert(components.get_info(b_id!)?.descriptor.storage_type === StorageType.Table)
    assert(components.get_info(c_id!)?.descriptor.storage_type === StorageType.Table)

    assert(components.get_info(ma_id!)?.descriptor.storage_type === StorageType.SparseSet)
    assert(components.get_info(mb_id!)?.descriptor.storage_type === StorageType.SparseSet)

    const columns = [a_id!, b_id!, c_id!];

    const sparse_ids_ma = [ma_id!];
    const sparse_ids_mb = [mb_id!];

    const table_id = storages.tables.__get_id_or_insert(columns, components)

    const sparse_set_ma = storages.sparse_sets.__get_or_insert(components.get_info(ma_id!)!)
    const sparse_set_mb = storages.sparse_sets.__get_or_insert(components.get_info(mb_id!)!)

    assert(is_some(sparse_set_ma))
    assert(is_some(sparse_set_mb))

    const arch_a_id = archetypes.__get_id_or_insert(table_id, columns, sparse_ids_ma);
    const arch_b_id = archetypes.__get_id_or_insert(table_id, columns, sparse_ids_mb);
    const arch_a = archetypes.get(arch_a_id)!;
    const arch_b = archetypes.get(arch_b_id)!;

    assert(is_some(arch_a_id) && arch_a_id === arch_a.id())
    assert(is_some(arch_b_id) && arch_b_id === arch_b.id())

    const table_components_a = arch_a.table_components();
    const sparse_components_a = arch_a.sparse_set_components();

    // table_components_a.for_each(id => console.log(components.get_name(id)))
    // sparse_components_a.for_each(id => console.log(components.get_name(id)))

    const ma_entities = range(0, 100).map(i => Entity.from_raw(i)).collect();
    const mb_entities = range(100, 200).map(i => Entity.from_raw(i)).collect();

    //! alloc_entity creates class and inserts it into Table / SparseSet
    ma_entities.forEach(entity => alloc_entity(entity, arch_a, components, storages))
    mb_entities.forEach(entity => alloc_entity(entity, arch_b, components, storages))

    assert(arch_a.entities().length === 100)
    assert(arch_b.entities().length === 100)

});
