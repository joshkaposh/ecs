import { definePlugin } from 'define';
import { $PreStartup } from 'ecs-app';
import { Canvas, resize_canvas } from './canvas';
import { Render2d } from './render2d';

export const Render2dPlugin = definePlugin({
    name: 'Render2dPlugin',
    build(app) {
        app
            .initResource(Canvas)
            .initResource(Render2d)
            .addSystems($PreStartup, resize_canvas)
    }
});


export const Render3dPlugin = definePlugin({
    name: 'Render3dPlugin',
    build() { }
});

export const RenderPlugin = import.meta.env.RENDER_2D ? Render2dPlugin : Render3dPlugin;