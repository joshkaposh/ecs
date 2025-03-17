import { ErrorExt } from "joshkaposh-option";
import { Entity, EntityDoesNotExistDetails } from "../entity";
import { ComponentId } from "../component";
import { ScheduleLabel } from "../schedule";

/**
 * The error type returned by `World.try_run_schedule()` if the provided schedule does not exist.
 */
export class TryRunScheduleError extends ErrorExt<ScheduleLabel> {
    constructor(label: ScheduleLabel) {
        super(label)
    }
}

/**
 * The error type returned by `World.try_despawn()` if the provided entity does not exist.
 */
export class TryDespawnError extends ErrorExt<{
    entity: Entity;
    details: EntityDoesNotExistDetails;
}> {
    constructor(entity: Entity, details: EntityDoesNotExistDetails) {
        super({
            entity,
            details
        });
    }
}

/**
 * The error type returned by `World.try_insert_batch()` and `World.try_insert_batch_if_new()`
 * if any of the provided entities do not exist.
 */
export class TryInsertBatchError extends ErrorExt<{ bundle_type: string; entities: Entity[] }> {
    constructor(bundle_type: string, entities: Entity[]) {
        super({ bundle_type, entities })
    }
}

/**
 * An error that occurs when dynamically retrieving components from an entity.
 */
export class EntityComponentError extends ErrorExt<{ missing_component: ComponentId } | { AliasedMutability: ComponentId }> {
    constructor(type: { missing_component: ComponentId } | { AliasedMutability: ComponentId }) {
        super(type);
    }
}

export class EntityFetchError extends ErrorExt<{ NoSuchEntity: { entity: Entity; details: EntityDoesNotExistDetails } } | { AliasedMutability: Entity }> {
    constructor(type: { NoSuchEntity: { entity: Entity; details: EntityDoesNotExistDetails } } | { AliasedMutability: Entity }) {
        super(type);
    }

    eq(other: EntityFetchError) {
        return +this === +other;
    }

    [Symbol.toPrimitive]() {
        return 'NoSuchEntity' in this.get()
    }
}