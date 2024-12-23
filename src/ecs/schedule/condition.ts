import { unit } from "../../util";
import { IntoSystemTrait, System, SystemInput } from "../system";

export abstract class Condition<Marker, In extends SystemInput = unit> extends IntoSystemTrait<In, boolean, Marker> {

    and<M, C extends Condition<M, In>>(and: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(and as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);
    }

    nand<M, C extends Condition<M, In>>(nand: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(nand as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);
    }

    nor<M, C extends Condition<M, In>>(nor: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(nor as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);
    }
    or<M, C extends Condition<M, In>>(or: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(or as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);

    }
    or_else<M, C extends Condition<M, In>>(or_else: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(or_else as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);

    }

    xnor<M, C extends Condition<M, In>>(nxor: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(nxor as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);

    }
    xor<M, C extends Condition<M, In>>(xor: C) {
        const a = IntoSystemTrait.into_system(this as any);
        const b = IntoSystemTrait.into_system(xor as any);
        const name = `${a.name()} && ${b.name()}`;
        return new CombinatorSystem(a, b, name);
    }
}

export * from './common-conditions';