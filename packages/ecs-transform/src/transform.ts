import { defineComponent } from "define";
import { GlobalTransform } from "./global-transform";

function assert_is_normalized(message: string, length_squared: number) {
    const length_error_squared = Math.abs(length_squared - 1);
    if (length_error_squared > 2e-2 || Number.isNaN(length_error_squared)) {
        throw new Error(message);
    } else if (length_error_squared > 2e-4) {
        // Length error is approximately 1e4 or more.
        console.error(`Warning: ${message}`);
    }
}

type Vec3 = any;

export type Transform = typeof Transform;
export const Transform = defineComponent(class Transform {

    /**
     * Position of the entity. In 2d, the last value if the `Vec3` is used for z-ordering.
     */
    translation: Vec3;

    /**
     * Rotation of the entity.
     * 
     * See the [`3d_rotation`] example for usage.
     */
    rotation: Quat;

    /**
     * Scale of the entity.
     * 
     * See the [`Scale`] example for usage.
     */
    scale: Vec3;

    constructor(translation: Vec3, rotation: Quat, scale: Vec3) {
        this.translation = translation;
        this.rotation = rotation;
        this.scale = scale;
    }

    static get IDENTITY() {
        return new Transform(
            Vec3.ZERO,
            Quat.IDENTITY,
            Vec3.ONE
        );
    }

    static from_xyz(x: number, y: number, z: number) {
        return Transform.from_translation(new Vec3(x, y, z));
    }

    static from_matrix(world_from_local: Mat4) {
        const [scale, rotation, translation] = world_from_local.to_scale_rotation_translation();
        return new Transform(translation, rotation, scale);
    }

    /**
     * The transform is expected to be non-degenerate and without shearing, or the output will be invalid.
     */
    static from_global(transform: GlobalTransform) {
        return transform.compute_transform();
    }

    static from_translation(translation: Vec3) {
        return new Transform(
            translation,
            Quat.IDENTITY,
            Vec3.ONE
        )
    }

    static from_rotation(rotation: Quat) {
        return new Transform(
            Vec3.ZERO,
            rotation,
            Vec3.ONE
        );
    }

    static from_scale(scale: Vec3) {
        return new Transform(
            Vec3.ZERO,
            Quat.IDENTITY,
            scale
        );
    }

    static from_isometry(iso: Isometry3d) {
        return new Transform(
            iso.translation.into(),
            iso.rotation,
            Vec3.ONE
        )
    }

    lookingAt(target: Vec3, up: Dir3) {
        this.lookAt(target, up);
        return this;
    }

    lookingTo(direction: Vec3, up: Dir3) {
        this.lookTo(direction, up);
        return this;
    }

    alignedBy(main_axis: Dir3, main_direction: Dir3, secondary_axis: Dir3, secondary_direction: Dir3) {
        this.align(main_axis, main_direction, secondary_axis, secondary_direction);
        return this;
    }

    /**
     * Returns this [`Transform`] with a new translation.
     */
    withTranslation(translation: Vec3) {
        this.translation = translation;
        return this;
    }

    /**
     * Returns this [`Transform`] with a new rotation.
     */
    withRotation(rotation: Quat) {
        this.rotation = rotation;
        return this;
    }

    /**
     * Returns this [`Transform`] with a new scale.
     */
    withScale(scale: Vec3) {
        this.scale = scale;
        return this;
    }

    /**
     * @returns the 3d affine transformation matrix from this transform's translation, rotation, and scale.
     */
    computeMatrix() {
        return Mat4.fromScaleRotationTranslation(this.scale, this.rotation, this.translation);
    }

    /**
     * @returns the 3d affine transformation matrix from this transform's translation, rotation, and scale.
     */
    computeAffine() {
        return Affine3A.fromScaleRotationTranslation(this.scale, this.rotation, this.translation);
    }

    /**
     * the unit vector in the local `X` direction.
     */
    get local_x() {
        return Dir3.newUnchecked(this.rotation * Vec3.X)
    }

    /**
     * Equivalent to `-local_x`.
     */
    get left() {
        return -this.local_x;
    }

    /**
     * Equivalent to `local_x`.
     */
    get right() {
        return this.local_x;
    }

    /**
     * the unit vector in the local `Y` direction.
     */
    get local_y() {
        return Dir3.newUnchecked(this.rotation * Vec3.Y)
    }

    /**
     * Equivalent to `local_y`.
     */
    get up() {
        return this.local_y;
    }

    /**
     * Equivalent to -`local_y`.
     */
    get down() {
        return -this.local_y;
    }

    /**
     * the unit vector in the local `Z` direction.
     */
    get local_z() {
        return Dir3.newUnchecked(this.rotation * Vec3.Z)
    }

    get forward() {
        return -this.local_z;
    }

    get back() {
        return this.local_z;
    }

    rotate(rotation: Quat) {
        this.rotation = rotation.mul(this.rotation);
    }

    rotateAxis(axis: Dir3, angle: number) {
        assert_is_normalized('The axis given to `Transform.rotate_axis` is not normalized. This may be a result of obtaining the axis from the transform. See the documentation of `Transform.rotate_axis` for more details.', axis.length_squared());
        this.rotate(Quat.fromAxisAngle(axis.into(), angle));
    }

    rotateX(angle: number) {
        this.rotate(Quat.fromRotationX(angle));
    }

    rotateY(angle: number) {
        this.rotate(Quat.fromRotationY(angle));
    }

    rotateZ(angle: number) {
        this.rotate(Quat.fromRotationZ(angle));
    }

    rotateLocal(rotation: Quat) {
        this.rotation.mulEq(rotation);
    }

    rotateLocalAxis(axis: Dir3, angle: number) {
        assert_is_normalized('The axis given to `Transform.rotate_axis_local` is not normalized. This may be a result of obtaining the axis from the transform. See the documentation of `Transform.rotate_axis_local` for more details.', axis.length_squared())
        this.rotateLocal(Quat.fromAxisAngle(axis.into(), angle));
    }

    rotateLocalX(angle: number) {
        this.rotateLocal(Quat.fromRotationX(angle));
    }

    rotateLocalY(angle: number) {
        this.rotateLocal(Quat.fromRotationY(angle));
    }

    rotateLocalZ(angle: number) {
        this.rotateLocal(Quat.fromRotationZ(angle));
    }

    translateAround(point: Vec3, rotation: Quat) {
        this.translation = point + rotation * (this.translation - point);
    }

    rotateAround(point: Vec3, rotation: Quat) {
        this.translateAround(point, rotation);
        this.rotate(rotation);
    }

    lookAt(target: Vec3, up: Dir3) {
        this.lookTo(target - this.translation, up)
    }

    lookTo(direction: Dir3, up: Dir3) {
        const back = direction.neg() ?? Dir3.NEG_Z;
        up = up ?? Dir3.Y;

        const right = up.cross(back).try_normalize() ?? up.any_orhonormal_vector();

        up = back.cross(right);
        this.rotation = Quat.from_mat3(Mat3.from_cols(right, up, back));
    }

    align(main_axis: Dir3, main_direction: Dir3, secondary_axis: Dir3, secondary_direction: Dir3) {
        const first_rotation = Quat.from_rotation_arc(main_axis, main_direction);

        const secondary_image = first_rotation * secondary_axis;

        const secondary_image_ortho = secondary_image.reject_from_normalized(main_direction).try_normalize();

        const secondary_direction_ortho = secondary_direction.reject_from_normalized(main_direction).try_normalize();

        this.rotation = secondary_image_ortho != null && secondary_direction_ortho != null ?
            Quat.from_rotation_arc(secondary_image_ortho, secondary_direction_ortho) * first_rotation :
            first_rotation;
    }

    mulTransform(transform: Transform) {
        const translation = this.transformPoint(transform.translation);
        const rotation = this.rotation.mul(transform.rotation);
        const scale = this.scale * transform.scale;
        return new Transform(translation, rotation, scale);
    }

    /**
     * Transforms the given `point` applying scale, rotation, and translation.
     * 
     * If this [`Transform`] has an ancestor entity with a [`Transform`] component, [`Transform.transform_point`] will transform a point in local space into its parent transform's space.
     * 
     * If this [`Transform`] does not have a parent, [`Transform.transform_point`] will transform a point in local space into worlspace coordinates.
     * 
     * If you always want to transform a point in local space to worldsapce, or if you need the inverse transformations, see [`GlobalTransform.transform_point`]
     */
    transformPoint(point: Vec3) {
        point.set(this.scale * point);
        point.set(this.rotation * point);
        point.add(this.translation);
        return point;
    }

    isFinite() {
        return this.translation.is_finite() && this.rotation.is_finite() && this.scale.is_finite();
    }

    toIsometry() {
        return new Isometry3d(this.translation, this.rotation);
    }

    mulGlobal(global_transform: GlobalTransform) {
        return global_transform.mul(GlobalTransform.from(this));
    }

    mulVec3(value: Vec3) {
        return this.transformPoint(value);
    }
})

export type TransformTreeChanged = typeof TransformTreeChanged;
export const TransformTreeChanged = defineComponent(class TransformTreeChanged { })