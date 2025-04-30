import { ErrorType } from "joshkaposh-option";
import { FRAC_1_SQRT_2, Vec2 } from './vec2';
export class InvalidDirectionError<T extends { Zero: 0 } | { Infinite: 1 } | { NaN: 2 }> extends Error implements ErrorType<T> {
    #type: T;
    constructor(type: T) {
        super(`Invaid Direction: ${Object.keys(type)[0]}`)
        this.#type = type;
    }

    static fromLength(length: number) {
        if (Number.isNaN(length)) {
            return new InvalidDirectionError({ NaN: 2 })
        } else if (!Number.isFinite(length)) {
            return new InvalidDirectionError({ Infinite: 1 })
        } else {
            return new InvalidDirectionError({ Zero: 0 })
        }
    }

    get(): T {
        return this.#type
    }
}

function assertIsNormalized(message: string, length_squared: number) {
    const length_error_squared = Math.abs(length_squared - 1)
    if (length_error_squared > 2e-2 || Number.isNaN(length_error_squared)) {
        throw new Error(`Error: ${message} The length is ${Math.sqrt(length_squared)}`)
    } else if (length_error_squared > 2e-4) {
        console.error(`Warning: ${message} The length is ${Math.sqrt(length_squared)}`)
    }
}

export class Dir2 {
    x: number;
    y: number;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    static get X() {
        return new Dir2(1, 0);
    }

    static get Y() {
        return new Dir2(0, 1);
    }

    static get NEG_X() {
        return new Dir2(-1, 0);
    }

    static get NEG_Y() {
        return new Dir2(0, -1);
    }

    static get NORTH() {
        return new Dir2(0, 1);

    }

    static get SOUTH() {
        return new Dir2(0, -1);

    }

    static get EAST() {
        return new Dir2(1, 0);

    }

    static get WEST() {
        return new Dir2(-1, 0);
    }


    static get NORTH_EAST() {
        return new Dir2(FRAC_1_SQRT_2, FRAC_1_SQRT_2);

    }


    static get NORTH_WEST() {
        return new Dir2(FRAC_1_SQRT_2, -FRAC_1_SQRT_2);

    }

    static get SOUTH_EAST() {
        return new Dir2(-FRAC_1_SQRT_2, FRAC_1_SQRT_2);

    }

    static get SOUTH_WEST() {
        return new Dir2(-FRAC_1_SQRT_2, -FRAC_1_SQRT_2);
    }

    asVec2() {
        return new Vec2(this.x, this.y);
    }

    /**
     * performs a spherical linear interpolation between `this` and `rhs`.
     */
    slerp(rhs: Dir2, s: number) {
        const angle = this.angleTo(rhs);
        return Rot2.radians(angle * s) * this;
    }

    /**
     * performs a linear interpolation between `this` and `rhs`.
     */
    lerp(rhs: Dir2, delta: number) {
        return this;
    }

    rotationTo(other: Dir2) {
        return other.rotationFromX() * this.rotationToX();
    }

    rotationFrom(other: Dir2) {
        return other.rotationTo(this);
    }

    rotationFromX() {
        return Rot2.fromSinCos(this.x, this.y);
    }

    rotationToX() {
        return this.rotationFromX().inverse();
    }

    rotationFromY() {
        return Rot2.fromSinCos(-this.x, this.y);
    }


    rotationToY() {
        return this.rotationFromY().inverse();
    }

    /**
     * Useful for preventing numerical error accumulation.
     * @see [`Dir3.fastRenomalize`] for an example of when such an error accumulation might occur.
     * @returns a new [`Dir2`] after an approximate normalization, assuming the value is already nearly normalized.
     */
    fastRenormalise() {

    }

    /**
     * negates both `x` and `y`.
     * @example
     * const dir = new Dir2(1, 0.5);
     * const neg = new Dir2(1, 0.5).neg();
     * dir.x = -dir.x;
     * dir.y = -dir.y;
     * assert(dir.x === neg.x && dir.y === neg.y)
     */
    neg() {
        this.x = -this.x;
        this.y = -this.y;
        return this;
    }

    mult(rhs: Dir2) {
        this.x *= rhs.x;
        this.y *= rhs.y;
        return this;
    }

    multScalar(rhs: number) {
        this.x *= rhs;
        this.y *= rhs;
        return this;
    }

    div(rhs: Dir2) {
        this.x /= rhs.x;
        this.y /= rhs.y;
        return this;
    }

    divScalar(rhs: number) {
        this.x /= rhs;
        this.y /= rhs;
        return this;
    }

    add(rhs: Dir2) {
        this.x += rhs.x;
        this.y += rhs.y;
        return this;
    }

    addScalar(rhs: number) {
        this.x += rhs;
        this.y += rhs;
        return this;
    }

    addX(rhs: number) {
        this.x += rhs;
        return this;
    }

    addY(rhs: number) {
        this.y += rhs;
        return this;
    }

    sub(rhs: Dir2) {
        this.x -= rhs.x;
        this.y -= rhs.y;
        return this;
    }

    subScalar(rhs: number) {
        this.x -= rhs;
        this.y -= rhs;
        return this;
    }

    subX(rhs: number) {
        this.x -= rhs;
        return this;
    }

    subY(rhs: number) {
        this.y -= rhs;
        return this;
    }

    floor() { }

}