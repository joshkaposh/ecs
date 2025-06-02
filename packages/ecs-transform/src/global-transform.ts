import { defineComponent } from "define";
import { Transform } from "./transform";

export const GlobalTransform = defineComponent(class GlobalTransform {
    #inner: any;

    constructor(inner: any = Affine3A.IDENTITY) {
        this.#inner = inner;
    }

    static get IDENTITY() {
        return new GlobalTransform(Affine3A.IDENTITY);
    }

    static from_transform(transform: Transform) {
        return new GlobalTransform(transform.compute_affine());
    }

    static from_mat4(world_from_local: Mat4) {
        return new GlobalTransform(Affine3A.from_mat4(world_from_local));
    }


    static from_xyz(x: number, y: number, z: number) {
        return GlobalTransform.from_translation([x, y, z]);
    }


    static from_translation(translation: Vec3) {
        return new GlobalTransform(Affine3A.from_translation(translation));
    }

    static from_rotation(rotation: Quat) {
        return new GlobalTransform(Affine3A.from_rotation_translation(rotation, Vec3.ZERO));
    }

    static from_scale(scale: Vec3) {
        return new GlobalTransform(Affine3A.from_scale(scale));
    }

    static from_isometry(iso: Isometry3d) {
        return new GlobalTransform(iso.into());
    }

    compute_matrix() {
        return Mat4.from(this.#inner);
    }

    /**
     * @returns the 3d affine transformation matrix as an [`Affine3A`].
     */
    affine() {
        return this.#inner;
    }

    compute_transform() {
        const [scale, rotation, translation] = this.#inner.to_scale_rotation_translation();
        return new Transform(translation, rotation, scale)
    }

    to_isometry() {
        const [_, rotation, translation] = this.#inner.to_scale_rotation_translation();
        return new Isometry3d(translation, rotation);
    }

    reparented_to(parent: GlobalTransform) {
        const relative_affine = parent.affine().inverse() * this.affine();
        const [scale, rotation, translation] = relative_affine.to_scale_rotation_translation();
        return new Transform(translation, rotation, scale);
    }

    to_scale_rotation_translation(): [Vec3, Quat, Vec3] {
        return this.#inner.to_scale_rotation_translation();
    }

    get translation() {
        return this.#inner.translation.into();
    }

    get translation_vec3a() {
        return this.#inner.translation;
    }

    get rotation() {
        return this.#inner.to_scale_rotation_translation()[1];
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
    transform_point(point: Vec3) {
        return this.#inner.transform_point3(point);
    }

    /**
     * Multiplies `self` with `transform` component by component, returning the resulting [`GlobalTransform`].
     */
    mul_transform(transform: InstanceType<Transform>) {
        return new GlobalTransform(this.#inner.mul(transform.compute_affine()));
    }

    mul(transform: GlobalTransform) {
        return new GlobalTransform(this.#inner.mul(transform.#inner));
    }

    mul_vec3(value: Vec3) {
        return this.transform_point(value);
    }



});