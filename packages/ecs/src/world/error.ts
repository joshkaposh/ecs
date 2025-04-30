import type { ErrorType } from "joshkaposh-option";
import type { ComponentId } from "../component";
import type { ScheduleLabel } from "../schedule";
import { type Entity, EntityDoesNotExistDetails } from "../entity";

/**
 * The error type returned by `World.try_run_schedule()` if the provided schedule does not exist.
 */
export class TryRunScheduleError extends Error implements ErrorType<ScheduleLabel> {
    #label: ScheduleLabel;
    constructor(label: ScheduleLabel) {
        super(label);
        this.#label = label;
    }
    get() {
        return this.#label;
    }
}

/**
 * The error type returned by `World.try_despawn()` if the provided entity does not exist.
 */
export class TryDespawnError extends Error implements ErrorType<{
    entity: Entity;
    details: EntityDoesNotExistDetails;
}> {
    #entity: any
    constructor(entity: Entity) {
        super(`TryDespawnError`);
        this.#entity = entity;
    }

    get(): { entity: Entity; details: EntityDoesNotExistDetails; } {
        return {
            entity: this.#entity,
            details: EntityDoesNotExistDetails
        }
    }
}

/**
 * The error type returned by `World.try_insert_batch()` and `World.try_insert_batch_if_new()`
 * if any of the provided entities do not exist.
 */
export class TryInsertBatchError extends Error implements ErrorType<{ bundle_type: string; entities: Entity[] }> {
    #bundle_type: string;
    #entities: Entity[];
    constructor(bundle_type: string, entities: Entity[]) {
        super(`TryInsertBatchError - ${bundle_type}: ${entities}`);
        this.#bundle_type = bundle_type;
        this.#entities = entities;
    }

    get(): { bundle_type: string; entities: Entity[]; } {
        return {
            bundle_type: this.#bundle_type,
            entities: this.#entities
        }
    }
}

/**
 * An error that occurs when dynamically retrieving components from an entity.
 */
export class EntityComponentError extends Error implements ErrorType<{ MissingComponent: ComponentId } | { AliasedMutability: ComponentId }> {
    #type: { MissingComponent: ComponentId } | { AliasedMutability: ComponentId }
    constructor(type: { MissingComponent: ComponentId } | { AliasedMutability: ComponentId }) {
        let ty, id
        if ('MissingComponent' in type) {
            ty = 'MissingComponent';
            id = type.MissingComponent
        } else {
            ty = 'AliasedMutability';
            id = type.AliasedMutability;
        }
        super(`EntityComponentError { ${ty}: ${id} }`);
        this.#type = type;
    }

    get(): { MissingComponent: ComponentId; } | { AliasedMutability: ComponentId; } {
        return this.#type;
    }
}

export class EntityFetchError extends Error implements ErrorType<{ NoSuchEntity: { entity: Entity; details: EntityDoesNotExistDetails } } | { AliasedMutability: Entity }> {
    #type: { NoSuchEntity: { entity: Entity; details: EntityDoesNotExistDetails } } | { AliasedMutability: Entity };
    constructor(type: { NoSuchEntity: { entity: Entity; details: EntityDoesNotExistDetails } } | { AliasedMutability: Entity }) {
        let ty, id
        if ('NoSuchEntity' in type) {
            ty = 'NoSuchEntity';
            id = type.NoSuchEntity.entity;
        } else {
            ty = 'AliasedMutability';
            id = type.AliasedMutability;
        }

        super(`EntityFetchError { ${type}: ${id} }`);
        this.#type = type;
    }

    get(): { NoSuchEntity: { entity: Entity; details: EntityDoesNotExistDetails; }; } | { AliasedMutability: Entity; } {
        return this.#type;
    }

    eq(other: EntityFetchError) {
        return +this === +other;
    }

    [Symbol.toPrimitive]() {
        return 'NoSuchEntity' in this.get()
    }
}