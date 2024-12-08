import { World } from "..";

export type Command = {
    apply(world: World): void;
}

export class CommandQueue {
    #bytes: any[]; // u8[]
    #cursor: number;
    #panic_recovery: any[]; // u8[]

    constructor(bytes: any[], cursor: number, panic_recovery: any[]) {
        this.#bytes = bytes;
        this.#cursor = cursor;
        this.#panic_recovery = panic_recovery;
    }

    clone() {
        const cloned_bytes = new Array(this.#bytes.length);
        const cloned_panic_recovery = new Array(this.#panic_recovery.length);

        for (let i = 0; i < this.#bytes.length; i++) {
            const b = this.#bytes[i];
            if (b?.clone) {
                cloned_bytes[i] = b.clone();
            } else {
                cloned_bytes[i] = structuredClone(b);
            }
        }

        for (let i = 0; i < this.#panic_recovery.length; i++) {
            const p = this.#panic_recovery[i];
            if (p?.clone) {
                cloned_panic_recovery[i] = p.clone();
            } else {
                cloned_panic_recovery[i] = structuredClone(p);
            }
        }

        return new CommandQueue(cloned_bytes, this.#cursor, cloned_panic_recovery);
    }

    static default() {
        return new CommandQueue([], 0, [])
    }

    push(command: Command) {
        this.get_raw().push(command)
    }

    apply(world: World) {
        world.__flush_entities();
        world.__flush_commands();

        this.get_raw().apply_or_drop_queued(world);
    }

    apply_or_drop_queued(world: World) {
        this.get_raw().apply_or_drop_queued(world)
    }

    append(other: CommandQueue) {
        this.#bytes.push(...other.#bytes)
    }

    is_empty() {
        return this.#cursor >= this.#bytes.length
    }

    get_raw() {
        return new RawCommandQueue(
            this.#bytes,
            this.#cursor,
            this.#panic_recovery
        )
    }
}

export class RawCommandQueue {
    #bytes: number[]; // u8[]
    #cursor: number;
    #panic_recovery: number[]; // u8[]

    constructor(bytes: number[] = [], cursor: number = 0, panic_recovery: number[] = []) {
        this.#bytes = bytes;
        this.#cursor = cursor;
        this.#panic_recovery = panic_recovery;
    }

    apply_or_drop_queued(world: World) { }

    is_empty() {
        return this.#cursor >= this.#bytes.length
    }

    push(command: Command) {

        let meta;
        // const meta = {
        //     meta: ,
        //     command,
        // }
    }

    clone() {
        return new RawCommandQueue(structuredClone(this.#bytes), this.#cursor, structuredClone(this.#panic_recovery))
    }
}
