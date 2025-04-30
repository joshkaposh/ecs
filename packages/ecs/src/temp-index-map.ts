import { type DoubleEndedIterator, type ExactSizeDoubleEndedIterator, type IterInputType, type Iterator, iter } from "joshkaposh-iterator";
import type { Option } from "joshkaposh-option";



function oob(index: number, bounds: number) {
    return index < 0 || index >= bounds
}

/**
 * @description
 * Performs a swap operation on an array, given a `from_index` and `to_index`.
 * 
 * `swap` does nothing if either `index` is >= `array.length`.
 * @example
 * const array = [1, 2, 3, 4];
 * swap(0, 2) // [4, 2, 3, 1];
 */
export function swap<T>(array: T[], from_index: number, to_index: number) {
    const temp = array[to_index];
    array[to_index] = array[from_index];
    array[from_index] = temp;
}

export type Orderable<T> = T extends Ord ? T : never

export type Ord = (string | boolean | number | null | undefined | {
    [Symbol.toPrimitive](): string;
}) & {}

export type Bucket<T> = [number, T];
export type Entry<K, V> = [number, K, V];

export type Hasher<K1, K2> = (key: K1) => K2
export type DefaultHasher<K extends Ord> = Hasher<K, K>;

const INDEX = 0;
const BUCKET_VALUE = 1;
const ENTRY_KEY = 1;
const ENTRY_VALUE = 2;

function defaultHasher<T>(key: T) {
    return key;
}

export class IndexMap<K extends Ord, V, S extends Hasher<K, any> = DefaultHasher<K>> {
    #map: Map<ReturnType<S>, Bucket<V>>;
    #indices: K[];
    #hash: S;

    constructor(map?: IterInputType<readonly [K, V]>)
    constructor(map?: Map<K, Bucket<V>>, indices?: K[])
    constructor(map: Map<K, Bucket<V>>, indices: K[], hasher: Hasher<K, Ord>)
    constructor(map: Map<K, Bucket<V>> | IterInputType<readonly [K, V]> = new Map(), indices: K[] = [], hasher: S = defaultHasher as S) {
        if (map instanceof Map) {
            this.#map = map as Map<ReturnType<S>, Bucket<V>>;
            this.#indices = indices;
        } else {
            const entries = iter(map).enumerate().map(([i, [k, v]]) => [k, [i, v]] as [K, Bucket<V>]).collect();
            const keys = iter(entries).map(([k]) => k).collect() as K[]
            this.#map = new Map(entries) as Map<ReturnType<S>, Bucket<V>>
            this.#indices = keys
        }
        this.#hash = hasher;
    }

    static withCapacity<K extends Ord, V>(capacity: number): IndexMap<K, V, DefaultHasher<K>> {
        return new IndexMap<K, V, DefaultHasher<K>>(new Map(), new Array(capacity))
    }

    static withHasher<K extends Ord, V, S extends Hasher<K, Ord> = Hasher<K, Ord>>(hasher: S): IndexMap<K, V, S> {
        return new IndexMap(new Map(), [], hasher);
    }

    static withCapacityAndHasher<K extends Ord, V, S extends Hasher<K, Ord>>(capacity: number, hasher: S): IndexMap<K, V, S> {
        const m = IndexMap.withCapacity<K, V>(capacity) as unknown as IndexMap<K, V, S>;
        m.#hash = hasher;
        return m
    }

    static from<K extends Ord, V, S extends Hasher<K, any> = DefaultHasher<K>>(iterable: IterInputType<[K, V]>, hasher: S = defaultHasher as S): IndexMap<K, V, S> {
        const entries = iter(iterable)
            .enumerate()
            // @ts-expect-error
            .map(([i, [k, v]]) => [hasher(k), [i, v]] as [K, Bucket<V>])
            .collect();
        const indices = iter(iterable)
            .map(([k]) => k)
            .collect() as K[]
        return new IndexMap(new Map(entries), indices);
    }

