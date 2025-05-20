import { SparseSet } from "..";
import { Instance } from "../../util";

export class ObjectStore<T> {
    #ctor: () => Instance<T>;
    #sparse: SparseSet<Instance<T>>;
    #free_index: number;

    constructor(ctor: () => Instance<T>) {
        this.#sparse = new SparseSet();
        this.#ctor = ctor;
        this.#free_index = 0;
    }

    get() {
        this.#sparse.getOrSetWith(this.#free_index, this.#ctor)
        return this.#sparse.get(this.#free_index);
    }
}