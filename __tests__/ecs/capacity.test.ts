import { assert, expect, test } from "vitest";
import { capacity, extend, extend_map } from "ecs/src/array-helpers";
import { push } from "ecs";
import { range } from "joshkaposh-iterator";

test('capacity', () => {
    const arr = [];
    assert(cap(arr) === 0);
    arr.length = 1;
    assert(cap(arr) === 4);
    arr.length = 5;
    assert(cap(arr) === 8);
    arr.length = 9;
    assert(cap(arr) === 16);
    arr.length = 200;
    assert(cap(arr) === 256);

    function cap(arr: any[]) {
        return capacity(arr.length)
    }

})

test('extend', () => {
    const expected_ext_array_set = [1, 2, 3, 4, 5, 6];
    const expected_ext_map = [
        ['k1', 'v1'],
        ['k2', 'v2'],
        ['k3', 'v3'],
        ['k4', 'v4'],
        ['k5', 'v5'],
        ['k6', 'v6'],
    ];

    const src_array = [1, 2, 3];
    const src_set = new Set([1, 2, 3]);
    const src_map = new Map([
        ['k1', 'v1'],
        ['k2', 'v2'],
        ['k3', 'v3'],
    ]);

    extend(src_array, [4, 5, 6]);
    extend(src_set, [4, 5, 6]);
    extend_map(src_map, [
        ['k4', 'v4'],
        ['k5', 'v5'],
        ['k6', 'v6'],
    ]);

    expect(src_array).toEqual(expected_ext_array_set);
    expect(Array.from(src_set)).toEqual(expected_ext_array_set);
    expect(Array.from(src_map)).toEqual(expected_ext_map);
})

// test('push', () => {
//     let array = new Uint32Array();

//     for (let i = 0; i < 10; i++) {
//         array = push(array, i + 1);
//     }

//     console.log('push', array);


//     expect(array).toEqual(Uint32Array.from(range(1, 11).collect()));

// })