import { unit } from "../util";
import { IntoSystemTrait, System, SystemInput } from "../system";
import { CombinatorSystem, Combine } from "../system/combinator";

export type Condition<Marker, In extends SystemInput = unit> = {
    and<M, C extends Condition<M, In>>(other: C): And<System<In, boolean>, System<In, boolean>>;
    nand<M, C extends Condition<M, In>>(other: C): Nand<System<In, boolean>, System<In, boolean>>

    or<M, C extends Condition<M, any>>(other: C): Or<System<In, boolean>, System<In, boolean>>;
    nor<M, C extends Condition<M, any>>(other: C): Nor<System<In, boolean>, System<In, boolean>>;

    xor<M, C extends Condition<M, any>>(other: C): Xor<System<In, boolean>, System<In, boolean>>;
    xnor<M, C extends Condition<M, any>>(other: C): Xnor<System<In, boolean>, System<In, boolean>>;
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

export * from './common-conditions';