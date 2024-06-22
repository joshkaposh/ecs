import { Option } from "joshkaposh-iterator";
import { clamp_unchecked } from "..";
import { int_div } from "./shared";
import { NumberTrait, SizeKey } from "./types";

export const UINT_MIN = 0;
export const NZUINT_MIN = 1;

export type UintSizeKey = SizeKey<'u'>;
export const UINT_SIZE = {
    u8: [UINT_MIN, 255],
    u16: [UINT_MIN, 65535],
    u32: [UINT_MIN, 4294967295],
} as const;

export const NZUINT_SIZE = {
    u8: [NZUINT_MIN, UINT_SIZE.u8[1]],
    u16: [NZUINT_MIN, UINT_SIZE.u16[1]],
    u32: [NZUINT_MIN, UINT_SIZE.u32[1]],
} as const;

export function uint_size(size: UintSizeKey) {
    return UINT_SIZE[size];
}

export function uint_max(size: UintSizeKey) {
    return UINT_SIZE[size][1];
}

export function uint_min(_size: UintSizeKey) {
    return UINT_MIN;
}

class Uint<Min extends 0 | 1, B extends 8 | 16 | 32> implements NumberTrait<B> {
    readonly MAX: number;
    readonly MIN: Min;
    readonly BITS: B

    constructor(bits: B, min: Min, max: number) {
        this.BITS = bits;
        this.MIN = min;
        this.MAX = max;
    }

    /**
     * @summary
     * Performs the as cast.
     * 
     * @example
     * let x = u8.from(1000);
     * 
     * assert(x === 255);
     */
    from(n: number) {
        return clamp_unchecked(n, this.MIN, this.MAX)

    }

    /**
     * @description
     * Performs a wrapping addition of two numbers.
     * `a` is assumed to already be the integer type of the subtraction.
     * @example
     * u8.wrapping_add(0, 255); // 255
     * u8.wrapping_add(255, 1); // 0
     * u8.wrapping_add(255, 255) // 254
     */
    wrapping_add(a: number, b: number) {
        const op = a + b;
        return op > this.MAX ? op - this.MAX - 1 : op
    }

    /**
   * @description
   * Performs a wrapping subtraction of two numbers.
   * `a` is assumed to already be the integer type of the subtraction.
   * @example
   * u8.wrapping_sub(1, 0); // 0
   * u8.wrapping_sub(0, 255); // 254
   */
    wrapping_sub(a: number, b: number) {
        const op = a - b;
        return op < 0 ? -op - 1 : op;
    }

    /**
     * @description
     * Performs an integer division on two numbers. `wrapping_div` on unsigned types is a normal integer division.
     * It is added purely to standardize with the other operations (*, + , -).
     * @example
     * u8.wrapping_div(100, 10) // 10
     */
    wrapping_div(a: number, b: number) {
        return int_div(a, b);
    }
    /**
     * Performs a wrapping multiply of two numbers.
     * `a` is already assumed to be the integer type being multiplied with.
     * @example
     * u8.wrapping_mul(10, 12); // 120
     * u8.wrapping_mul(25, 12); // 44
     */
    wrapping_mul(a: number, b: number) {
        const op = a * b;
        return op > this.MAX ? -(this.MAX - op) - 1 : op;
    }

    /**
     * @description
     * Performs a checked addition of two numbers.
     * `a` is already assumed to be the integer type being addition with.
     * @returns None if overflow was detected, otherwise the result of the addition.
     * @example
     * u8.checked_add(255, 1) // null
     * u8.checked_add(254, 1) // 255
     */
    checked_add(a: number, b: number): Option<number> {
        const op = a + b;
        return op > this.MAX ? null : op;
    }

    /**
 * @description
 * Performs a checked subtraction of two numbers.
 * `a` is already assumed to be the integer type being subtraction with.
 * @returns None if overflow was detected, otherwise the result of the subtraction.
 * @example
 * u8.checked_sub(255, 256) // null
 * u8.checked_sub(255, 255) // 0
 */
    checked_sub(a: number, b: number): Option<number> {
        const op = a - b;
        return op < 0 ? null : op;
    }

    /**
     * @description
     * Performs a checked multiply of two numbers.
     * `a` is already assumed to be the integer type being multiplied with.
     * @returns None if overflow was detected, otherwise the result of the multiply.
     * @example
     * u8.checked_mul(10, 12); // 120
     * u8.checked_mul(25, 12); // null
     */
    checked_mul(a: number, b: number): Option<number> {
        const op = a * b;
        return op > this.MAX ? null : op;
    }
    /**
 * @description
 * Performs an integer division on two numbers. `checked_div` on unsigned types is a normal integer division.
 * It is added purely to standardize with the other operations (*, + , -).
 * @example
 * u8.checked_div(100, 10) // 10
 */
    checked_div(a: number, b: number): number {
        return int_div(a, b);
    }

    /**
     * @description
     * Performs a saturating addition of two number. `a` is assumed to be the integer type of the subtraction.
     * @returns 
     * If overflow was detected, returns `Uint.MAX`, otherwise returns the resulting addition of the two integers.
     * @example
     * u8.saturating_add(255, 255); // 255
     * u8.saturating_add(123, 27); // 150
     */
    saturating_add(a: number, b: number) {
        return Math.min(a + b, this.MAX);
    }

    /**
     * @description
     * Performs a saturating subtraction of two number. `a` is assumed to be the integer type of the subtraction.
     * @returns 
     * If overflow was detected, returns `Uint.MAX`, otherwise returns the resulting subtraction of the two integers.
     * @example
     * u8.saturating_sub(255, 1000); // 0
     * u8.saturating_sub(0, 1000000); // 0
    */
    saturating_sub(a: number, b: number) {
        return Math.max(a - b, 0);
    }

    /**
* @description
* Performs a saturating multiply of two number. `a` is assumed to be the integer type of the multiply.
* @returns 
* If overflow was detected, returns `Uint.MAX`, otherwise returns the resulting multiply of the two integers.
* @example
* u8.saturating_mul(100, 100); // 255
*/
    saturating_mul(a: number, b: number) {
        return Math.min(a * b, this.MAX);
    }

    saturating_div(a: number, b: number) {
        return int_div(a, b)
    }
}

function impl_uint<T extends 8 | 16 | 32>(BITS: T, size: typeof UINT_SIZE | typeof NZUINT_SIZE) {
    const [MIN, MAX] = size[`u${BITS}`];
    return new Uint(BITS, MIN, MAX);
}

export const u8 = impl_uint(8, UINT_SIZE);
export const u16 = impl_uint(16, UINT_SIZE);
export const u32 = impl_uint(32, UINT_SIZE);

export const nzu8 = impl_uint(8, UINT_SIZE);
export const nzu16 = impl_uint(16, UINT_SIZE);
export const nzu32 = impl_uint(32, UINT_SIZE);