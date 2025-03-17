import { iter } from "joshkaposh-iterator";
import { type EntityOld, hash_entity } from "./index";
import type { Option } from "joshkaposh-option";

export class EntityMap<V extends any> {
    #inner: Map<bigint, [EntityOld, V]>;


    constructor(iterable?: Iterable<[EntityOld, V]>) {
        const it = iter(iterable ?? [])
            .map(([e, v]) => [hash_entity(e), [e, v]] as [bigint, [EntityOld, V]])
            .collect();
        this.#inner = new Map(it)
    }

    /**
     * @returns the number of elements in the map.
     */
    get size() {
        return this.#inner.size;
    }

    inner() {
        return this.#inner
    }

    /**
     * @returns boolean indicating whether an element with the specified key exists or not.
     */
    has(key: EntityOld) {
        return this.#inner.has(hash_entity(key));
    }

    /**
     * Adds a new element with a specified `key` and `value` to the `Map`.
     * If an element with the same `key` already exists, the element will be overwritten with `value`.
     * 
     * If you wish to get the old `value` after inserting, use 'map.insert()'.
     */
    set(key: EntityOld, value: V) {
        this.#inner.set(hash_entity(key), [key, value]);
    }

    /**
    * @returns old value if one exists, otherwise undefined.
    * Adds a new element with a specified `key` and `value` to the `Map`.
    * If an element with the same `key` already exists, the element will be overwritten with `value`.
    * 
    * Use `map.set()` if you dont care about the old value, as it is faster.
    */
    insert(key: EntityOld, value: V): Option<V> {
        const hash = hash_entity(key);
        const bucket = this.#inner.get(hash);
        if (bucket) {
            const old = bucket[1];
            bucket[1] = value;
            return old;
        } else {
            this.#inner.set(hash, [key, value]);
            return
        }
    }

    get(key: EntityOld): Option<V> {
        const bucket = this.#inner.get(hash_entity(key));
        if (bucket) {
            return bucket[1]
        }
        return
    }

    /**
     * @returns true if an element in the EntityMap existed and has been removed, other return false.
     */
    delete(key: EntityOld) {
        return this.#inner.delete(hash_entity(key));
    }

    /**
     * @returns An iterator over all the keys in the EntityMap. 
     */
    keys() {
        return iter(this.#inner.values()).map(t => t[0]);
    }

    /**
     * @returns An iterator over all the values in the EntityMap.
     */
    values() {
        return iter(this.#inner.values()).map(t => t[1]);
    }

    /**
     * @returns An iterator over all the key, value pairs in the EntityMap.
     */
    entries() {
        return this.#inner.values();
    }
}