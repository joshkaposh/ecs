import { $PreStartup, Plugin } from 'ecs-app';
import { Canvas, resize_canvas } from './canvas';
import { Render2d } from './render2d';

export const Render2dPlugin = Plugin({
    name: 'Render2dPlugin',
    build(app) {
        app
            .initResource(Canvas)
            .initResource(Render2d)
            .addSystems($PreStartup, resize_canvas)
    }
})