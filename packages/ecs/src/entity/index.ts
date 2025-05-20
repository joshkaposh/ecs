import { ErrorExt } from 'joshkaposh-option';
import { Entity } from './entity';

export * from './entity';

export type EntityDoesNotExistDetails = typeof EntityDoesNotExistDetails;
export const EntityDoesNotExistDetails = `does not exist (index has been reused or was never spawned)`;

export class EntityDoesNotExistError extends ErrorExt<{
    entity: Entity;
    details: EntityDoesNotExistDetails;
}> {
    constructor(entity: Entity) {
        super({ entity, details: EntityDoesNotExistDetails })
    }
}
