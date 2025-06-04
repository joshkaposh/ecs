import { defineComponent } from "define";
import { Transform } from "./transform";

class Mat4 {
    constructor(translation: any, rotation: any) {

    }

    static from(affine: Affine3A) {
        const [_, rotation, translation] = affine.toScaleRotationTranslation()
        return new Mat4(translation, rotation);
    }
}

class Mat3 {
    determinant(): any { }
}

class Vec3 {
    x: number;
    y: number;
    z: number;

    static get ZERO() {
        return new Vec3();
    }



    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class Isometry3d {

    constructor(translation: Vec3, rotation: Vec3) {

    }

    into() { }
}
type Quat = any;
type Vec3A = any;

class Affine3A {
    translation: Vec3;
    rotation: Vec3;
    scale: Vec3;
    matrix3: Mat3;

    constructor(translation = new Vec3(), rotation = new Vec3(), scale = new Vec3()) {
        this.translation = translation;
        this.rotation = rotation;
        this.scale = scale;
        this.matrix3 = new Mat3();
    }

    static get IDENTITY() {
        return new Affine3A();
    }


    static fromMat4(mat: Mat4) {
        return new Affine3A()
    }

    static fromTranslation(translation: Vec3) {
        return new Affine3A(translation);
    }

    static fromRotationTranslation(rotation: Vec3, translation: Vec3) {
        return new Affine3A(translation, rotation);
    }

    static fromScale(scale: Vec3) {
        return new Affine3A(new Vec3(), new Vec3(), scale);
    }

    toScaleRotationTranslation(): [Vec3, Vec3, Vec3] {
        return [] as any;
    }

    transformPoint(point: Vec3) { }
}

export const GlobalTransform = defineComponent(class GlobalTransform {
    #inner: Affine3A;

    constructor(inner: any = Affine3A.IDENTITY) {
        this.#inner = inner;
    }

    static get IDENTITY() {
        return new GlobalTransform(Affine3A.IDENTITY);
    }

    static fromTransform(transform: InstanceType<Transform>) {
        return new GlobalTransform(transform.computeAffine());
    }

    static fromMat4(world_from_local: Mat4) {
        return new GlobalTransform(Affine3A.fromMat4(world_from_local));
    }


    static fromXYZ(x: number, y: number, z: number) {
        return GlobalTransform.fromTranslation(new Vec3(x, y, z));
    }


    static fromTranslation(translation: Vec3) {
        return new GlobalTransform(Affine3A.fromTranslation(translation));
    }

    static fromRotation(rotation: Quat) {
        return new GlobalTransform(Affine3A.fromRotationTranslation(rotation, Vec3.ZERO));
    }

    static fromScale(scale: Vec3) {
        return new GlobalTransform(Affine3A.fromScale(scale));
    }

    static fromIsometry(iso: Isometry3d) {
        return new GlobalTransform(iso.into());
    }

    computeMatrix() {
        return Mat4.from(this.#inner);
    }

    /**
     * @returns the 3d affine transformation matrix as an [`Affine3A`].
     */
    affine() {
        return this.#inner;
    }

    computeTransform() {
        const [scale, rotation, translation] = this.#inner.toScaleRotationTranslation();
        return new Transform(translation, rotation, scale)
    }

    toIsometry() {
        const [_, rotation, translation] = this.#inner.toScaleRotationTranslation();
        return new Isometry3d(translation, rotation);
    }

    reparentedTo(parent: GlobalTransform) {
        const relative_affine = (parent.affine().inverse() * this.affine()) as unknown as Affine3A;
        const [scale, rotation, translation] = relative_affine.toScaleRotationTranslation();
        return new Transform(translation, rotation, scale);
    }

    toScaleRotationTranslation(): [Vec3, Quat, Vec3] {
        return this.#inner.toScaleRotationTranslation();
    }

    get translation() {
        return this.#inner.translation.into();
    }

    get translation_vec3a() {
        return this.#inner.translation;
    }

    get rotation() {
        return this.#inner.toScaleRotationTranslation()[1];
    }

    get scale() {
        // formula based on glam's implementation https://github.com/bitshifter/glam-rs/blob/2e4443e70c709710dfb25958d866d29b11ed3e2b/src/f32/affine3a.rs#L290
        const mat3 = this.#inner.matrix3;
        const det = mat3.determinant();
        return new Vec3(
            mat3.x_axis.length() * ops.copysign(1, det),
            mat3.y_axis.length(),
            mat3.z_axis.length()
        )
    }

    /**
     * @returns an upper bound of the radius from the given `extents`.
     */
    radius_vec3a(extents: Vec3A) {
        return this.#inner.matrix3.mult(extents).length();
    }

    /**
     * Transforms the given point from local space to global space, applying shear, scale, rotation, and translation.
     */
    transformPoint(point: Vec3) {
        return this.#inner.transformPoint(point);
    }

    /**
     * Multiplies `self` with `transform` component by component, returning the resulting [`GlobalTransform`].
     */
    mulTransform(transform: InstanceType<Transform>) {
        return new GlobalTransform(this.#inner.mul(transform.compute_affine()));
    }

    mul(transform: GlobalTransform) {
        return new GlobalTransform(this.#inner.mul(transform.#inner));
    }

    mulVec3(value: Vec3) {
        return this.transformPoint(value);
    }
});