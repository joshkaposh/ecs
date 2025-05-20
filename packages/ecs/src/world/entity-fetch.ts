import type { World } from "./world";
import { type Entity, EntityDoesNotExistDetails } from "../entity";
import { EntityFetchError } from "./error";
import { EntityMut, EntityRef, EntityWorldMut } from "./entity-ref";
import { ErrorExt, type Result } from "joshkaposh-option";

export type WorldEntityFetch = Entity | Entity[] | Set<Entity>;
type HandleFetch<T extends WorldEntityFetch, R extends EntityRef | EntityMut | EntityWorldMut> = Result<
    T extends Entity ? R :
    T extends Entity[] ? R[] :
    T extends Set<Entity> ? Map<Entity, R> :
    never
    , EntityFetchError>


// type HandleFetch<T extends WorldEntityFetch, R extends EntityRef | EntityMut | EntityWorldMut> =
//     T extends Entity ? R :
//     T extends Entity[] ? R[] :
//     T extends Set<Entity> ? R :
//     never;

type FetchResult<T> = Result<T, EntityFetchError>;



// type WorldEntityFetchReturnType<T extends WorldEntityFetch, FnType extends 'Ref' | 'Mut' | 'DeferredMut'> = T extends Entity ?
//     FnType extends 'Ref' ? ReturnType<typeof fetch_ref_entity> :
//     FnType extends 'Mut' ? ReturnType<typeof fetch_mut_entity> :
//     ReturnType<typeof fetch_deferred_mut_entity> :

//     T extends Entity[] ?
//     FnType extends 'Ref' ? ReturnType<typeof fetch_ref_array> :
//     FnType extends 'Mut' ? ReturnType<typeof fetch_mut_array> :
//     ReturnType<typeof fetch_deferred_mut_array> :

//     FnType extends 'Ref' ? ReturnType<typeof fetch_ref_set> :
//     FnType extends 'Mut' ? ReturnType<typeof fetch_mut_set> :
//     ReturnType<typeof fetch_deferred_mut_set>;


export function fetch_ref_entity(cell: World, entity: Entity): Result<EntityRef, ErrorExt<Entity>> {
    return cell.getEntity(entity) ?? new ErrorExt(entity);
}

export function fetch_mut_entity(cell: World, entity: Entity): Result<EntityWorldMut, EntityFetchError> {
    const location = cell.entities.get(entity);
    if (!location) {
        return new EntityFetchError({ NoSuchEntity: entity })
    }
    return new EntityWorldMut(cell, location, entity);
}

export function fetch_deferred_mut_entity(cell: World, entity: Entity): Result<EntityMut, EntityFetchError> {
    const location = cell.entities.get(entity);
    if (!location) {
        return new EntityFetchError({ NoSuchEntity: entity })
    }
    return new EntityMut(cell, entity, location)
}

export function fetch_ref_array(cell: World, entities: Entity[]): Result<EntityRef[], ErrorExt<Entity>> {
    const array = new Array(entities.length);
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eref = fetch_ref_entity(cell, entity);
        if (eref instanceof ErrorExt) {
            return eref;
        }
        array[i] = eref;
    }
    return array;
}

export function fetch_mut_array(cell: World, entities: Entity[]): Result<EntityMut[], EntityFetchError> {
    for (let i = 0; i < entities.length; i++) {
        for (let j = 0; j < i; j++) {
            if (+entities[i] === +entities[j]) {
                return new EntityFetchError({ AliasedMutability: entities[i] })
            }
        }
    }

    const array: EntityMut[] = new Array(entities.length)
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const emut = fetch_deferred_mut_entity(cell, entity);
        if (emut instanceof EntityFetchError) {
            return emut;
        }
        array[i] = emut;
    }
    return array;
}

export function fetch_deferred_mut_array(cell: World, entities: Entity[]) {
    return fetch_mut_array(cell, entities);
}

export function fetch_ref_set(cell: World, set: Set<Entity>) {
    const refs = new Map<Entity, EntityRef>();
    try {
        set.forEach(id => {
            const ecell = cell.getEntity(id);
            if (!ecell) {
                throw id;
            }
            refs.set(id, ecell);
        })
        return refs;
    } catch (error) {
        return new EntityFetchError({ NoSuchEntity: error as number });
    }
}

export function fetch_mut_set(cell: World, set: Set<Entity>) {
    const refs = new Map<Entity, EntityMut>();
    try {
        set.forEach(id => {
            const location = cell.entities.get(id);
            if (!location) {
                throw new EntityFetchError({ NoSuchEntity: id })
            }

            refs.set(id, new EntityMut(cell, id, location))
        })
        return refs;
    } catch (error) {
        return error as EntityFetchError;
    }
}

export function fetch_deferred_mut_set(cell: World, set: Set<Entity>) {
    return fetch_mut_set(cell, set);
}

export function fetch_ref<T extends WorldEntityFetch>(cell: World, entities: T): HandleFetch<T, EntityRef> {
    const fn = typeof entities === 'number' ?
        fetch_ref_entity :
        Array.isArray(entities) ? fetch_ref_array : fetch_ref_set

    return fn(cell, entities as any) as HandleFetch<T, EntityRef>;
}

export function fetch_mut<T extends WorldEntityFetch>(cell: World, entities: T): HandleFetch<T, EntityWorldMut> {
    const fn = typeof entities === 'number' ?
        fetch_mut_entity :
        Array.isArray(entities) ? fetch_mut_array :
            fetch_mut_set

    return fn(cell, entities as any) as HandleFetch<T, EntityWorldMut>;
}

export function fetch_deferred_mut<T extends WorldEntityFetch>(cell: World, entities: T): HandleFetch<T, EntityMut> {
    const fn = typeof entities === 'number' ?
        fetch_deferred_mut_entity :
        Array.isArray(entities) ? fetch_deferred_mut_array :
            fetch_deferred_mut_set

    return fn(cell, entities as any) as HandleFetch<T, EntityMut>
}
