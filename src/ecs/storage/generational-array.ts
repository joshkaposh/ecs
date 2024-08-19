import { DoubleEndedIterator, iter } from "joshkaposh-iterator";
import type { Option } from "joshkaposh-option";
export type GenKey = {
    readonly index: number,
    generation: number
}

export type Occupied<T = {}> = {
    Occupied: { value: T }
}
export type Free = {
    Free: { next_free: number };
}
export type GenNodeEnum<T = {}> = Free | Occupied<T>;

export type GenNode<T> = {
    node: GenNodeEnum<T>
    generation: number;
}

export type GenArray<T> = Array<GenNode<T>>

export class GenerationalArray<T> {
    #data: GenArray<T>;
    #free_head: number;
    #len: number;
    constructor() {
        this.#data = new Array();
        this.#free_head = 0;
        this.#len = 0;
    }

    insert(value: T): GenKey {
        let _node = this.#data[this.#free_head]
        let key!: GenKey;
        if (_node) {
            // Update
            if ("Free" in _node.node) {
                const { next_free } = _node.node.Free
                key = { index: this.#free_head, generation: _node.generation };
                this.#free_head = next_free;
                _node.node = { Occupied: { value } }
                return key
            } else {
                // We have found an occupied entry, what?!
                throw new Error("corrupt free list");
            }
        } else {
            // Insert
            let generation = 0;
            let key = { index: this.#data.length, generation };
            let gen_node = {
                node: { Occupied: { value } },
                generation
            };
            this.#data.push(gen_node);
            this.#len = this.#len + 1;
            this.#free_head = key.index + 1;
            return key
        };
    }

    get(key: GenKey): Option<T> {
        let { node, generation } = this.#data[key.index];

        if ('Occupied' in node && generation === key.generation) {
            return node.Occupied.value;
        }
        return null;

    }

    remove(key: GenKey) {
        const _node = this.#data[key.index];
        if ('Occupied' in _node.node) {
            if (_node.generation != key.generation) {
                // Trying to remove an older generation
                return
            }

            _node.generation += 1;
            _node.node = {
                Free: { next_free: this.#free_head }
            };
            this.#free_head = key.index;
            this.#len = this.#len - 1;
        } else {
            // If we get there it mean's that the user is trying to remove an already
            // removed key, just do nothing.
        }
    }

    len(): number {
        return this.#len;
    }

    iter(): DoubleEndedIterator<GenNode<T> & { node: Occupied<T> }> {
        // @ts-expect-error
        return iter(this.#data).filter(n => 'Occupied' in n.node)
    }
}