import { TODO } from "joshkaposh-iterator/src/util";
import { IdKind, IdKindType } from './kinds';
import { u32 } from "../../Intrinsics";
import { carrot_left, shift_left } from "../../bit";

export const HIGH_MASK = 0x7FFF_FFFF;

type U64 = number;
type U32 = number;

function extract_kind_from_high_entity(value: U32): IdKindType {
    // The negated HIGH_MASK will extract just the bit we need for kind.
    let kind_mask = HIGH_MASK + 1;
    let bit = value & kind_mask;
    if (bit == kind_mask) {
        return IdKind.Entity
    }
    throw new Error('Unreachable')
}


export const IdentifierMask = {
    // Returns the low component from a `U64` value
    get_low(value: U64): U32 {
        // value as u32
        return TODO('IdentifierMask::get_low')
        // return u32.saturating_add(0, value);
    },

    // Returns the high component from a `U64` value
    get_high(value: U64): U32 {
        // (value >> u32.BITS) as u32;
        return TODO('IdentifierMask::get_high')
    },

    // Pack a low and high `u32` values into a single `U64` value.
    pack_into_U64(low: U32, high: U32): U64 {
        // ((high as U64) << u32::BITS) | (low as U64)
        return TODO('IdentifierMask::pack_into_U64')
    },

    // Pack the [`IdKind`] bits into a high segment.
    pack_kind_into_high(value: U32, kind: IdKindType): U32 {
        // value | ((kind as u32) << 24)
        // console.log('pack_kind', value, kind << 24, value | (kind << 24));
        const shift = kind << 24;

        const shift2 = shift_left(kind, 24)
        // console.log('value = %d, shift = %d, carrot = %d', value, shift, shift2);


        // return value | (kind << 24);
        return u32.wrapping_sub((value | (shift_left(kind, 24))), u32.MAX);
    },

    // Extract the value component from a high segment of an [`super::Identifier`].
    extract_value_from_high(value: U32): U32 {
        return value & HIGH_MASK;
    },

    extract_kind_from_high(value: U32): IdKindType {
        // The negated HIGH_MASK will extract just the bit we need for kind.
        let kind_mask = !HIGH_MASK;
        let bit = value & kind_mask;
        let kind_mask2 = HIGH_MASK + 1;
        let bit2 = value & kind_mask2;

        // console.log('BOOLS', bit == kind_mask, bit2 == kind_mask2);


        return (bit == kind_mask && bit2 == kind_mask2) ? IdKind.Placeholder : IdKind.Entity
        // return bit == kind_mask ? IdKind.Placeholder : extract_kind_from_high_entity(value);
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