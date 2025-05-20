import { Result } from "joshkaposh-option";
import { Entity } from "../entity";
import { Command, EntityCommand, EntityCommandError } from "../system/commands";
import { EntityFetchError } from "../world/error";
import { EntityWorldMut, World } from "../world";

export function default_error_handler(error: Error, _context: any) {
    throw error;
}

export interface HandleError<Out> {
    handle_error_with(error_handler: (error: Error, context: any) => void): Command<Out>;
    handle_error(): Command<Out>;
}

export interface WithEntity<Out> {
    with_entity(entity: Entity): Command<Out>
}

export interface CommandWithEntity<Out> extends Command<Out>, WithEntity<Out> { }

export function apply_error_handling<Out>(command: Partial<HandleError<Out>>) {
    command.handle_error_with = function handle_error_with(_error_handler) {
        return this as Command<Out>;
    }

    command.handle_error = function handle_error() {
        return this as Command<Out>;
    }
}

export function defineCommand<Fn extends (world: World) => any, Out extends ReturnType<Fn>>(fn: Fn & Partial<Command<Out>>): Command<Out> {
    fn.exec = fn;
    apply_error_handling(fn)

    return fn as Command<Out>;
}

export function defineEntityCommand<T extends (entity: EntityWorldMut) => any, Out extends ReturnType<T>>(fn: T & Partial<EntityCommand<Out>>): EntityCommand<Out> {
    fn.exec = fn;
    apply_error_handling(fn);
    apply_with_entity(fn as EntityCommand<Out>);
    return fn as EntityCommand<Out>;
}

export function apply_with_entity<Out>(command: EntityCommand<Out> & Partial<WithEntity<Out>>): CommandWithEntity<Result<void, EntityCommandError>> {
    command.with_entity = function with_entity(entity: Entity) {
        const execute = command.exec;
        // @ts-expect-error
        command.exec = function exec(world: World) {
            const ref = world.getEntityMut(entity);
            if (!ref) {
                return new EntityCommandError({ EntityFetchError: new EntityFetchError({ NoSuchEntity: entity }) })
            }

            const out = execute(ref) as Out;
            if (out instanceof Error) {
                return new EntityCommandError({ CommandFailed: 0 });
            }
        }

        return this as unknown as Command<Out>;
    }

    return command as unknown as CommandWithEntity<Result<void, EntityCommandError>>
}