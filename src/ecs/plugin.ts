import { TODO } from "joshkaposh-iterator/src/util";
import { App } from "../ecs-app";
import { is_error } from "joshkaposh-option";
import { v4 } from "uuid";

// type PluginGroup = any;
// impl<P: PluginGroup> Plugins<PluginGroupMarker> for P {
//     #[track_caller]
//     fn add_to_app(self, app: &mut App) {
//         self.build().finish(app);
//     }
// }

// type AppError = any;
// const AppError = {
//     DuplicatePlugin(data: any): { plugin_name: string } {
//         return TODO();
//     }
// }

export abstract class Plugin {

    static readonly type_id: UUID;
    abstract readonly type_id: UUID;


    abstract build(app: App): void;

    ready(_app: App): boolean {
        return true
    }

    finish(_app: App) { }

    cleanup(_app: App) { }


    name(): string {
        return TODO('Plugin::name()')
    }

    /**
     * @description
     * If the plugin can be meaninfully instantiated several times in an [`App`],
     * override this method to return `false`.
     */
    is_unique() {
        return true
    }

    add_to_app(app: App) {
        const err = app.add_plugins(this);
        if (is_error(err)) {
            const plugin_name = err.get();
            throw new Error(`Error adding plugin ${plugin_name} : plugin was already added in application`)
        }
    }
}

export type Plugins = {
    add_to_app(app: App): void;
}

export function PluginFromFn(fn: (app: App) => void): typeof Plugin {
    class PluginFn extends Plugin {
        static readonly type_id = v4() as UUID;
        readonly type_id = PluginFn.type_id;
        build(app: App): void {
            fn(app);
        }
    }


    return PluginFn
}

