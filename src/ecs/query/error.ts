import { Err, ErrorExt } from "joshkaposh-option";
import { Entity } from "../entity";

export type QueryEntityError = {
    readonly type: 0;
    readonly entity: Entity;
} | {
    readonly type: 1;
    readonly entity: Entity;
} | {
    readonly type: 2;
    readonly entity: Entity;
};
export const QueryEntityError = {
    QueryDoesNotMatch(entity: Entity) {
        return new ErrorExt({ type: 0, entity } as const, `The components of entity ${entity} do not match the query`)
    },
    NoSuchEntity(entity: Entity) {
        return new ErrorExt({ type: 1, entity } as const, `The entity ${entity} does not exist`)
    },
    AliasedMutability(entity: Entity) {
        return new ErrorExt({ type: 2, entity } as const, `The entity ${entity} was requested mutably more than once`)
    }
} as const

export type QueryComponentError = Err<0> | Err<1> | Err<2> | Err<3>;
export const QueryComponentError = {
    get MissingReadAccess() {
        return new ErrorExt<0>(0, 'This query does not have write access to the requested component')
    },
    get MissingWriteAccess() {
        return new ErrorExt<1>(1, 'This query does not have write access to the requested component')
    },
    get MissingComponent() {
        return new ErrorExt<2>(2, 'The given Entity does not have the requested component')
    },
    get NoSuchEntity() {
        return new ErrorExt<3>(3, 'The requested Entity does not exist.')
    }
} as const;

export type QuerySingleError = Err<0> | Err<1>;
export const QuerySingleError = {
    get NoEntities() {
        return new ErrorExt<0>(0, `No entities fit the query`)
    },

    get MultipleEntities() {
        return new ErrorExt<1>(1, `Multiple entities fit the query`)
    }
} as const

