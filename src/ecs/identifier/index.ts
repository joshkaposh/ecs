import { ErrorExt, Result } from 'joshkaposh-option';
import { TODO } from 'joshkaposh-iterator/src/util';
import { IdKindType } from './kinds';
import { IdentifierMask } from './mask';

export * from './mask';
export * from './kinds';

export const IdentifierError = {
    InvalidEntityId(bits: number) {
        return {
            bits
        }
    }
} as const;

export type IdentifierErrorType = typeof IdentifierError[keyof typeof IdentifierError];

export class Identifier {
    #low: number // u32;
    #high: number // NonZeroU32
    constructor(low: number, high: number, kind: IdKindType) {
        const masked_value = IdentifierMask.extract_value_from_high(high);
        const packed_high = IdentifierMask.pack_kind_into_high(masked_value, kind)
        if (packed_high == - 0) {
            throw new Error('InvalidIdentifier');
        }

        this.#low = low;
        this.#high = packed_high;
    }

    low() {
        return this.#low;
    }

    high() {
        return this.#high;
    }

    masked_high() {
        return IdentifierMask.extract_value_from_high(this.#high);
    }

    kind() {
        return IdentifierMask.extract_kind_from_high(this.#high);
    }

    to_bits() {
        return IdentifierMask.pack_into_U64(this.#low, this.#high);
    }

    static from_bits(value: number) {
        const id = Identifier.try_from_bits(value);

        if (id instanceof Error) {
            throw new Error('Attempted to initialize invalid bits as an id');
        }

        return id;
    }

    static try_from_bits(value: number): Result<Identifier, ErrorExt> {
        const high = IdentifierMask.get_high(value);
        // let high = NonZeroU32::new(IdentifierMask::get_high(value))
        /*
        match high {
        Some(high) => Ok(Self {
            low: IdentifierMask::get_low(value),
            high
        }),
        None => Err(IdentifierError::InvalidIdentifier)
        
        }
        */
        return TODO('Identifier::try_from_bits')
    }
}