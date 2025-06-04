import { definePlugin, set } from 'define';
import { $PostStartup, $PostUpdate, App } from 'ecs-app';
import { mark_dirty_trees, propagate_parent_transforms, sync_simple_transforms, } from './systems';
import { Transform, TransformTreeChanged } from './transform';
import { GlobalTransform } from './global-transform';

export const TransformSystems = {
    Propagate: set()
} as const


export const TransformPlugin = definePlugin({
    name: 'TransformPlugin',
    build(app: App): void {
        if (import.meta.env.reflect) {
            app
                .registerType(Transform)
                .registerType(TransformTreeChanged)
                .registerType(GlobalTransform);
        }

        app.addSystems($PostStartup, set(
            mark_dirty_trees,
            propagate_parent_transforms,
            sync_simple_transforms
        )
            .chain()
            .inSet(TransformSystems.Propagate)
        )
            .addSystems($PostUpdate, set(
                mark_dirty_trees,
                propagate_parent_transforms,
                // TODO: adjust the internal queries to make this system more efficiently share and fill CPU time. 
                sync_simple_transforms
            )
                .chain()
                .inSet(TransformSystems.Propagate)
            )
    }
});
