import { World } from "./world";
import { Entity, EntityDoesNotExistDetails, EntityMap, EntitySet } from "../entity";
import { EntityFetchError } from "./error";
import { EntityMut, EntityRef, EntityWorldMut } from "./entity-ref";
import { ErrorExt, Result } from "joshkaposh-option";

export type WorldEntityFetch = Entity | Entity[] | EntitySet;

// type EntityFetchRef = ''

type HandleFetch<T extends WorldEntityFetch, F extends 0 | 1 | 2> = T extends Entity ?
    EntityFetchEntity<F> : T extends Entity[] ?
    EntityFetchArray<F> :
    EntityFetchSet<F>

type EntityFetchEntity<FnType extends 0 | 1 | 2> = FnType extends 0 ?
    ReturnType<typeof fetch_ref_entity> : FnType extends 1 ?
    ReturnType<typeof fetch_mut_entity> :
    ReturnType<typeof fetch_deferred_mut_entity>;

type EntityFetchArray<FnType extends 0 | 1 | 2> = FnType extends 0 ?
    ReturnType<typeof fetch_ref_array> : FnType extends 1 ?
    ReturnType<typeof fetch_mut_array> :
    ReturnType<typeof fetch_deferred_mut_array>;

type EntityFetchSet<FnType extends 0 | 1 | 2> = FnType extends 0 ?
    ReturnType<typeof fetch_ref_set> : FnType extends 1 ?
    ReturnType<typeof fetch_mut_set> :
    ReturnType<typeof fetch_deferred_mut_set>;


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
    return cell.get_entity(entity) ?? new ErrorExt(entity);
}

export function fetch_mut_entity(cell: World, entity: Entity): Result<EntityWorldMut, EntityFetchError> {
    const location = cell.entities().get(entity);
    if (!location) {
        return new EntityFetchError({ NoSuchEntity: { entity, details: EntityDoesNotExistDetails } })
    }
    return new EntityWorldMut(cell, entity, location);
}

export function fetch_deferred_mut_entity(cell: World, entity: Entity): Result<EntityMut, EntityFetchError> {
    const location = cell.entities().get(entity);
    if (!location) {
        return new EntityFetchError({ NoSuchEntity: { entity, details: EntityDoesNotExistDetails } })
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

export function fetch_ref_set(cell: World, set: EntitySet) {
    const refs = new Map<Entity, EntityRef>();
    try {
        set.forEach(id => {
            const ecell = cell.get_entity(id);
            if (!ecell) {
                throw id;
            }
            refs.set(id, ecell);
        })
        return refs;
    } catch (error) {
        return error as Entity;
    }
}

export function fetch_mut_set(cell: World, set: EntitySet) {
    const refs = new Map<Entity, EntityMut>();
    try {
        set.forEach(id => {
            const location = cell.entities().get(id);
            if (!location) {
                throw new EntityFetchError({ NoSuchEntity: { entity: id, details: EntityDoesNotExistDetails } })
            }

            refs.set(id, new EntityMut(cell, id, location))
        })
        return refs;
    } catch (error) {
        return error as EntityFetchError;
    }
}

export function fetch_deferred_mut_set(cell: World, set: EntitySet) {
    return fetch_mut_set(cell, set);
}
export function fetch_ref<T extends WorldEntityFetch>(cell: World, entities: T): HandleFetch<T, 0> {
    const fn = typeof entities === 'number' ?
        fetch_ref_entity :
        Array.isArray(entities) ? fetch_ref_array : fetch_ref_set

    return fn(cell, entities as any) as HandleFetch<T, 0>;
}


export function fetch_mut<T extends WorldEntityFetch>(cell: World, entities: T): HandleFetch<T, 1> {
    const fn = typeof entities === 'number' ?
        fetch_mut_entity :
        Array.isArray(entities) ? fetch_mut_array : fetch_mut_set

    return fn(cell, entities as any) as HandleFetch<T, 1>;
}

export function fetch_deferred_mut<T extends WorldEntityFetch>(cell: World, entities: T): HandleFetch<T, 2> {
    const fn = typeof entities === 'number' ?
        fetch_deferred_mut_entity :
        Array.isArray(entities) ? fetch_deferred_mut_array : fetch_deferred_mut_set

    return fn(cell, entities as any) as HandleFetch<T, 2>;
}
