import { Option } from "joshkaposh-option";

export type BITS = 8 | 16 | 32;

export type SizeKey<T extends string> = `${T}${BITS}`;

export interface NumberTrait<B extends BITS> {
    readonly MAX: number;
    readonly MIN: number;
    readonly BITS: B;

    checked_add(a: number, b: number): Option<number>;
    checked_sub(a: number, b: number): Option<number>;
    checked_div(a: number, b: number): Option<number>;
    checked_mul(a: number, b: number): Option<number>;

    saturating_add(a: number, b: number): number;
    saturating_sub(a: number, b: number): number;
    saturating_div(a: number, b: number): number;
    saturating_mul(a: number, b: number): number;

    wrapping_add(a: number, b: number): number;
    wrapping_sub(a: number, b: number): number;
    wrapping_div(a: number, b: number): number;
    wrapping_mul(a: number, b: number): number;
}