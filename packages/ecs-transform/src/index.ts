import { set } from 'define';
import { $PostStartup, $PostUpdate, App, Plugin } from 'ecs-app';
import { mark_dirty_trees, } from './systems';

export const TransformSystems = {
    Propagate: set()
} as const

export class TransformPlugin extends Plugin {
    build(app: App): void {
        if (process.env.reflect) {
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
}