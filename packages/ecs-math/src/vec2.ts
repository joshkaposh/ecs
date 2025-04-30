/**
 * equivalent to 1 / Math.sqrt(2).
 */
export const FRAC_1_SQRT_2 = 0.707106769;

/**
 * equivalent to 1 / Math.sqrt(3).
 */
export const FRAC_1_SQRT_3 = 0.577350259;


export class Vec2 {
    x: number;
    y: number;
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /**
     * @returns a unit vector pointing along the positive X axis.
     */
    static get X() {
        return new Vec2(1, 0);
    }

    /**
     * @returns a unit vector pointing along the positive Y axis.
     */
    static get Y() {
        return new Vec2(0, 1);
    }

    /**
     * @returns a tuple of direction axes.
     */
    static get AXES(): [Vec2, Vec2] {
        return [new Vec2(1, 0), new Vec2(0, 1)]
    }

    /**
     * @returns a unit vector pointing along the negative X axis.
     */
    static get NEG_X() {
        return new Vec2(-1, 0);
    }

    /**
     * @returns a unit vector pointing along the negative Y axis.
     */
    static get NEG_Y() {
        return new Vec2(0, -1);
    }

    /**
     * @returns the "North" direction, equivalent to [`Dir2.Y`]
     */
    static get NORTH() {
        return new Vec2(0, 1);
    }

    /**
     * @returns the "South" direction, equivalent to [`Dir2.NEG_Y`]
     */
    static get SOUTH() {
        return new Vec2(0, -1);
    }


    /**
     * @returns the "North" direction, equivalent to [`Dir2.X`]
     */
    static get EAST() {
        return new Vec2(1, 0);
    }

    /**
     * @returns the "West" direction, equivalent to [`Dir2.NEG_X`]
     */
    static get WEST() {
        return new Vec2(-1, 0);
    }

    /**
     * @returns the "North-East" direction, between [`Dir2.NORTH`] and [`Dir2.EAST`].
     */
    static get NORTH_EAST() {
        return new Vec2(FRAC_1_SQRT_2, FRAC_1_SQRT_2)
    }

    /**
     * @returns the "North-West" direction, between [`Dir2.NORTH`] and [`Dir2.WEST`].
     */

    static get NORTH_WEST() {
        return new Vec2(-FRAC_1_SQRT_2, FRAC_1_SQRT_2)
    }

    /**
     * @returns the "South-East" direction, between [`Dir2.SOUTH`] and [`Dir2.EAST`].
     */
    static get SOUTH_EAST() {
        return new Vec2(FRAC_1_SQRT_2, -FRAC_1_SQRT_2)
    }

    /**
     * @returns the "South-East" direction, between [`Dir2.SOUTH`] and [`Dir2.EAST`].
     */
    static get SOUTH_WEST() {
        return new Vec2(-FRAC_1_SQRT_2, -FRAC_1_SQRT_2)
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

    mult(rhs: Vec2) {
        this.x *= rhs.x;
        this.y *= rhs.y;
        return this;
    }

    multScalar(rhs: number) {
        this.x *= rhs;
        this.y *= rhs;
        return this;
    }

    div(rhs: Vec2) {
        this.x /= rhs.x;
        this.y /= rhs.y;
        return this;
    }

    divScalar(rhs: number) {
        this.x /= rhs;
        this.y /= rhs;
        return this;
    }

    add(rhs: Vec2) {
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

    sub(rhs: Vec2) {
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

    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        return this;
    }
    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        return this;
    }
}