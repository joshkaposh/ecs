import { System, SystemInput } from "../system";
import { CombinatorSystem, Combine } from "../system/combinator";


// TODO: Condition does not need `IntoScheduleConfig` or `IntoSystemSet`
export interface Condition<In, Out extends boolean = boolean> extends System<In, Out> {
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
    and<C extends Condition<any>>(other: C): And<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` returns false and `b` returns true
     * 
     * This is equivalent to `!a() && b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns true.
     */
    nand<C extends Condition<any>>(other: C): Nand<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` or `b` returns true
     * 
     * This is equivalent to `a() || b()`.
     * 
     * Short-curcuits: Condition `other` will not run if `this` condition returns true.
     */

    or<C extends Condition<any>>(other: C): Or<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a` returns false and `b` returns true
     * 
     * This is equivalent to `!a() || b()`.
     * 
     * Short-curcuits: Condition `other` may not run if `this` condition returns false.
     */
    nor<C extends Condition<any>>(other: C): Nor<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a()` != `b()` (See Bitwise Xor)
     * 
     * This is equivalent to `a() ^ b()`.
     * 
     * Both conditions will always run.
     */
    xor<C extends Condition<any, boolean>>(other: C): Xor<Condition<In, Out>, C>;

    /**
     * Combines `this` condition and `other` into a new condition.
     * 
     * The system `this` combination is applied to will **only** run if `a()` === `b()` (See Bitwise Xor)
     * 
     * This is equivalent to `!(a() ^ b())`.
     * 
     * Both conditions will always run.
     */
    xnor<C extends Condition<any>>(other: C): Xnor<Condition<In, Out>, C>;
}

export class AndMarker implements Combine<System<any, any>, System<any, any>> {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return a(input) && b(input);
    }
}

export class NandMarker implements Combine<System<any, any>, System<any, any>> {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return !a(input) && b(input);
    }
}

export class NorMarker implements Combine<System<any, any>, System<any, any>> {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return !a(input) || b(input);
    }
}

export class OrMarker implements Combine<System<any, any>, System<any, any>> {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return a(input) || b(input);
    }
}

export class XnorMarker implements Combine<System<any, any>, System<any, any>> {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return !(a(input) ^ b(input));
    }
}

export class XorMarker implements Combine<System<any, any>, System<any, any>> {
    combine(input: SystemInput, a: (input: any) => any, b: (input: any) => any) {
        return a(input) ^ b(input);
    }
}

export type And<A extends System<any, any>, B extends System<any, any>> = CombinatorSystem<AndMarker, A, B>
export type Nand<A extends System<any, any>, B extends System<any, any>> = CombinatorSystem<NandMarker, A, B>
export type Nor<A extends System<any, any>, B extends System<any, any>> = CombinatorSystem<NorMarker, A, B>
export type Or<A extends System<any, any>, B extends System<any, any>> = CombinatorSystem<OrMarker, A, B>
export type Xnor<A extends System<any, any>, B extends System<any, any>> = CombinatorSystem<XnorMarker, A, B>
export type Xor<A extends System<any, any>, B extends System<any, any>> = CombinatorSystem<XorMarker, A, B>