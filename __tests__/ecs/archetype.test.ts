import { test, assert } from 'vitest'
import { is_some, } from 'joshkaposh-option';
import { Archetype, Archetypes, Component, Components, StorageType, Storages, Entity } from 'ecs';
import { define_component, define_marker } from 'define';

const A = define_component(class A { constructor(public value = 'A') { } });
const B = define_component(class B { constructor(public value = 'B') { } });
const C = define_component(class C { constructor(public value = 'C') { } });

const MarkerA = define_marker()
const MarkerB = define_marker()

test('archetype', () => {
    const archetypes = new Archetypes();

    assert(is_some(archetypes.get(0)) === true)
    assert(is_some(archetypes.get(1)) === false)

    const components = new Components();
    const storages = new Storages();

    const a_id = components.register_component(A)
    const b_id = components.register_component(B)
    const c_id = components.register_component(C);

    const ma_id = components.register_component(MarkerA)
    const mb_id = components.register_component(MarkerB)

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

    const arch_a_id = archetypes.get_id_or_insert(table_id, columns, sparse_ids_ma);
    const arch_b_id = archetypes.get_id_or_insert(table_id, columns, sparse_ids_mb);
    const arch_a = archetypes.get(arch_a_id)!;
    const arch_b = archetypes.get(arch_b_id)!;

    assert(is_some(arch_a_id) && arch_a_id === arch_a.id())
    assert(is_some(arch_b_id) && arch_b_id === arch_b.id())
});
