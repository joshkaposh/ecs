import { test, assert } from 'vitest'
import { is_some, } from 'joshkaposh-option';
import { Archetypes, Components, StorageType, Storages } from 'ecs';
import { defineComponent, defineMarker } from 'define';

const A = defineComponent(class A { constructor(public value = 'A') { } });
const B = defineComponent(class B { constructor(public value = 'B') { } });
const C = defineComponent(class C { constructor(public value = 'C') { } });

const MarkerA = defineMarker()
const MarkerB = defineMarker()

test('archetype', () => {
    const archetypes = new Archetypes();

    assert(is_some(archetypes.get(0)) === true)
    assert(is_some(archetypes.get(1)) === false)

    const components = new Components();
    const storages = new Storages();

    const a_id = components.registerComponent(A)
    const b_id = components.registerComponent(B)
    const c_id = components.registerComponent(C);

    const ma_id = components.registerComponent(MarkerA)
    const mb_id = components.registerComponent(MarkerB)

    assert(a_id === 0)
    assert(mb_id === 4)

    assert(components.getInfo(a_id!)?.descriptor.storage_type === StorageType.Table)
    assert(components.getInfo(b_id!)?.descriptor.storage_type === StorageType.Table)
    assert(components.getInfo(c_id!)?.descriptor.storage_type === StorageType.Table)

    assert(components.getInfo(ma_id!)?.descriptor.storage_type === StorageType.SparseSet)
    assert(components.getInfo(mb_id!)?.descriptor.storage_type === StorageType.SparseSet)

    const columns = [a_id!, b_id!, c_id!];

    const sparse_ids_ma = [ma_id!];
    const sparse_ids_mb = [mb_id!];

    const table_id = storages.tables.__getIdOrSet(columns, components)

    const sparse_set_ma = storages.sparse_sets.__getOrSet(components.getInfo(ma_id!)!)
    const sparse_set_mb = storages.sparse_sets.__getOrSet(components.getInfo(mb_id!)!)

    assert(sparse_set_ma != null)
    assert(sparse_set_mb != null)

    const arch_a_id = archetypes.getIdOrSet(table_id, columns, sparse_ids_ma);
    const arch_b_id = archetypes.getIdOrSet(table_id, columns, sparse_ids_mb);
    const arch_a = archetypes.get(arch_a_id)!;
    const arch_b = archetypes.get(arch_b_id)!;

    assert(arch_a_id != null && arch_a_id === arch_a.id)
    assert(arch_b_id != null && arch_b_id === arch_b.id)
});
