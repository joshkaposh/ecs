import { assert, test } from "vitest";
import { HIGH_MASK, IdKind, IdentifierMask } from '../src/ecs/identifier';
import { u32 } from "../src/Intrinsics";
const NON_ZERO_U32_MIN = 1;

function assert_eq(a: any, b: any) {
    assert(a === b, `Expected ${a} to be ${b}`)
}

test('get_u64_parts', () => {
    // const value = 0x7FFF_FFFF_0000_000C;

    // assert_eq(IdentifierMask.get_low(value), 0x0000_000C);
    // assert_eq(IdentifierMask.get_high(value), 0x7FFF_FFFF);

})

test('extract_kind', () => {
    // All bits are ones
    let high = 0xFFFF_FFFF;
    // assert(IdentifierMask.extract_kind_from_high(high) === IdKind.Placeholder);
    IdentifierMask.extract_kind_from_high(high)
    // assert_eq(
    //     IdentifierMask.extract_kind_from_high(high),
    //     IdKind.Placeholder
    // )
    // Second and second to last bits are ones
    high = 0x4000_0002;
    IdentifierMask.extract_kind_from_high(high)
    // assert_eq(
    //     IdentifierMask.extract_kind_from_high(high),
    //     IdKind.Entity
    // )
})

test('extract_high_value', () => {
    let high = 0xFFFF_FFFF;
    // Excludes the most significant bit as that is a flag bit.
    assert_eq(
        IdentifierMask.extract_value_from_high(high),
        0x7FFF_FFFF
    );

    // Start bit and end bit are ones.
    high = 0x8000_0001;
    assert_eq(
        IdentifierMask.extract_value_from_high(high),
        0x0000_0001
    );

    // Classic bit pattern.
    high = 0xDEAD_BEEF;
    assert_eq(
        IdentifierMask.extract_value_from_high(high),
        0x5EAD_BEEF
    );
})

test('pack_kind_bits', () => {
    // All bits are ones expect the most significant bit, which is zero
    let high = 0x7FFF_FFFF;

    assert_eq(
        IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder),
        0xFFFF_FFFF
    );

    // Arbitrary bit pattern
    high = 0x00FF_FF00;

    // assert_eq(
    //     IdentifierMask.pack_kind_into_high(high, IdKind.Entity),
    //     // Remains unchanged as before
    //     0x00FF_FF00
    // );

    // Bit pattern that almost spells a word
    // high = 0x40FF_EEEE;

    // assert_eq(
    //     IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder),
    //     0xC0FF_EEEE // Milk and no sugar, please.
    // );
})

test('incrementing_masked_nonzero_high_is_safe', () => {
    // Adding from lowest value with lowest to highest increment
    // No result should ever be greater than 0x7FFF_FFFF or HIGH_MASK

    assert_eq(
        NON_ZERO_U32_MIN,
        IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, 0)
    );

    assert_eq(
        2,
        IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, 1)
    );

    assert_eq(
        3,
        IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, 2)
    );

    assert_eq(
        NON_ZERO_U32_MIN,
        IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, HIGH_MASK),
    );

    assert_eq(
        NON_ZERO_U32_MIN,
        IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, u32.MAX),
    );

    // Adding from absolute highest value with lowest to highest increment
    // No result should ever be greater than 0x7FFF_FFFF or HIGH_MASK

    assert_eq(HIGH_MASK, IdentifierMask.inc_masked_high_by(u32.MAX, 0))

    assert_eq(NON_ZERO_U32_MIN, IdentifierMask.inc_masked_high_by(u32.MAX, 1))

    assert_eq(2, IdentifierMask.inc_masked_high_by(u32.MAX, 2));

    assert_eq(HIGH_MASK, IdentifierMask.inc_masked_high_by(u32.MAX, HIGH_MASK));

    assert_eq(HIGH_MASK, IdentifierMask.inc_masked_high_by(u32.MAX, u32.MAX));

    // Adding from actual highest value with lowest to highest increment
    // No result should ever be greater than 0x7FFF_FFFF or HIGH_MASK

    assert_eq(HIGH_MASK, IdentifierMask.inc_masked_high_by(HIGH_MASK, 0));

    assert_eq(NON_ZERO_U32_MIN, IdentifierMask.inc_masked_high_by(HIGH_MASK, 1))

    assert_eq(2, IdentifierMask.inc_masked_high_by(HIGH_MASK, 2))

    assert_eq(HIGH_MASK, IdentifierMask.inc_masked_high_by(HIGH_MASK, HIGH_MASK));

    assert_eq(HIGH_MASK, IdentifierMask.inc_masked_high_by(HIGH_MASK, u32.MAX));
})