    clone(): IndexMap<K, V, S> {
        return new IndexMap(
            new Map(Array.from(this.#map.entries())),
            this.#indices.map(key => key),
            this.#hash
        )
    }

    cloneFrom(src: IndexMap<K, V, S>) {

        const src_indices = src.#indices,
            src_map = src.#map,
            map = this.#map,
            indices = new Array(src.size);

        map.clear();
        for (let i = 0; i < src_indices.length; i++) {
            const key = src_indices[i];
            indices[i] = key;
            const hashed_key = this.#hash(key);
            map.set(hashed_key, src_map.get(hashed_key)!);
        }
        this.#indices = indices;
    }


    get hasher() {
        return this.#hash;
    }

    innerKeys() {
        return this.#indices;
    }

    innerMap() {
        return this.#map;
    }

    keys(): ExactSizeDoubleEndedIterator<K> {
        return iter(this.#indices);
    }

    values(): DoubleEndedIterator<V> {
        return this.iter().map(([_, v]) => v);
    }

    entries(): DoubleEndedIterator<[K, V]> {
        console.log('IndexMap.entries(): ', this.hasher, this.#indices, Array.from(this.#map.entries()));

        return iter(this.#indices).map(
            (k) => [k, this.#map.get(this.#hash(k))![BUCKET_VALUE]]
        )
    }

    toArray(): [K, V][] {
        return this.entries().collect();
    }

    iter(): DoubleEndedIterator<[K, V]> {
        return this.entries();
    }

    clear(): void {
        this.#map.clear();
        this.#indices.length = 0;
    }

    has(key: K): boolean {
        return this.#map.has(this.#hash(key));
    }

    // drain(start: number, end: number): Drain<K, V> {
    //     return new Drain(start, end, this);
    // }

    first(): Option<V> {
        return this.#indices.length === 0 ?
            undefined :
            this.#map.get(this.#hash(this.#indices[0]))![BUCKET_VALUE];
    }

    get(key: K): Option<V> {
        const bucket = this.#map.get(this.#hash(key));
        return bucket ? bucket[BUCKET_VALUE] : undefined;
    }

    getFull(key: K): Option<Entry<K, V>> {
        const v = this.#map.get(this.#hash(key));
        if (!v) {
            return
        }
        const [index, value] = v;
        return [index, key, value];
    }

    getIndex(index: number): Option<V> {
        return oob(index, this.#map.size) ? undefined : this.#map.get(this.#hash(this.#indices[index]))![BUCKET_VALUE]!
    }

    /**
     * @returns the key-value pair found at the given index, if one was found.
     */
    getIndexEntry(index: number): Option<[K, V]> {
        if (oob(index, this.#map.size)) {
            return
        }

        const key = this.#indices[index];
        return [
            key,
            this.#map.get(this.#hash(key))![BUCKET_VALUE]
        ];
    }

    /**
     * @returns the index of the key if one is present.
     */
    indexOf(key: K): Option<number> {
        // console.log('indexOf: ', this.#hash, key, this.#hash(key), Array.from(this.#map.keys()));

        const bucket = this.#map.get(this.#hash(key));
        if (!bucket) {
        }
        return bucket ? bucket[INDEX] : undefined;
    }

    /**
     * @returns the key-value pair if one was found
     */
    getKeyValue(key: K): Option<[K, V]> {
        const bucket = this.#map.get(this.#hash(key));
        return bucket ? [key, bucket[BUCKET_VALUE]] : undefined;
    }

    /**
     * @returns an Iterator over V in the given range.
     */
    getRange(start = 0, end = this.#map.size): Iterator<V> {
        return this.values()
            .skip(start)
            .take(end - start);
    }

    /**
     * Inserts the key-value pair into the Map and returns the old value is one was present.
     * @returns the old value if one was present.
     */
    set(key: K, value: V): Option<V> {
        const hashed_key = this.#hash(key);
        const bucket = this.#map.get(hashed_key);
        if (bucket) {
            const old_val = bucket[BUCKET_VALUE]
            bucket[BUCKET_VALUE] = value
            return old_val;
        }
        const idx = this.#map.size;
        this.#map.set(hashed_key, [idx, value]);
        this.#indices[idx] = key;
        return undefined;
    }

    /**
     * Inserts the key-value pair.
     * @returns the previous index-value if one was present,
     *  or the current index-value pair if a new insert.
     */
    setFull(key: K, value: V): [number, Option<V>] {
        const hashed_key = this.#hash(key);
        const bucket = this.#map.get(hashed_key);

        if (bucket) {
            const old_val = bucket[BUCKET_VALUE];
            bucket[BUCKET_VALUE] = value;
            return [bucket[INDEX], old_val];
        }
        const idx = this.#map.size
        this.#map.set(hashed_key, [idx, value]);
        this.#indices[idx] = key;
        return [idx, value];
    }

    // /**
    //  * Insert a key-value pair in the map at its ordered position among sorted keys.
    //  * This is equivalent to finding the position with binary_search_keys, then either updating it or calling shift_insert for a new key.
    //  * 
    //  * If the sorted key is found in the map, its corresponding value is updated with value, and the older value is returned inside `[index, oldValue]`. Otherwise, the new key-value pair is inserted at the sorted position, and `[index, null]` is returned.
    //  * 
    //  * If the existing keys are not already sorted, then the insertion index is unspecified (like binary_search), but the key-value pair is moved to or inserted at that position regardless.
    //  * 
    //  * Computes in `O(n)` time (average). Instead of repeating calls to insert_sorted, it may be faster to call batched insert or extend and only call sort_keys or sort_unstable_keys once.
    //  */
    // insert_sorted(key: K, value: V): [number, Option<V>] {
    //     return TODO('IndexMap::insert_sorted()', key, value);
    // }

    get isEmpty(): boolean {
        return this.#map.size === 0;
    }

    isSorted(): boolean {
        let calls = 0;
        this.sort((a, _, b) => {
            if (a > b) {
                calls++;
                return 0
            } else if (a === b) {
                return 0
            } else {
                return 0;
            }
        })
        return calls === 0
    }

    last(): Option<V> {
        const last_index = this.#map.size - 1;
        return last_index >= 0 ? this.getIndex(last_index) : undefined;
    }

    get size(): number {
        return this.#map.size;
    }

    moveIndex(from: number, to: number) {
        if (from < to) {
            if (from + 1 === to) {
                this.swapIndices(from, to)
                return
            }
            this.#shiftUp(from, to)
        } else {
            if (from - 1 === to) {
                this.swapIndices(from, to);
                return;
            }
            this.#shiftDown(from, to)
        }
    }

    pop(): Option<V> {
        return this.#indices.length > 0 ?
            this.delete(this.#indices[this.#indices.length - 1])
            : undefined
    }

    popFull(): Option<Entry<K, V>> {
        const index = this.#map.size - 1;
        if (index > 0) {
            const full = this.getFull(this.#indices[index])!
            this.#map.delete(this.#hash(full[ENTRY_KEY]));
            this.#indices.pop();
            return full;
        }
        return undefined
    }

    retain(keep: (key: K, value: V) => boolean) {
        // keep only the elements this closure returns true for
        const entries = this.iter().rev();
        entries.rev().for_each(([k, v]) => {
            if (!keep(k, v)) {
                this.delete(k);
            }
        })
    }

    reverse() {
        this.#indices.reverse();
        this.#syncIndices()
    }

    toReversed() {
        const reversed_indices = this.#indices.toReversed();
        const map = this.#map;
        const reversed_map = new Map(Array.from(reversed_indices, (key, i) => {
            const hashed_key = this.#hash(key as Orderable<K>);
            return [hashed_key, [i, map.get(hashed_key)![1]] as Bucket<V>];
        }))
        return new IndexMap(reversed_map, reversed_indices, this.#hash)
    }

    /**
     * Similar to array.shift().
     * shift() pops the key-value pair at the front of the map
     * and returns V or nothing if the map is empty
     */
    shift(): Option<V> {
        return this.#map.size > 0 ?
            this.delete(this.#indices[0]) :
            undefined
    }

    shiftEntry(): Option<[K, V]> {
        return this.#map.size > 0 ?
            this.deleteEntry(this.#indices[0]) : undefined;
    }

    shiftInsert(index: number, key: K, value: V): Option<V> {
        if (index > this.#map.size) {
            throw new RangeError(`index ${index} cannot exceed length ${this.#map.size}`)
        }

        const entry = this.getFull(key);
        if (entry) {
            const oldval = entry[ENTRY_VALUE];
            entry[ENTRY_VALUE] = value;
            this.moveIndex(entry[INDEX], index);
            return oldval;
        } else {
            this.#indices.splice(index, 0, key);
            key = this.#hash(key);
            this.#map.set(key as ReturnType<S>, [index, value]);
            this.#syncIndices(index);
            return undefined;
        }
    }

    shiftInsertEntry(index: number, key: K, value: V): Option<[K, V]> {
        const v = this.shiftInsert(index, key, value);
        return v === undefined ? undefined : [key, v as V];
    }

    delete(key: K): Option<V> {
        const hashed_key = this.#hash(key);
        const bucket = this.#map.get(hashed_key);
        if (!bucket) {
            return
        }

        return this.#shiftRemoveFullUnchecked(
            bucket[INDEX],
            hashed_key,
            bucket[BUCKET_VALUE]
        )[ENTRY_VALUE];
    }

    deleteEntry(key: K): Option<[K, V]> {
        const hashed_key = this.#hash(key);
        const item = this.#map.get(hashed_key);
        if (!item) {
            return undefined
        }
        const [i, v] = item;
        this.#shiftRemoveFullUnchecked(i, hashed_key, v);
        return [key, v];
    }

    deleteFull(key: K): Option<Entry<K, V>> {
        const hashed_key = this.#hash(key);
        const bucket = this.#map.get(hashed_key)
        if (!bucket) {
            return
        }
        const [index, value] = bucket;
        return this.#shiftRemoveFullUnchecked(index, hashed_key, value);
    }

    deleteIndex(index: number): Option<V> {
        const k = this.#indices[index];
        const hashed_key = this.#hash(k);
        if (k == null) {
            return
        }
        const [_, value] = this.#map.get(hashed_key)!
        return this.#shiftRemoveFullUnchecked(index, hashed_key, value)[ENTRY_VALUE];
    }

    sort(cmp?: (k1: K, v1: V, k2: K, v2: V) => -1 | 0 | 1) {
        const compare = cmp ? (a: K, b: K) => cmp(a, this.get(a)!, b, this.get(b)!) : (a: K, b: K) => {
            if (a < b) {
                return -1
            } else if (a > b) {
                return 1;
            } else {
                return 0
            }
        }

        this.#indices.sort(compare);
        this.#syncIndices();
    }

    toSorted(cmp?: (k1: K, v1: V, k2: K, v2: V) => -1 | 0 | 1) {
        const indices = this.#indices.toSorted(cmp ? (a: K, b: K) => cmp(a, this.get(a)!, b, this.get(b)!) : (a: K, b: K) => {
            if (a < b) {
                return -1
            } else if (a > b) {
                return 1;
            } else {
                return 0
            }
        });

        const map = new Map(Array.from(indices, (i, key) => {
            const hashed_key = this.#hash(key as Orderable<K>);
            return [hashed_key, [i, this.#map.get(hashed_key)![1]]] as [K, Bucket<V>];
        }))

        return new IndexMap(map, indices, this.#hash)
    }

    // splice(from: number, to: number, replace_with: IterInputType<[K, V]>): Splice<K, V> {
    //     return new Splice(this.#map, this.#indices, from, to, iter(replace_with).map(([k, v]) => [this.#hash(k), v]))
    // }

    splitOff(at: number): IndexMap<K, V, S> {
        if (at > this.#map.size || at < 0) {
            throw new RangeError(`IndexMap::splitOff() index ${at} cannot be > ${this.#map.size} and < 0`)
        }

        const indices = this.#indices.slice(at);
        const entries = Array.from(indices, (k, i) => {
            const hashed_key = this.#hash(k);
            const v = this.#map.get(hashed_key)![BUCKET_VALUE];
            return [hashed_key, [i, v]] as [K, Bucket<V>]
        })
        this.truncate(at);

        return new IndexMap<K, V, S>(new Map(entries), indices, this.#hash);
    }

    swapIndices(from: number, to: number) {
        const max = this.#map.size - 1
        if (from > max || to > max || from < 0 || to < 0) {
            return
        }
        // swap indices
        swap(this.#indices, from, to);
        // swap inner values
        const vfrom = this.#map.get(this.#hash(this.#indices[from]))!;
        const vto = this.#map.get(this.#hash(this.#indices[to]))!;

        const temp = vfrom[INDEX];
        vfrom[INDEX] = vto[INDEX];
        vto[INDEX] = temp;
    }

    swapRemove(key: K): Option<V> {
        const full = this.swapRemoveFull(key);
        return full ? full[ENTRY_VALUE] : undefined;
    }

    swapRemoveEntry(key: K): Option<[K, V]> {
        const full = this.swapRemoveFull(key);
        return full ? [full[ENTRY_KEY], full[ENTRY_VALUE]] : undefined;
    }

    swapRemoveFull(key: K): Option<Entry<K, V>> {
        const entry = this.getFull(key);
        if (!entry) {
            return
        }

        const [index] = entry;
        // remove from indices / map
        this.swapIndices(index, this.#map.size - 1);
        const v = this.pop()!;
        return [index, key, v];

    }

    swapRemoveIndex(index: number): Option<V> {
        if (this.#indices.length === 0 || index < 0 || index >= this.#indices.length) {
            return
        }
        const k = this.#indices[index];
        return this.swapRemove(k);
    }

    truncate(new_len: number) {
        if (new_len >= this.#indices.length) {
            return
        }

        while (this.#indices.length > new_len) {
            this.pop();
        }
    }

    #removeAndShiftIndices(index: number) {
        if (index === this.#map.size) {
            return
        }
        let idx = -1;
        for (const bucket of this.#map.values()) {
            idx++;
            if (idx < index) {
                continue
            }
            bucket[INDEX] -= 1;
        }
    }

    #shiftRemoveFullUnchecked(index: number, hash: ReturnType<S>, value: V): Entry<K, V> {
        this.#map.delete(hash);
        hash = this.#indices.splice(index, 1)[INDEX] as ReturnType<S>;
        this.#removeAndShiftIndices(index);
        return [index, hash, value];
    }

    #shiftUp(from: number, to: number) {
        for (let i = from; i < to; i++) {
            this.swapIndices(i, i + 1);
        }
    }

    #shiftDown(from: number, to: number) {
        for (let i = from - 1; i >= to; i--) {
            this.swapIndices(i + 1, i);
        }
    }

    #syncIndices(from = 0, to = this.#map.size) {
        for (let i = from; i < to; i++) {
            const tuple = this.#map.get(this.#hash(this.#indices[i]))!;
            tuple[INDEX] = i;
        }
    }

    [Symbol.iterator](): Iterator<[K, V]> {
        return this.iter();
    }
}