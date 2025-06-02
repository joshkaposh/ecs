import type { Primitive } from "joshkaposh-iterator";
import type { None, Option } from "joshkaposh-option";

export interface TypeId {
    readonly type_id: UUID;
}

export type Some<T> = T extends None ? never : T;

export type unit = typeof unit;
export const unit = Symbol('UNIT');

export type Class<Static extends {} = {}, Inst extends {} = {}> = (new (...args: any[]) => Inst) & Static

export type Instance<T> = T extends new (...args: any[]) => any ? InstanceType<T> : T;

export type NoReadonly<T> = {
    -readonly [K in keyof T]: T[K];
}

export type DeepMutOnly<T> = NoReadonly<{
    -readonly [K in keyof T]:
    // Is it a primitive? Then return it
    T[K] extends (number | string | symbol) ? T[K]
    // Is it an array of items? Then make the array mutable and the item as well
    : T[K] extends Array<infer A> ? Array<DeepMutOnly<A>>
    // It is some other object, make it mutable as well
    : DeepMutOnly<T[K]>;
}>

export type DeepReadonly<T> = Readonly<{
    [K in keyof T]:
    // Is it a primitive? Then make it readonly
    T[K] extends (number | string | symbol) ? Readonly<T[K]>
    // Is it an array of items? Then make the array readonly and the item as well
    : T[K] extends Array<infer A> ? Readonly<Array<DeepReadonly<A>>>
    // It is some other object, make it readonly as well
    : DeepReadonly<T[K]>;
}>

export function all_tuples_iter_into_flattened<T, R>(tuples: Iterable<(T | T[])>, callback: (element: T) => R = (e: T) => e as unknown as R, flattened: R[] = []) {
    for (const maybeTuple of tuples) {
        if (Array.isArray(maybeTuple)) {
            all_tuples_into_flattened(maybeTuple, callback, flattened);
        } else {
            flattened.push(callback(maybeTuple));
        }
    }
    return flattened;
}

export function all_tuples_into_flattened<T, R>(tuples: (T | T[])[], callback: (element: T) => R = (e: T) => e as unknown as R, flattened: R[] = []) {
    for (let i = 0; i < tuples.length; i++) {
        const maybeTuple = tuples[i];
        if (Array.isArray(maybeTuple)) {
            all_tuples_into_flattened(maybeTuple, callback, flattened);
        } else {
            flattened.push(callback(maybeTuple));
        }
    }
    return flattened;
}

function recursively_flatten_tuples<T, T2, R>(tuples: (T | T[])[], callback: (element: T2) => R, flattened: R[] = []) {
    for (let i = 0; i < tuples.length; i++) {
        const maybeTuple = tuples[i];
        if (Array.isArray(maybeTuple)) {
            recursively_flatten_tuples(maybeTuple, callback, flattened);
        } else {
            flattened.push(callback(maybeTuple as unknown as T2));
        }
    }
    return flattened;
}

export function flatTuples<T>(tuples: (T | T[])[], callback: (tuple: T[]) => void = (e) => e) {
    for (let i = 0; i < tuples.length; i++) {
        recursively_flatten_tuples(tuples[i] as (T | T[])[], callback)
    }
}

export function toflatTuples<T, R>(tuples: (T | T[])[], callback: (tuple: T[]) => R = (e) => e as R) {
    const flattened = new Array(tuples.length);

    for (let i = 0; i < tuples.length; i++) {
        flattened[i] = recursively_flatten_tuples(tuples[i] as (T | T[])[], callback)
    }

    return flattened;
}

export function all_tuples_iter<T>(tuples: Iterable<(T | T[])>, callback: (element: T) => void = () => { }) {
    for (const maybeTuple of tuples) {
        if (Array.isArray(maybeTuple)) {
            all_tuples_into_flattened(maybeTuple, callback);
        } else {
            callback(maybeTuple)
        }
    }
}

/**
 * Applies `callback` to every element in the possibly nested array `tuples`.
 */
export function all_tuples<T, R>(tuples: (T | T[])[], callback: (element: T) => R = (e: T) => e as unknown as R) {
    for (let i = 0; i < tuples.length; i++) {
        const maybeTuple = tuples[i];
        if (Array.isArray(maybeTuple)) {
            all_tuples(maybeTuple, callback);
        } else {
            callback(maybeTuple);
        }
    }
}

