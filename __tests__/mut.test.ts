import { expect, test } from "vitest";

function as_mut<T>(value: T, setter: (new_value: T) => T) {
    function cow<T extends any>(new_value: T): T;
    function cow(): T;
    function cow() {
        if (arguments.length !== 0) {
            value = setter(arguments[0])
        }

        return value;
    }

    return cow
}
function mut_array_element<T>(array: T[], index: number) {
    return as_mut(array[index], (n) => array[index] = n
    )
}

// function cow(): false;
// function cow<T extends any>(value: T): true;
// function cow() {
//     return arguments.length !== 0
// }

test('mut', () => {
    const arr = [1, 2, 3, 4, 5];

    const m0 = mut_array_element(arr, 0);
    const m1 = mut_array_element(arr, 1);
    const m2 = mut_array_element(arr, 2);
    const m3 = mut_array_element(arr, 3);
    const m4 = mut_array_element(arr, 4);

    expect(m0()).toBe(1);
    expect(m1()).toBe(2);
    expect(m2()).toBe(3);
    expect(m3()).toBe(4);
    expect(m4()).toBe(5);

    m1(200);

    expect(m0()).toBe(1);
    expect(m1()).toBe(200);
    expect(m2()).toBe(3);
    expect(m3()).toBe(4);
    expect(m4()).toBe(5);

    // expect(cow()).toBe(false);
    // expect(cow(undefined)).toBe(true);
    // expect(cow(null)).toBe(true);
})