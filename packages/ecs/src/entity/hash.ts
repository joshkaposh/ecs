import { u64 } from "joshkaposh-option";
import { EntityOld } from "./entity";
import { IdentifierError, IdentifierMask, IdKind } from "../identifier";

const UPPER_PHI = 0x9e37_79b9_0000_0001n;

export function hash_entity(entity: EntityOld) {
    const low = entity.index();
    const high = entity.generation();
    const kind = `${entity}` === `${EntityOld.PLACEHOLDER}` ? IdKind.Placeholder : IdKind.Entity;

    const masked_value = IdentifierMask.extract_value_from_high(high);
    const packed_high = IdentifierMask.pack_kind_into_high(masked_value, kind)

    if (packed_high === 0) {
        throw IdentifierError.InvalidIdentifier();
    }

    const bits = IdentifierMask.pack_into_U64(low, high);
    return u64.wrapping_mul(bits, UPPER_PHI);
}

export class EntityHasher {
    #hash!: bigint;

    write_u64(bits: bigint) {
        this.#hash = u64.wrapping_mul(bits, UPPER_PHI)
    }

    [Symbol.toPrimitive]() {
        return this.#hash;
    }

    valueOf() {
        return this.#hash;
    }
}
