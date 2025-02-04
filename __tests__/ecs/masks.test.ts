import { assert, test } from "vitest";
import { HIGH_MASK, IdKind, IdentifierMask } from 'ecs/src/identifier';
import { u32 } from "intrinsics";
const NON_ZERO_U32_MIN = 1;

test('get_u64_parts', () => {
    const value = 9223372032559808524n;
    assert(IdentifierMask.get_low(value) === 0x0000_000C);
    assert(IdentifierMask.get_high(value) === 0x7FFF_FFFF);
})

test('extract_kind', () => {
    // All bits are ones
    let high = 0xFFFF_FFFF;
    assert(IdentifierMask.extract_kind_from_high(high) === IdKind.Placeholder);
    assert(IdentifierMask.extract_kind_from_high(high) === IdKind.Placeholder)
    // Second and second to last bits are ones
    high = 0x4000_0002;
    IdentifierMask.extract_kind_from_high(high)
    assert(IdentifierMask.extract_kind_from_high(high) === IdKind.Entity)
})

test('extract_high_value', () => {
    let high = 0xFFFF_FFFF;
    // Excludes the most significant bit as that is a flag bit.
    assert(
        IdentifierMask.extract_value_from_high(high) === 0x7FFF_FFFF,
        `${IdentifierMask.extract_value_from_high(high)} !== ${0x7FFF_FFFF}`
    );

    // Start bit and end bit are ones.
    high = 0x8000_0001;
    assert(0x0000_0001 === IdentifierMask.extract_value_from_high(high));

    // Classic bit pattern.
    high = 0xDEAD_BEEF;
    assert(0x5EAD_BEEF === IdentifierMask.extract_value_from_high(high));
})

test('pack_kind_bits', () => {
    // All bits are ones except the most significant bit, which is zero
    let high = 0x7FFF_FFFF;

    assert(
        IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder) === 0xFFFF_FFFF,
        `${IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder)} !== ${0xFFFF_FFFF}`
    )
    assert(0xFFFF_FFFF === IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder),
        `${IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder)} !== ${0xFFFF_FFFF}`);

    // Arbitrary bit pattern
    high = 0x00FF_FF00;

    assert(IdentifierMask.pack_kind_into_high(high, IdKind.Entity) ===    //     ,
        // Remains unchanged as before
        0x00FF_FF00, `${IdentifierMask.pack_kind_into_high(high, IdKind.Entity)} !== ${0x00FF_FF00}`
    );

    // Bit pattern that almost spells a word
    high = 0x40FF_EEEE;

    assert(IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder) ===    //     IdentifierMask.pack_kind_into_high(high, IdKind.Placeholder),
        0xC0FF_EEEE // Milk and no sugar, please.
    );
})

test('incrementing_masked_nonzero_high_is_safe', () => {
    // Adding from lowest value with lowest to highest increment
    // No result should ever be greater than 0x7FFF_FFFF or HIGH_MASK

    assert(IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, 0) === NON_ZERO_U32_MIN);

    assert(IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, 1) === 2);

    assert(IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, 2) === 3);

    assert(NON_ZERO_U32_MIN ===
        IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, HIGH_MASK),
    );

    assert(IdentifierMask.inc_masked_high_by(NON_ZERO_U32_MIN, u32.MAX) === NON_ZERO_U32_MIN);

    // Adding from absolute highest value with lowest to highest increment
    // No result should ever be greater than 0x7FFF_FFFF or HIGH_MASK

    assert(HIGH_MASK === IdentifierMask.inc_masked_high_by(u32.MAX, 0))

    assert(NON_ZERO_U32_MIN === IdentifierMask.inc_masked_high_by(u32.MAX, 1))

    assert(2 === IdentifierMask.inc_masked_high_by(u32.MAX, 2));

    assert(HIGH_MASK === IdentifierMask.inc_masked_high_by(u32.MAX, HIGH_MASK));

    assert(HIGH_MASK === IdentifierMask.inc_masked_high_by(u32.MAX, u32.MAX));

    // Adding from actual highest value with lowest to highest increment
    // No result should ever be greater than 0x7FFF_FFFF or HIGH_MASK

    assert(HIGH_MASK === IdentifierMask.inc_masked_high_by(HIGH_MASK, 0));

    assert(NON_ZERO_U32_MIN === IdentifierMask.inc_masked_high_by(HIGH_MASK, 1))

    assert(2 === IdentifierMask.inc_masked_high_by(HIGH_MASK, 2))

    assert(HIGH_MASK === IdentifierMask.inc_masked_high_by(HIGH_MASK, HIGH_MASK));

    assert(HIGH_MASK === IdentifierMask.inc_masked_high_by(HIGH_MASK, u32.MAX));
})