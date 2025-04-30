import { Option } from 'joshkaposh-option'
import { DeferredWorld, SystemMeta, World } from "..";
import { Command } from "../system/commands";

interface CommandMeta {
    consume_command_and_get_size(value: any, world: Option<World>, cursor: number): number
}

export class CommandQueue {
    #bytes: any[]; // u8[]
    #cursor: number;
    #panic_recovery: any[]; // u8[]

    constructor(bytes: any[] = [], cursor: number = 0, panic_recovery: any[] = []) {
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

    push(command: Command) {
        this.get_raw().push(command)
    }

    apply(world: World) {
        world.__flushEntities();
        world.__flushCommands();

        this.get_raw().apply_or_drop_queued(world);
    }

    exec(world: World) {
        this.apply(world);
    }

    queue(world: DeferredWorld) {
        world.commands.append(this);
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

    drop() {
        if (this.#bytes.length !== 0) {
            console.warn('CommandQueue has un-applied commands being dropped. Did you forget to call SystemState.apply()?')
        }

        this.get_raw().apply_or_drop_queued(null);
    }

    apply_system_buffer(_system_meta: SystemMeta, world: World) {
        this.apply(world);
    }

    queue_system_buffer(_system_meta: SystemMeta, world: World) {
        world.commands.append(this)
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


    is_empty() {
        return this.#cursor >= this.#bytes.length
    }

    push(command: Command) {
        const meta: CommandMeta = {
            consume_command_and_get_size(_value, world, cursor) {
                cursor++;
                if (world) {
                    command.exec(world);
                    world.flush();
                }
                return cursor;
            },
        }

        this.#bytes.push({ meta, command } as unknown as number);
    }

    apply_or_drop_queued(world: Option<World>) {
        const start = this.#cursor;
        const stop = this.#bytes.length;
        let local_cursor = start;
        this.#cursor = stop;

        while (local_cursor < stop) {
            const meta = this.#bytes[local_cursor];
            local_cursor += 1;

            try {
                // @ts-expect-error
                const cmd = meta.command;
                // @ts-expect-error
                (meta.meta.consume_command_and_get_size)(cmd, world, local_cursor);
            } catch (error) {
                const panic_recovery = this.#panic_recovery;
                const bytes = this.#bytes;
                const current_stop = bytes.length;
                panic_recovery.push(...bytes.slice(local_cursor, current_stop));
                bytes.length = start;
                this.#cursor = start;

                if (start === 0) {
                    console.log('adding to bytes: ', panic_recovery);

                    bytes.push(...panic_recovery);
                }
            }
        }

        this.#bytes.length = start;
        this.#cursor = start;
    }

    clone() {
        return new RawCommandQueue(this.#bytes, this.#cursor, this.#panic_recovery)
        // return new RawCommandQueue(structuredClone(this.#bytes), this.#cursor, structuredClone(this.#panic_recovery))
    }
}