export function is_primitive(value: unknown): value is Primitive {
    const ty = typeof value;
    return value == null || (ty === 'bigint' || ty === 'number' || ty === 'string' || ty === 'symbol' || ty === 'boolean')
}

export function is_class_ctor<T extends Class>(value: unknown): value is T {
    return typeof value === 'function' && value.prototype !== undefined;
}

export function is_class_instance<T extends Class>(ty: unknown): ty is InstanceType<T> {
    return ty?.constructor?.name !== 'Function' && ty?.constructor?.name !== 'Object'
}

export function type_id(type: Partial<TypeId> & { constructor: TypeId }) {
    return type.type_id ?? type.constructor.type_id;
}

export function is_class<T extends Class>(value: unknown): value is T {
    if (is_primitive(value)) {
        return false;
    }
    return is_class_ctor(value) || is_class_instance(value);
}

export function debug_assert(is_true: boolean, msg?: string) {
    // if (is_true) {
    //     let message = 'Assertion failed'
    //     if (msg) {
    //         message += `: ${msg}`;
    //     }
    //     throw new Error(message += msg ?? '')
    // }
    if (!is_true) {
        console.error('Debug Assert: ', msg);
    }
}

export function insert_set<T>(set: Set<T>, value: T): boolean {
    const has = set.has(value);
    const is_new_value = !has;
    if (is_new_value) {
        set.add(value);
    }
    return is_new_value;
}

// function string_index_of_chars(string: string, ...chars_to_search: string[]): number {
//     for (let i = 0; i < string.length; i++) {
//         if (chars_to_search.includes(string[i])) {
//             return i;
//         }
//     }
//     return -1;
// }

// export function ShortName(full_name: string) {
//     let index = 0;
//     const end_of_string = full_name.length;
//     let name = '';
//     while (index < end_of_string) {
//         const rest_of_string = full_name.slice(index, end_of_string);
//         const special_char_index = string_index_of_chars(rest_of_string,
//             ' ',
//             '<',
//             '>',
//             '(',
//             ')',
//             '[',
//             ']',
//             ',',
//             ';'
//         )
//         if (special_char_index !== -1) {
//             const segment_to_collapse = rest_of_string.slice(0, special_char_index);
//             const res = collapse_type_name(segment_to_collapse);
//             if (typeof res !== 'string') {
//                 throw new Error('collapse_type_name() did not return a string');
//             }
//             name += res;

//             const special_char = rest_of_string[special_char_index];
//             name += special_char;

//             if (special_char === '>'
//                 || special_char === ')'
//                 || special_char === ']'
//             ) {
//                 name += '::';
//                 index += special_char_index + 3;
//             } else {
//                 index += special_char_index + 1;
//             }
//         } else {
//             name += collapse_type_name(rest_of_string);
//             index = end_of_string;
//         }
//     }
//     return name;
// }

// function collapse_type_name(string: string) {
//     const segments = iter(string).rsplit('.');
//     const last = segments.next().value as string;
//     const _second_last = segments.next();
//     const second_last = !_second_last.done ? _second_last.value : last;

//     if (second_last.startsWith(second_last[0].toUpperCase())) {
//         const index = string.length - last.length - second_last.length - 2;
//         return string.slice(index);
//     } else {
//         return last;
//     }

// }


export function get_short_name(str: string) {
    return str;
}

/**
 * @description
 * `entry` takes three arguments: a `Map<K, V>, a key `K` and a optional closure returning a value if no key was found.
 * 
 * If no provided closure was passed, `entry` performs like a `Map::get(key)` call
@returns `V` in Map if one was found, or `V` from closure
*/
export function entry<K, V extends Some<{}>>(map: Map<K, V>, key: K): Option<V>
export function entry<K, V extends Some<{}>>(map: Map<K, V>, key: K, fn: () => V): V;
export function entry<K, V extends Some<{}>>(map: Map<K, V>, key: K, fn?: () => V): Option<V> {
    let value = map.get(key);
    // only insert if map doesn't have key and function exists.
    if (!map.has(key) && fn) {
        value = fn();
        map.set(key, value);
    }
    return value;
}