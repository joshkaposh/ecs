import { Option } from "joshkaposh-option";
import { int_div } from "./shared";
import { NumberTrait, SizeKey } from "./types";

export type IntSizeKey = SizeKey<'i'>;

export const INT_SIZE = {
    i8: [-128, 127] as [number, number],
    i16: [-32768, 32767] as [number, number],
    i32: [-2147483648, 2147483647] as [number, number],
} as const;

class Int<B extends 8 | 16 | 32, Min extends number, Max extends number> implements NumberTrait<B> {
    readonly BITS: B;

    readonly MIN: Min;
    readonly MAX: Max;

    constructor(bits: B, min: Min, max: Max) {
        this.BITS = bits;
        this.MIN = min;
        this.MAX = max;
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

function impl_int<T extends 8 | 16 | 32>(BITS: T) {
    const [MIN, MAX] = INT_SIZE[`i${BITS}`];
    return new Int(BITS, MIN, MAX);
}

export const i8 = impl_int(8);
export const i16 = impl_int(16);
export const i32 = impl_int(32);