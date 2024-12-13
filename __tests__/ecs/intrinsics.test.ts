import { assert, expect, test } from "vitest";
import { clamp_unchecked, lerp, u8, u16, u32 } from '../../src/Intrinsics';

test('size', () => {

    max(u8.MAX, 255)
    max(u16.MAX, 65535);
    max(u32.MAX, 4294967295);

    function max(expected: number, actual: number) {
        assert(expected === actual, `Expected ${expected} to equal ${actual}`)
    }
})

test('clamp', () => {
    assert(clamp_unchecked(100, 0, 50) === 50);
    assert(clamp_unchecked(-100, 0, 50) === 0);
    assert(clamp_unchecked(-5, 0, -25) === -25);
})

test('lerp', () => {
    expect(Math.floor(lerp(0, 100, 0.0))).toBe(0)
    expect(Math.floor(lerp(0, 100, 0.1))).toBe(10)
    expect(Math.floor(lerp(0, 100, 0.2))).toBe(20)
    expect(Math.floor(lerp(0, 100, 0.3))).toBe(30)
    expect(Math.floor(lerp(0, 100, 0.4))).toBe(40)
    expect(Math.floor(lerp(0, 100, 0.5))).toBe(50)
    expect(Math.floor(lerp(0, 100, 0.6))).toBe(60)
    expect(Math.floor(lerp(0, 100, 0.7))).toBe(70)
    expect(Math.floor(lerp(0, 100, 0.8))).toBe(80)
    expect(Math.floor(lerp(0, 100, 0.9))).toBe(90)
    expect(lerp(0, 100, 1)).toBe(100);

    expect(lerp(100, 200, 0.0)).toBe(100);
    expect(lerp(100, 200, 0.1)).toBe(110);
    expect(lerp(100, 200, 0.2)).toBe(120);
    expect(lerp(100, 200, 0.3)).toBe(130);
    expect(lerp(100, 200, 0.4)).toBe(140);
    expect(lerp(100, 200, 0.5)).toBe(150);
    expect(lerp(100, 200, 0.6)).toBe(160);
    expect(lerp(100, 200, 0.7)).toBe(170);
    expect(lerp(100, 200, 0.8)).toBe(180);
    expect(lerp(100, 200, 0.9)).toBe(190);
    expect(lerp(100, 200, 1)).toBe(200);
})

test('wrapping', () => {
    assert(u8.wrapping_add(255, 1) === 0)
    assert(u8.wrapping_add(0, 255) === 255);
    assert(u8.wrapping_add(255, 255) === 254);

    assert(u8.wrapping_sub(0, 1) === 0);
    assert(u8.wrapping_sub(0, 255) === 254);

    assert(u8.wrapping_mul(10, 12) === 120);
    assert(u8.wrapping_mul(25, 12) === 44);

    assert(u8.wrapping_div(100.9, 10) === 10);

})

test('checked', () => {

    assert(u8.checked_add(255, 1) === null);
    assert(u8.checked_add(254, 1) === 255);

    assert(u8.checked_sub(0, 1) === null);
    assert(u8.checked_sub(255, 256) === null);
    assert(u8.checked_sub(255, 255) === 0);

    assert(u8.checked_mul(10, 12) === 120);
    assert(u8.checked_mul(25, 12) === null);

    assert(u8.checked_div(100, 10) === 10);
})

test('saturating', () => {
    assert(u8.saturating_add(255, 255) === 255);
    assert(u8.saturating_add(123, 27) === 150);

    assert(u8.saturating_sub(255, 1000) === 0);
    assert(u8.saturating_sub(0, 1000000) === 0);

    assert(u8.saturating_mul(100, 100) === 255);

    assert(u8.saturating_div(100, 10) === 10)
})