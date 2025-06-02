import { System, SystemInput } from "../system";
import { CombinatorSystem, Combine } from "../system/combinator";

// TODO: Condition does not need `IntoScheduleConfig` or `IntoSystemSet`
export interface Condition<In, Out extends boolean = boolean> extends System<In, Out> {
    clone(): Condition<In, Out>;
    intoSystem(): this;

    setName(new_name: string): Condition<In, Out>

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if both `a` and `b` return true
     * 
     * This is equivalent to `a() && b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns false.
     */
    and<C extends Condition<any>>(other: C): AndCondition<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` returns false and `b` returns true
     * 
     * This is equivalent to `!a() && b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns true.
     */
    nand<C extends Condition<any>>(other: C): NandCondition<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` or `b` returns true
     * 
     * This is equivalent to `a() || b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns true.
     */

    or<C extends Condition<any>>(other: C): OrCondition<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` returns false and `b` returns true
     * 
     * This is equivalent to `!a() || b()`.
     * 
     * Short-curcuits: Condition `other` may not run if `this` condition returns false.
     */
    nor<C extends Condition<any>>(other: C): NorCondition<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a()` != `b()` (See Bitwise Xor)
     * 
     * This is equivalent to `a() ^ b()`.
     * 
     * Both conditions will always run.
     */
    xor<C extends Condition<any, boolean>>(other: C): XorCondition<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a()` === `b()` (See Bitwise Xor)
     * 
     * This is equivalent to `!(a() ^ b())`.
     * 
     * Both conditions will always run.
     */
    xnor<C extends Condition<any>>(other: C): XnorCondition<Condition<In, Out>, C>;
}

export type AndMarker = typeof AndMarker;
export const AndMarker: Combine<System<any, any>, System<any, any>> = {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return a(input) && b(input);
    }
} as const;

export type NandMarker = typeof NandMarker;
export const NandMarker: Combine<System<any, any>, System<any, any>> = {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return !a(input) && b(input);
    }
} as const;

export type OrMarker = typeof OrMarker;
export const OrMarker: Combine<System<any, any>, System<any, any>> = {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return a(input) || b(input);
    }
} as const;

export type NorMarker = typeof NorMarker;
export const NorMarker: Combine<System<any, any>, System<any, any>> = {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return !a(input) || b(input);
    }
} as const;

export type XorMarker = typeof XorMarker;
export const XorMarker: Combine<System<any, any>, System<any, any>> = {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return a(input) ^ b(input);
    }
} as const

export type XnorMarker = typeof XnorMarker;
export const XnorMarker: Combine<System<any, any>, System<any, any>> = {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return !(a(input) ^ b(input));
    }
} as const;


export type AndCondition<A extends Condition<any>, B extends Condition<any>> = CombinatorSystem<AndMarker, A, B>
export type NandCondition<A extends Condition<any>, B extends Condition<any>> = CombinatorSystem<NandMarker, A, B>
export type NorCondition<A extends Condition<any>, B extends Condition<any>> = CombinatorSystem<NorMarker, A, B>
export type OrCondition<A extends Condition<any>, B extends Condition<any>> = CombinatorSystem<OrMarker, A, B>
export type XnorCondition<A extends Condition<any>, B extends Condition<any>> = CombinatorSystem<XnorMarker, A, B>
export type XorCondition<A extends Condition<any>, B extends Condition<any>> = CombinatorSystem<XorMarker, A, B>