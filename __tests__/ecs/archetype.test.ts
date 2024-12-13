import { test, assert } from 'vitest'
import { range } from 'joshkaposh-iterator'
import { is_some, } from 'joshkaposh-option';
import { Archetype, Archetypes, define_component, Component, Components, StorageType, Storages, Entity } from '../../src/ecs'

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

    const arch_a_id = archetypes.__get_id_or_insert(components, table_id, columns, sparse_ids_ma);
    const arch_b_id = archetypes.__get_id_or_insert(components, table_id, columns, sparse_ids_mb);
    const arch_a = archetypes.get(arch_a_id)!;
    const arch_b = archetypes.get(arch_b_id)!;

    assert(is_some(arch_a_id) && arch_a_id === arch_a.id())
    assert(is_some(arch_b_id) && arch_b_id === arch_b.id())
});
