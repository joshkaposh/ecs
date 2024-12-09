import { None, Option } from "joshkaposh-option";

export type Some<T> = T extends None ? never : T;

export type unit = typeof unit;
export const unit = Symbol('Unit');

type Hint = 'string' | 'number' | 'default';

export type DeepReadonly<T> = Readonly<{
    [K in keyof T]:
    // Is it a primitive? Then make it readonly
    T[K] extends (number | string | symbol) ? Readonly<T[K]>
    // Is it an array of items? Then make the array readonly and the item as well
    : T[K] extends Array<infer A> ? Readonly<Array<DeepReadonly<A>>>
    // It is some other object, make it readonly as well
    : DeepReadonly<T[K]>;
}>

export type Enum<T> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? ReturnType<T[P]> : T[P]
}[keyof T];

export type Trait<Required, Provided> = {
    required: Required
    provided: Provided;
};

export function eq<T>(a: T, b: T, hint: Hint = 'number') {
    if (hint === 'number') {
        return Number(a) === Number(b);
    } else if (hint === 'string') {
        return `${a}` === `${b}`;
    } else {
        return a === b;
    }
}

export function get_short_name(str: string) {
    return str;
}

export function writeln(str: string): string {
    return `\n${str}`
}

export function for_each_array(array: any[], fn: (array: any[]) => void) {
    for (let i = 0; i < array.length; i++) {
        const el = array[i];
        if (Array.isArray(el)) {
            for_each_array(el, fn)
        }
    }
    // fn(array);
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