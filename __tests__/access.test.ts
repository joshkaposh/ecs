import { assert, expect, test } from "vitest";
import { Access, AccessConflicts, } from '../src/ecs/query/access';

test('read_all_access_conflicts', () => {
    // read_all / single write
    let access_a = Access.default();
    access_a.add_component_write(0);

    let access_b = Access.default();
    access_b.read_all();
    assert(!access_b.is_compatible(access_a));

    // read_all / read_all
    access_a = Access.default();
    access_a.read_all();

    access_b = Access.default();
    access_b.read_all();

    // assert(access_b.is_compatible(access_a));
})

test('access_get_conflicts', () => {
    const access_a = Access.default();
    access_a.add_component_read(0);
    access_a.add_component_read(1);

    const access_b = Access.default();
    access_b.add_component_read(0);
    access_b.add_component_write(1);

})

// test('filtered_combined_access', () => {
//     const access_a = FilteredAccessSet.default();
//     access_a.__add_unfiltered_read(1);
//     const filter_b = FilteredAccess.default();
//     filter_b.add_write(1);

//     const conflicts = access_a.get_conflicts_single(filter_b);
//     expect(conflicts).toEqual([1])
// })

// test('filtered_access_extend', () => {
//     const access_a = FilteredAccess.default();
//     access_a.add_read(0)
//     access_a.add_read(1)
//     access_a.and_with(2)

//     const access_b = FilteredAccess.default();
//     access_a.add_read(0);
//     access_a.add_write(3);
//     access_a.and_without(4);

//     access_a.extend(access_b);

//     const expected = FilteredAccess.default();
//     expected.add_read(0)
//     expected.add_read(1)
//     expected.and_with(2)
//     expected.add_write(3);
//     expected.and_without(4);

//     assert(access_a.eq(expected))
// })

// // test('filtered_access_extend_or', () => {
// //     const access_a = FilteredAccess.default();
// //     access_a.add_write(0);
// //     access_a.add_write(1);

// //     const access_b = FilteredAccess.default();
// //     access_b.and_with(2);

// //     const access_c = FilteredAccess.default();
// //     access_c.and_with(3);
// //     access_c.and_without(4);

// //     access_b.append_or(access_c);

// //     access_a.extend(access_b);

// //     const expected = FilteredAccess.default();
// //     expected.add_write(0)
// //     expected.add_write(1)
// //     expected.__filter_sets = [
// //         new AccessFilters(
// //             FixedBitSet.with_capacity_and_blocks(3, [0b111]),
// //             FixedBitSet.default(),
// //         ),
// //         new AccessFilters(
// //             FixedBitSet.with_capacity_and_blocks(4, [0b1011]),
// //             FixedBitSet.with_capacity_and_blocks(5, [0b10000])
// //         )
// //     ]

// //     assert(access_a.eq(expected))
// // })
