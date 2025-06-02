import { App } from "./app";
import { v4 } from "uuid";

export interface Plugin {
    readonly name: string;
    readonly type_id?: UUID;


    build(app: App): void;

    ready?(app: App): boolean;
    finish?(app: App): void;
    cleanup?(app: App): void;

    addToApp?(app: App): void;

    /**
     * @description
     * If the plugin can be meaninfully instantiated several times in an [`App`],
     * override this method to return `false`.
     */
    isUnique?(): boolean;
}

export function Plugin<T extends Plugin>(plugin: Partial<T> & { build(app: App): void; name: string }): Required<Plugin> & T {
    // @ts-expect-error
    plugin.type_id ??= v4() as UUID;

    plugin.ready ??= function ready(_app: App) {
        return true
    }

    plugin.finish ??= function finish(_app: App) { }

    plugin.cleanup ??= function cleanup(_app: App) { }

    plugin.isUnique ??= function isUnique() {
        return true;
    }
    plugin.addToApp ??= function addToApp(app: App) {
        try {
            app.addPlugin(this as Required<Plugin>);
        } catch (error) {
            throw new Error(`Error adding plugin ${this.name} : plugin was already added in application`);
        }
    }

    return plugin as Required<Plugin> & T;
}

export type PluginsState = 0 | 1 | 2 | 3;
export const PluginsState = {
    Adding: 0,
    Ready: 1,
    Finished: 2,
    Cleaned: 3
} as const

export type PlaceholderPlugin = typeof PlaceholderPlugin;
export const PlaceholderPlugin = Plugin({
    name: 'PlaceHolderPlugin',
    build() { }
})

/**
 * Types that represent a set of [`Plugin`]s.
 * 
 * This is implemented for all types which implement [`Plugin`], [`PluginGroup`], and tuples over [`Plugins`].
 */
export interface Plugins {
    addToApp(app: App): void;
}