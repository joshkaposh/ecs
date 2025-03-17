import { assert, expect, test } from "vitest";
import { Access, AccessConflicts, AccessFilters, FilteredAccess, FilteredAccessSet } from 'ecs';
import { FixedBitSet } from "fixed-bit-set";

function create_sample_access() {
    const access = new Access();
    access.add_component_read(1);
    access.add_component_read(2);
    access.add_component_write(3);
    access.add_archetypal(5);
    access.read_all();
    return access;
}

function create_sample_filtered_access() {
    const filtered_access = new FilteredAccess();

    filtered_access.add_component_write(1);
    filtered_access.add_component_read(2);
    filtered_access.__add_required(3);
    filtered_access.and_with(4);

    return filtered_access
}

function create_sample_access_filters() {
    const access_filters = new AccessFilters();

    access_filters.with.grow_insert(3);
    access_filters.without.grow_insert(5);

    return access_filters;
}

function create_sample_filtered_access_set() {
    const filtered_access_set = new FilteredAccessSet();

    filtered_access_set.__add_unfiltered_resource_read(2);
    filtered_access_set.__add_unfiltered_resource_write(4);

    return filtered_access_set;
}

test('access clone', () => {
    const original = create_sample_access();
    const cloned = original.clone();

    assert(original.eq(cloned))
})

test('access clone_from', () => {
    const original = create_sample_access();
    const cloned = new Access();

    cloned.add_component_write(7);
    cloned.add_component_read(4);
    cloned.add_archetypal(8);
    cloned.write_all();

    cloned.clone_from(original);

    assert(original.eq(cloned));
})

test('filtered_access clone', () => {
    const original = create_sample_filtered_access();
    const cloned = original.clone();
    expect(original).toEqual(cloned);
})

test('filtered_access clone_from', () => {
    const original = create_sample_filtered_access();
    const cloned = new FilteredAccess();

    cloned.add_component_write(7);
    cloned.add_component_read(4);

    cloned.append_or(new FilteredAccess());

    cloned.clone_from(original);

    assert(original.eq(cloned));
})

test('access_filters clone', () => {
    const original = create_sample_access_filters();
    const cloned = original.clone();

    assert(original.eq(cloned));
})

test('access_filters clone_from', () => {
    const original = create_sample_access_filters();
    const cloned = new AccessFilters();

    cloned.with.grow_insert(1);
    cloned.without.grow_insert(2);

    cloned.clone_from(original);

    assert(original.eq(cloned))
})

test('filtered_access_set clone', () => {
    const original = create_sample_filtered_access_set();
    const cloned = original.clone();

    assert(original.eq(cloned));
})


test('filtered_access_set clone_from', () => {
    const original = create_sample_filtered_access_set();
    const cloned = new FilteredAccessSet();

    cloned.__add_unfiltered_resource_read(7);
    cloned.__add_unfiltered_resource_write(9);
    cloned.write_all();

    cloned.clone_from(original);

    assert(original.eq(cloned));
})

test('read_all_access_conflicts', () => {
    // read_all / single write
    let access_a = new Access();
    access_a.add_component_write(0);

    let access_b = new Access();
    access_b.read_all();
    assert(!access_b.is_compatible(access_a));

    // read_all / read_all
    access_a = new Access();
    access_a.read_all();

    access_b = new Access();
    access_b.read_all();

    assert(access_b.is_compatible(access_a));
})

test('access_get_conflicts', () => {
    const access_a = new Access();
    access_a.add_component_read(0);
    access_a.add_component_read(1);

    const access_b = new Access();
    access_b.add_component_read(0);
    access_b.add_component_write(1);


    expect(access_a.get_conflicts(access_b)).toEqual(AccessConflicts.from([1]))

    const access_c = new Access();
    access_c.add_component_write(0);
    access_c.add_component_write(1);

    assert(access_a.get_conflicts(access_c).eq(AccessConflicts.from([0, 1])));
    assert(access_b.get_conflicts(access_c).eq(AccessConflicts.from([0, 1])));

    const access_d = new Access();
    access_d.add_component_read(0);

    assert(access_d.get_conflicts(access_a).eq(AccessConflicts.empty()));
    assert(access_d.get_conflicts(access_b).eq(AccessConflicts.empty()));
    assert(access_d.get_conflicts(access_c).eq(AccessConflicts.from([0])));
})

test('filtered_combined_access', () => {
    const access_a = new FilteredAccessSet();
    access_a.__add_unfiltered_resource_read(1);
    const filter_b = new FilteredAccess();
    filter_b.add_resource_write(1);

    const conflicts = access_a.get_conflicts_single(filter_b);
    assert(conflicts.eq(AccessConflicts.from([1])));
})

test('filtered_access_extend', () => {
    const access_a = new FilteredAccess();
    access_a.add_component_read(0)
    access_a.add_component_read(1)
    access_a.and_with(2)

    const access_b = new FilteredAccess();
    access_b.add_component_read(0);
    access_b.add_component_write(3);
    access_b.and_without(4);

    access_a.extend(access_b);

    const expected = new FilteredAccess();
    expected.add_component_read(0)
    expected.add_component_read(1)
    expected.and_with(2)
    expected.add_component_write(3);
    expected.and_without(4);

    assert(access_a.eq(expected))
})

test('filtered_access_extend_or', () => {
    const access_a = new FilteredAccess();

    access_a.add_component_write(0);
    access_a.add_component_write(1);

    const access_b = new FilteredAccess();
    access_b.and_with(2);

    const access_c = new FilteredAccess();
    access_c.and_with(3);
    access_c.and_without(4);

    access_b.append_or(access_c);

    access_a.extend(access_b);

    const expected = new FilteredAccess();
    expected.add_component_write(0)
    expected.add_component_write(1)
    expected.__filter_sets = [
        new AccessFilters(
            FixedBitSet.with_capacity_and_blocks(3, [0b111]),
            FixedBitSet.default(),
        ),
        new AccessFilters(
            FixedBitSet.with_capacity_and_blocks(4, [0b1011]),
            FixedBitSet.with_capacity_and_blocks(5, [0b10000])
        )
    ]

    assert(access_a.eq(expected))
})
