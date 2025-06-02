import { Plugin, Plugins } from "./plugin";
import { App } from "./app";

export interface PluginGroup extends Plugins {
    build(): PluginGroupBuilder;
    name: string;
    set(plugin: Plugin): PluginGroupBuilder;
}

function PluginGroupInner(type: Partial<new () => PluginGroup>): PluginGroup {
    // @ts-expect-error
    type.name ??= type.constructor.name;
    // @ts-expect-error
    type.set ??= function set(plugin) {
        // @ts-expect-error
        return this.build!().set(plugin);
    }
    return type as PluginGroup;
}


export function PluginGroup(group: Record<PropertyKey, Plugin> | Plugin[]): PluginGroup {
    let name = 'PluginGroup(';
    if (Array.isArray(group)) {
        name = group.reduce((acc, plugin) => acc += `${plugin.name}`, '') + ')'
        return {
            name: name,
            build() {
                return this.build();
                // for (let i = 0; i < group.length; i++) {
                //     group[i].build()                    
                // }
            },

            set(plugin) {
                return this.build().set(plugin);
            },

            addToApp(app) {
                this.build().finish(app);
            },

        }
    } else {
        const plugins = [];
        for (const key in group) {
            const plugin = group[key];
            plugins.push(plugin);
            name += plugin.name;
        }
        name += ')'
        return {
            name: name,
            build() {
                return this.build();
            },
            set(plugin) {
                return this.build().set(plugin);
            },

            addToApp(app) {
                this.build().finish(app);
            },
        }
    }
}

interface PluginEntry {
    plugin: Plugin;
    enabled: boolean;
}

export class PluginGroupBuilder implements PluginGroup {
    #group_name: string;
    #plugins: Map<UUID, PluginEntry>;
    #order: UUID[];

    constructor(group_name: string, plugins: Map<UUID, PluginEntry>, order: UUID[]) {
        this.#group_name = group_name;
        this.#plugins = plugins;
        this.#order = order;
    }
    static start(group: PluginGroup) {
        return new PluginGroupBuilder(group.name, new Map(), []);
    }

    get order() {
        return this.#order;
    }

    addToApp(app: App): void {
        this.build().finish(app);
    }

    has(plugin: Plugin) {
        return this.#plugins.has(plugin.type_id);
    }

    enabled(plugin: Plugin) {
        return this.#plugins.get(plugin.type_id)?.enabled;
    }

    /**
     * @returns the index of the first occurrence of a value in an array, or -1 if it is not present.
     */
    indexOf(plugin: Plugin) {
        return this.#order.indexOf(plugin.type_id);
    }

    /**
     * insert the new plugin as enabled, and removes its previous ordering if it was already present
     */
    upsertPluginState(plugin: Plugin, added_at_index: number) {
        this.upsertPluginEntryState(
            plugin.type_id,
            {
                plugin,
                enabled: true
            },
            added_at_index
        )
    }

    upsertPluginEntryState(key: UUID, plugin: PluginEntry, added_at_index: number) {
        const entry = this.#plugins.get(key);
        if (entry?.enabled) {
            console.warn(`You are  replacing plugin ${entry.plugin.name} that was not disabled.`)
        }
        this.#plugins.set(key, plugin);

        const to_remove = this.#order.findIndex((ty) => ty === key);

        if (to_remove !== added_at_index && to_remove > -1) {
            this.#order.splice(to_remove, 1);
        }
    }

    get name(): string {
        return this.#group_name;
    }

    set(plugin: Plugin): PluginGroupBuilder {
        const error = this.trySet(plugin);
        if (Array.isArray(error)) {
            throw new Error(`${plugin.name} does not exist in this PluginGroup`);
        }

        return error;
        // return this.build().set(plugin);
    }

    trySet(plugin: Plugin): PluginGroupBuilder | [PluginGroupBuilder, Plugin] {
        const occupied = this.#plugins.get(plugin.type_id);
        if (occupied) {
            occupied.plugin = plugin;
            return this;
        } else {
            return [this, plugin];
        }
    }

