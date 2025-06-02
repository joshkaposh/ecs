import { defineComponent } from 'define';

export const Camera2d = defineComponent(class Camera2d { }, {
    required: [
        Camera,
        DebandDither,
        new CameraRenderGraph(Core2d),
        Projection.Orthographic(OrthographicProjection.default_2d()),
        // Frustum:OrthoGraphicProjection.default_2d().compute_frustum(GlobalTransform.from(new Transform())),
        // Tonemapping: null
    ]
});