import { Result } from "joshkaposh-option";
import { Entity, EntityDoesNotExistDetails } from "../entity";
import { Command, EntityCommand, EntityCommandError } from "../system/commands";
import { EntityFetchError } from "../world/error";
import { World } from "../world";

export function default_error_handler(error: Error, context: any) {
    throw error;
}

export interface HandleError<Out extends any = void> {
    hande_error_with(error_handler: (error: Error, context: any) => void): Command;
    handle_error(): Command;
}

export function HandleError(error_handler: (error: Error, context: any) => void = default_error_handler): Command {
    return error_handler as any;
}

export interface CommandWithEntity<Out> {
    with_entity(entity: Entity): Command<Out> & HandleError<Out>
}

export function CommandWithEntity<Out>(command: EntityCommand<Out>): CommandWithEntity<Result<void, Error>> {
    // @ts-expect-error
    command.with_entity = function with_entity(entity: Entity) {
        return {
            exec(world: World) {
                const e = world.getEntityMut(entity);
                if (!e) {
                    return new EntityFetchError({ NoSuchEntity: { entity, details: EntityDoesNotExistDetails } });
                }

                const err = command.exec(e);
                if (err instanceof Error) {
                    return new EntityCommandError({ CommandFailed: 0 })
                }

                return;
            },

            hande_error_with(_error_handler: any) {
                // error_handler()
            },

            handle_error() {
                // this.hande_error_with(default_error_handler)
            },
        }
    }
    return command as any;
}