    add(plugin: Plugin) {
        const target_index = this.#order.length;
        this.#order.push(plugin.type_id);
        this.upsertPluginState(plugin, target_index);
        return this;
    }

    tryAdd(plugin: Plugin) {
        return this.has(plugin) ? [this, plugin] : this.add(plugin);
    }

    /**
     * Adds a [`PluginGroup`] at the end of this [`PluginGroupBuilder`]. If the plugin was already in the group, it is removed from its previous place.
     */
    addGroup(group: PluginGroup) {
        const built = group.build();
        const plugins = built.#plugins;
        const order = built.#order;

        for (let i = 0; i < order.length; i++) {
            const plugin_id = order[i];
            const entry = plugins.get(plugin_id)!;
            plugins.delete(plugin_id);
            this.upsertPluginEntryState(plugin_id, entry, this.#order.length)
            this.#order.push(plugin_id);
        }
    }

    addBefore(target: Plugin, insert: Plugin) {
        const error = this.tryAddBeforeOverwrite(target, insert);
        if (Array.isArray(error)) {
            throw new Error(`Plugin does not exist in group ${target.name}`)
        }
        return error;
    }

    tryAddBefore(target: Plugin, insert: Plugin) {
        if (this.has(insert)) {
            return [this, insert]
        }

        return this.tryAddBeforeOverwrite(target, insert);
    }

    tryAddBeforeOverwrite(target: Plugin, insert: Plugin) {
        const target_index = this.indexOf(target);

        if (target_index === -1) {
            return [this, insert];
        } else {
            this.#order.splice(target_index, 0, insert.type_id);
            this.upsertPluginState(insert, target_index);
            return this;
        }
    }

    addAfter(target: Plugin, insert: Plugin) {
        const error = this.tryAddAfterOverwrite(target, insert);
        if (error) {

        }
    }

    tryAddAfter(target: Plugin, insert: Plugin) {
        return this.#plugins.has(insert.type_id) ? [this, insert] : this.tryAddAfterOverwrite(target, insert);
    }

    tryAddAfterOverwrite(target: Plugin, insert: Plugin) {
        const target_index_ = this.indexOf(target);
        if (target_index_ === -1) {
            return [this, insert]
        } else {
            const target_index = target_index_ + 1;
            this.#order.splice(target_index, 0, insert.type_id);
            this.upsertPluginState(insert, target_index);
            return this;
        }
    }

    /**
     * Enables a [`Plugin`]
     * 
     * [`Plugin`]s within a [`PluginGroup`] are enabled by default. This function is used to
     * opt back in to a  [`Plugin`] after disabling it.
     * 
     * @throws If there are no plugins that match `plugin` in this group, it will panic.
     */
    enable(plugin: Plugin) {
        const plugin_entry = this.#plugins.get(plugin.type_id);
        if (!plugin_entry) {
            throw new Error('Cannot enable a plugin that does not exist.');
        }
        plugin_entry.enabled = true;
        return this;
    }

    disable(plugin: Plugin) {
        const plugin_entry = this.#plugins.get(plugin.type_id);
        if (!plugin_entry) {
            throw new Error('Cannot disable a plugin that does not exist.');
        }
        plugin_entry.enabled = false;
        return this;
    }

    finish(app: App) {
        for (let i = 0; i < this.#order.length; i++) {
            const ty = this.#order[i];
            const entry = this.#plugins.get(ty);
            this.#plugins.delete(ty);
            if (entry?.enabled) {
                try {
                    app.addPlugin(entry.plugin);
                } catch (error) {
                    throw new Error(`Error adding plugin ${entry.plugin.name} in group ${this.#group_name}: plugin was already added in application`);
                }
            }
        }
    }

    build(): PluginGroupBuilder {
        return this;
    }

}

export const NoopPluginGroup = PluginGroupInner({
    build() {
        return PluginGroupBuilder.start(NoopPluginGroup);
    }
})
