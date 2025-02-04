import { App } from "./app";
import { ErrorExt, is_error } from "joshkaposh-option";
import { v4 } from "uuid";

export abstract class Plugin {

    static readonly type_id: UUID;

    abstract build(app: App): void;

    ready(_app: App): boolean {
        return true
    }

    finish(_app: App) { }

    cleanup(_app: App) { }

    name(): string {
        return this.constructor.name;
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
        const err = app.add_plugin(this);
        if (err instanceof ErrorExt) {
            const plugin_name = err.get();
            throw new Error(`Error adding plugin ${plugin_name} : plugin was already added in application`)
        };

    }
}

export type PluginsState = 0 | 1 | 2 | 3;
export const PluginsState = {
    Adding: 0,
    Ready: 1,
    Finished: 2,
    Cleaned: 3
} as const

export class PlaceholderPlugin extends Plugin {
    build() { }
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

