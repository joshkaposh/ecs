import { ErrorExt } from 'joshkaposh-option';
import { Entity } from './entity';

export * from './id';
export * from './entity';
export * from './hash';
export * from './hash-set';
export * from './hash-map';
// export * from './map_entities';
// export * from './clone_entities';


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
