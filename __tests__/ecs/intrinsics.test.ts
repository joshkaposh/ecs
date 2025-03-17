import { assert, expect, test } from "vitest";
import { clamp_unchecked, lerp, u8, u16, u32, u64, clampu64_unchecked, clamp, clampu64, uint } from 'joshkaposh-option';

test('clamp_unchecked', () => {
    assert(clamp_unchecked(100, 0, 50) === 50);
    assert(clamp_unchecked(-100, 0, 50) === 0);
    assert(clamp_unchecked(-5, 0, -25) === -25);

    assert(clampu64_unchecked(100n, 0n, 50n) === 50n);
    assert(clampu64_unchecked(-100n, 0n, 50n) === 0n);
    assert(clampu64_unchecked(-5n, 0n, -25n) === -25n);

})

test('clamp', () => {
    assert(clamp(100, 0, 50) === 50);
    assert(clamp(-100, 0, 50) === 0);
    assert(clamp(-5, 0, -25) === -5);

    assert(clampu64(100n, 0n, 50n) === 50n);
    assert(clampu64(-100n, 0n, 50n) === 0n);
    assert(clampu64(-5n, 0n, -25n) === -5n);

})

test('lerp', () => {
    assert(lerp(0, 100, 0.0) === 0)
    assert(lerp(0, 100, 0.1) === 10)
    assert(lerp(0, 100, 0.2) === 20)
    assert(lerp(0, 100, 0.3) === 30)
    assert(lerp(0, 100, 0.4) === 40)
    assert(lerp(0, 100, 0.5) === 50)
    assert(lerp(0, 100, 0.6) === 60)
    assert(lerp(0, 100, 0.7) === 70)
    assert(lerp(0, 100, 0.8) === 80)
    assert(lerp(0, 100, 0.9) === 90)
    assert(lerp(0, 100, 1) === 100)

    assert(lerp(100, 200, 0.0) === 100)
    assert(lerp(100, 200, 0.1) === 110);
    assert(lerp(100, 200, 0.2) === 120);
    assert(lerp(100, 200, 0.3) === 130);
    assert(lerp(100, 200, 0.4) === 140);
    assert(lerp(100, 200, 0.5) === 150);
    assert(lerp(100, 200, 0.6) === 160);
    assert(lerp(100, 200, 0.7) === 170);
    assert(lerp(100, 200, 0.8) === 180);
    assert(lerp(100, 200, 0.9) === 190);
    assert(lerp(100, 200, 1) === 200);
})

function uint_wrapping(BITS: any) {
    const type = uint[BITS];
    if (type.BITS !== 64) {
        const max = type.MAX;
        assert(type.wrapping_add(max, 1) === 0)
        assert(type.wrapping_add(0, max) === max);
        assert(type.wrapping_add(max, max) === max - 1);

        assert(type.wrapping_sub(0, 1) === 0);
        assert(type.wrapping_sub(0, max) === max - 1);

        assert(type.wrapping_mul(max, 2) === max - 1);


    } else {
        const max = type.MAX;
        assert(type.wrapping_add(max, 1n) === 0n)
        assert(type.wrapping_add(0n, max) === max);
        assert(type.wrapping_add(max, max) === max - 1n);

        assert(type.wrapping_sub(0n, 1n) === 0n);
        assert(type.wrapping_sub(0n, max) === max - 1n);

        assert(type.wrapping_mul(max, 2n) === max - 1n);
    }
}

function uint_checked(BITS: any) {
    const type = uint[BITS];
    if (type.BITS !== 64) {
        const max = type.MAX;
        assert(type.checked_add(max, 1) == null);
        assert(type.checked_add(max - 1, 1) === max);

        assert(type.checked_sub(0, 1) == null);
        assert(type.checked_sub(max, max + 1) == null);
        assert(type.checked_sub(max, max) == 0);

        assert(type.checked_mul(Math.floor(max / 3), 5) == null)

        assert(type.checked_div(max, max) === 1);
    } else {
        const max = type.MAX;
        assert(type.checked_add(max, 1n) == null);
        assert(type.checked_add(max - 1n, 1n) === max);

        assert(type.checked_sub(0n, 1n) == null);
        assert(type.checked_sub(max, max + 1n) == null);
        assert(type.checked_sub(max, max) == 0n);

        assert(type.checked_mul(max / 3n, 5n) == null)

        assert(type.checked_div(max, max) == 1n);
    }
}

function uint_saturating(BITS: any) {
    const type = uint[BITS];

    if (type.BITS !== 64) {
        const max = type.MAX;
        assert(type.saturating_add(max, max) === max);
        assert(type.saturating_add(max, 1) === max);

        assert(type.saturating_sub(max, max * 2) === 0);

        assert(type.saturating_mul(max, 5) === max);

        assert(type.saturating_div(100, 10) === 10)

    } else {
        const max = type.MAX;
        assert(type.saturating_add(max, max) === max);
        assert(type.saturating_add(max, 1n) === max);

        assert(type.saturating_sub(max, max * 2n) === 0n);

        assert(type.saturating_mul(max, 5n) === max);

        assert(type.saturating_div(100n, 10n) === 10n)
    }
}

test('operations', () => {
    uint_wrapping('u8')
    uint_wrapping('u16')
    uint_wrapping('u32')
    uint_wrapping('u64');

    uint_checked('u8')
    uint_checked('u16')
    uint_checked('u32')
    uint_checked('u64');

    uint_saturating('u8')
    uint_saturating('u16')
    uint_saturating('u32')
    uint_saturating('u64');
})