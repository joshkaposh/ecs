import { type Option, assert_eq } from "joshkaposh-option";

export function truncate(array: any[], len: number) {
    array.length = Math.min(array.length, len);
}

export function retain<T>(data: T[], f: (element: T) => boolean) {
    for (let i = data.length - 1; i >= 0; i--) {
        if (f(data[i])) {
            continue
        }
        data.splice(i, 1);
    }
}

export function split_at<T>(array: T[], index: number): Option<[T[], T[]]> {
    if (array.length > 0) {
        return [array.slice(0, index), array.slice(index, array.length)]
    }

    return
}

export function swap<T>(array: T[], from_index: number, to_index: number) {
    const temp = array[to_index];
    array[to_index] = array[from_index];
    array[from_index] = temp;
}

export function swap_remove<T>(array: T[], i: number): Option<T> {
    if (array.length > 0 && i !== array.length - 1) {
        swap(array, i, array.length - 1)
        return array.pop()
    } else {
        return array.pop();
    }
}

export function swap_remove_unchecked<T>(array: T[], i: number): Option<T> {
    swap(array, i, array.length - 1)
    return array.pop()

}

export function replace(array: any[], index: number, value: any) {
    assert_eq(index < array.length, true);
    array[index] = value;
}

// @ts-ignore;
export function reserve(array: any[], additional: number) {
    // unused(array, additional);
}

export function extend<T>(target: T[] | Set<T>, src: Iterable<T>, default_value?: Option<T>) {
    if (Array.isArray(target)) {
        extend_array(target, src as unknown as Iterable<T>, default_value)
    } else if (target instanceof Set) {
        extend_set(target, src as unknown as Iterable<T>, default_value);
    } else {
        console.warn('Cannot use a generic extend as it only works when target is an Array or Set. Try making your own implementation for extending your data structure.')
    }
}

export function extend_array<T>(target: T[], src: Iterable<T>, default_value?: Option<T>): void {
    if (default_value != null) {
        target.push(...Array.from(src, () => default_value))
    } else {
        target.push(...src)
    }
}


export function extend_set<T>(target: Set<T>, src: Iterable<T>, default_value?: Option<T>): void {
    for (const v of src) {
        target.add(default_value ?? v);
    }
}

export function extend_map<K, V>(target: Map<K, V>, src: Iterable<[K, V]>) {
    for (const [k, v] of src) {
        target.set(k, v);
    }
}

export function capacity(len: number): number {
    if (len < 4) {
        return 4
    }
    const cap = 1 << 31 - Math.clz32(len);
    if (cap <= len) {
        return cap << 1;
    }

    return cap
}