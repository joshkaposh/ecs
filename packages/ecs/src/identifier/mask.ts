import { IdKind } from './kinds';
import { u32 } from "joshkaposh-option";

export const HIGH_MASK = 0x7FFF_FFFF;

// type U64 = bigint;
type U32 = number;

function extract_kind_from_high_entity(value: U32): IdKind {
    // The negated HIGH_MASK will extract just the bit we need for kind.
    let kind_mask = HIGH_MASK + 1;
    let bit = value & kind_mask;
    if (bit == kind_mask) {
        return IdKind.Entity
    }
    throw new Error('Unreachable')
}


export const IdentifierMask = {
    /**
     * Returns the low component from a `U64` value
     * 
     * This will truncate to the lowest 32 bits
    */
    get_low(value: bigint): number {
        // const int = BigInt(value);
        // const n = int >> BigInt(u32.BITS);
        // return Number(n)
        return Number(BigInt.asUintN(32, value));
    },

    /**
     * Returns the high component from a `U64` value
     */
    get_high(value: bigint): number {
        return Number(value >> BigInt(u32.BITS));
    },

    // Pack a low and high `u32` values into a single `U64` value.
    pack_into_U64(low: U32, high: U32): bigint {
        return ((BigInt(high) << BigInt(u32.BITS)) | BigInt(low))
        // return TODO('IdentifierMask::pack_into_U64')
    },

    // Pack the [`IdKind`] bits into a high segment.
    pack_kind_into_high(value: U32, kind: IdKind): U32 {
        return Number(BigInt(value) | (BigInt(kind) << BigInt(24)))
    },

    // Extract the value component from a high segment of an [`super::Identifier`].
    extract_value_from_high(value: U32): U32 {
        return Number(BigInt(value) & BigInt(HIGH_MASK));
    },

    extract_kind_from_high(value: U32): IdKind {
        // The negated HIGH_MASK will extract just the bit we need for kind.
        const kind_mask = ~HIGH_MASK;
        const bit = value & kind_mask;
        return (bit === kind_mask && bit === kind_mask) ? IdKind.Placeholder : IdKind.Entity
    },


    /// Offsets a masked generation value by the specified amount, wrapping to 1 instead of 0.
    /// Will never be greater than [`HIGH_MASK`] or less than `1`, and increments are masked to
    /// never be greater than [`HIGH_MASK`].

    // lhs is non-zero
    inc_masked_high_by(lhs: U32, rhs: U32) {
        // let lo = (lhs.get() & HIGH_MASK).wrapping_add(rhs & HIGH_MASK);
        const lo = u32.wrapping_add(lhs & HIGH_MASK, rhs & HIGH_MASK);
        // const lo = (lhs & HIGH_MASK) + (rhs & HIGH_MASK);
        // Checks high 32 bit for whether we have overflowed 31 bits.
        const overflowed = lo >> 31;

        // SAFETY:
        // - Adding the overflow flag will offset overflows to start at 1 instead of 0
        // - The sum of `0x7FFF_FFFF` + `u32::MAX` + 1 (overflow) == `0x7FFF_FFFF`
        // - If the operation doesn't overflow at 31 bits, no offsetting takes place
        //    unsafe { NonZeroU32::new_unchecked(lo.wrapping_add(overflowed) & HIGH_MASK) }
        // ! we need to flip overflowed because javascript bit operators overflow on > u32.MAX
        return u32.wrapping_add(lo, -overflowed) & HIGH_MASK
    }



} as const;