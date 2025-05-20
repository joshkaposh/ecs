import { Option } from 'joshkaposh-option'
import { World } from './world';
import { DeferredWorld } from './deferred-world';
import { SystemMeta, Command } from '../system';

interface CommandMeta {
    consume_command_and_get_size(value: any, world: Option<World>, cursor: number): number
}

export class CommandQueue {
    #commands: any[]; // u8[]
    #cursor: number;
    #panic_recovery: any[]; // u8[]

    constructor(bytes: any[] = [], cursor: number = 0, panic_recovery: any[] = []) {
        this.#commands = bytes;
        this.#cursor = cursor;
        this.#panic_recovery = panic_recovery;
    }

    static from_world(_world: World) {
        return new CommandQueue();
    }

    clone() {
        const cloned_bytes = new Array(this.#commands.length);
        const cloned_panic_recovery = new Array(this.#panic_recovery.length);

        for (let i = 0; i < this.#commands.length; i++) {
            const b = this.#commands[i];
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

    exec(_system_meta: SystemMeta, world: World) {
        this.apply(world);
    }

    queue(_system_meta: SystemMeta, world: DeferredWorld) {
        world.commands.append(this);
    }

    apply_or_drop_queued(world: World) {
        this.get_raw().apply_or_drop_queued(world)
    }

    append(other: CommandQueue) {
        this.#commands.push(...other.#commands)
    }

    is_empty() {
        return this.#cursor >= this.#commands.length
    }

    get_raw() {
        return new RawCommandQueue(
            this.#commands,
            this.#cursor,
            this.#panic_recovery
        )
    }

    drop() {
        if (this.#commands.length !== 0) {
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
    #commands: { meta: CommandMeta; command: Command }[];
    #cursor: number;
    #panic_recovery: { meta: CommandMeta; command: Command }[];

    constructor(bytes: { meta: CommandMeta; command: Command }[] = [], cursor: number = 0, panic_recovery: { meta: CommandMeta; command: Command }[] = []) {
        this.#commands = bytes;
        this.#cursor = cursor;
        this.#panic_recovery = panic_recovery;
    }

    static from_world(_world: World) {
        return new RawCommandQueue();
    }


    is_empty() {
        return this.#cursor >= this.#commands.length
    }

    push(command: Command) {
        this.#commands.push({
            meta: {
                consume_command_and_get_size(_value, world, cursor) {
                    cursor++;
                    if (world) {
                        command.exec(world);
                        world.flush();
                    }
                    return cursor;
                },
            }, command
        });
    }

    apply_or_drop_queued(world: Option<World>) {
        const start = this.#cursor;
        const stop = this.#commands.length;
        let local_cursor = start;
        this.#cursor = stop;

        while (local_cursor < stop) {
            const cmd = this.#commands[local_cursor];
            local_cursor += 1;

            try {
                cmd.meta.consume_command_and_get_size(cmd.command, world, local_cursor);
            } catch (error) {
                const panic_recovery = this.#panic_recovery;
                const bytes = this.#commands;
                const current_stop = bytes.length;
                panic_recovery.push(...bytes.slice(local_cursor, current_stop));
                bytes.length = start;
                this.#cursor = start;

                if (start === 0) {
                    bytes.push(...panic_recovery);
                }
            }
        }

        this.#commands.length = start;
        this.#cursor = start;
    }

    clone() {
        return new RawCommandQueue(this.#commands, this.#cursor, this.#panic_recovery)
    }
}
