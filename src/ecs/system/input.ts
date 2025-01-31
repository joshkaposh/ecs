import { unit } from "../../util";

export type SystemInput = {
    Param: SystemInput;
    Inner: any;
    /**
     * wraps a SystemInout::Inner into a SystemInput::Param
     */
    wrap(): SystemInput;
} | unit;

const SystemInputUnit = {
    Param: unit,
    Inner: unit,

    wrap() {
        return unit;
    }
}

export class In<T> {
    Param!: In<T>;
    Inner!: T;
    Input: T;
    constructor(input: T) {
        this.Input = input;
    }

    get value() {
        return this.Input
    }

    wrap(this: In<T>['Inner']): In<T>['Param'] {
        return new In(this);
    }


}

export class InRef<T> {
    Param!: InRef<T>;
    Inner!: T;
    input: T;
    constructor(input: T) {
        this.input = input;
    }

    wrap(this: InRef<T>['Inner']): InRef<T>['Param'] {
        return new InRef(this);
    }
}

export class InMut<T> {
    Param!: InMut<T>;
    Inner!: T;
    input: T;
    constructor(input: T) {
        this.input = input;
    }

    wrap(this: InMut<T>['Inner']): InMut<T>['Param'] {
        return new InMut(this);
    }
}



