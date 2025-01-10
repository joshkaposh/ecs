import { Option } from "joshkaposh-option";
import { Component, Event, EventRegistry, Events, Resource, Schedule, ScheduleBuildSettings, ScheduleLabel, Schedules, SystemInput, World } from "../ecs";
import { App, AppLabel } from "./app";
import { Plugin, Plugins, PluginsState } from "./plugin";
import { IntoSystemConfigs, IntoSystemSetConfigs } from "../ecs/schedule/config";
import { iter, Iterator } from "joshkaposh-iterator";
import { $Main, Main } from "./main_schedule";
import { IntoSystemSet } from "../ecs/schedule/set";

type ExtractFn = (world1: World, world2: World) => void;


export class SubApp {
    #world!: World;
    __plugin_registry: Plugin[];
    __plugin_names!: Set<any>;
    __plugin_build_depth!: number;
    __plugins_state: PluginsState;
    #extract: Option<ExtractFn>;
    update_schedule: Option<ScheduleLabel>;

    constructor(
        world = new World(),
        plugin_registry: Plugin[] = [],
        plugin_names: Set<any> = new Set(),
        plugins_state: PluginsState = PluginsState.Adding,
        plugin_build_depth: number = 0,
        update_schedule?: Option<ScheduleLabel>,
        extract?: Option<ExtractFn>,
    ) {
        this.#world = world;
        this.__plugin_registry = plugin_registry
        this.__plugin_names = plugin_names;
        this.__plugin_build_depth = plugin_build_depth;
        this.__plugins_state = plugins_state;
        this.#extract = extract;
        this.update_schedule = update_schedule;
        world.init_resource(Schedules);
    }

    static #memswap(self: SubApp, other: SubApp) {
        const extract = self.#extract;
        self.#extract = other.#extract;
        other.#extract = extract;
        const world = self.#world;
        self.#world = other.#world;
        other.#world = world;
        const plugin_registry = self.__plugin_registry;
        self.__plugin_registry = other.__plugin_registry;
        other.__plugin_registry = plugin_registry;

        const plugin_build_depth = self.__plugin_build_depth;
        self.__plugin_build_depth = other.__plugin_build_depth;
        other.__plugin_build_depth = plugin_build_depth;

        const plugin_names = self.__plugin_names;
        self.__plugin_names = other.__plugin_names;
        other.__plugin_names = plugin_names;

        const plugins_state = self.__plugins_state;
        self.__plugins_state = other.__plugins_state;
        other.__plugins_state = plugins_state;

        const update_schedule = self.update_schedule;
        self.update_schedule = other.update_schedule;
        other.update_schedule = update_schedule;
    }

    world() {
        return this.#world;
    }

    /**
     * This method is a workaround. Each `SubApp` can have its own plugins, but `Plugin`
     * works on an `App` as a whole
     */
    run_as_app(fn: (app: App) => void) {
        const app = App.empty();
        const main = app.main();
        SubApp.#memswap(this, main);
        fn(app);
        SubApp.#memswap(this, main);
    }

    run_default_schedule() {
        if (this.is_building_plugins()) {
            throw new Error('SubApp.run_default_schedule was called while a plugin was building.')
        }

        const label = this.update_schedule;
        if (label) {
            this.#world.run_schedule(label)
        }
    }

    update() {
        this.run_default_schedule();
        this.#world.clear_trackers();
    }

    /**
     * Extracts data from `world` into the app's world using the registered extract method
     * 
     * **NOTE** There is no default extract method! Calling extract() does nothing if SubApp.set_extract() has not been called.
     */
    extract(world: World) {
        this.#extract?.call(null, world, this.#world)
    }

    set_extract(extract: ExtractFn) {
        this.#extract = extract;
        return this;
    }

    /**
     * Take the function that will be called by extract out of the app
     * and replace it with `undefined`.
     * 
     * If you use jecs, `jecs_render` will set a default extract function used to extract data from
     * the main world into the render world as part of the Extract phase. In that case, you cannot replace it with your own function.
     * Instead, take the jecs default function and wrap it and then calling it.
     */
    take_extract(): Option<ExtractFn> {
        const extract = this.#extract;
        this.#extract = undefined;
        return extract;
    }

    init_resource(resource: Resource) {
        this.#world.init_resource(resource);
        return this;
    }

    insert_resource(resource: Resource) {
        this.#world.insert_resource(resource);
        return this;
    }

    add_systems(schedule: ScheduleLabel, ...systems: IntoSystemConfigs<any>[]) {
        const schedules = this.#world.resource(Schedules);
        schedules.add_systems(schedule, ...systems as any)
        return this;
    }

    register_system<I extends SystemInput, O, M>(system: IntoSystem<I, O, M>) {
        return this.#world.register_system(system);
    }

    configure_sets(schedule: ScheduleLabel, sets: IntoSystemSetConfigs<any>) {
        const schedules = this.#world.resource_mut(Schedules);
        schedules.configure_sets(schedule, sets);
        return this;
    }

    add_schedule(schedule: Schedule) {
        const schedules = this.#world.resource(Schedules);
        schedules.insert(schedule);
        return this
    }

    init_schedule(label: ScheduleLabel) {
        const schedules = this.#world.resource_mut(Schedules);
        if (!schedules.contains(label)) {
            schedules.insert(new Schedule(label))
        }
        return this;
    }

    get_schedule(label: ScheduleLabel): Option<Schedule> {
        return this.#world.resource(Schedules).get(label);
    }

    edit_schedule(label: ScheduleLabel, f: (schedule: Schedule) => void) {
        const schedules = this.#world.resource(Schedules);
        if (!schedules.contains(label)) {
            schedules.insert(new Schedule(label))
        }

        const schedule = schedules.get(label)!;
        f(schedule);

        return this;
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        this.#world.resource(Schedules).configure_schedules(schedule_build_settings);
        return this;
    }

    allow_ambiguous_component(type: Component) {
        this.#world.allow_ambiguous_component(type)
        return this;
    }

    allow_ambiguous_resource(type: Resource) {
        this.#world.allow_ambiguous_resource(type)
        return this;
    }

    ignore_ambiguity(label: ScheduleLabel, a: IntoSystemSet<any>, b: IntoSystemSet<any>) {
        const schedules = this.#world.resource_mut(Schedules);
        schedules.ignore_ambiguity(label, a, b);
        return this;
    }


    add_event(type: Event) {
        if (!EventRegistry.get_event(type as any)) {
            console.log('registering event type', type);

            EventRegistry.register_event(type, this.#world)
        }
        return this;
    }

    add_plugins(plugins: Plugins) {
        this.run_as_app(app => plugins.add_to_app(app))
        return this
    }

    is_plugin_added(plugin: Plugin) {
        return this.__plugin_names.has(plugin.name())
    }

    get_added_plugins() {
        return iter(this.__plugin_registry)
            .filter_map(p => p.downcast_ref())
            .collect()
    }

    is_building_plugins() {
        return this.__plugin_build_depth > 0;
    }

    /**
     * Return the state of this `Subapp`s plugins.
     */
    plugins_state() {
        let state = this.__plugins_state
        if (PluginsState.Adding === state) {
            state = PluginsState.Ready;
            const plugins = this.__plugin_registry;
            this.__plugin_registry = [];
            this.run_as_app(app => {
                for (let i = 0; i < plugins.length; i++) {
                    const plugin = plugins[i];
                    if (!plugin.ready(app)) {
                        state = PluginsState.Adding
                        return;
                    }
                }
            })
            this.__plugin_registry = plugins;
            return state;

        } else {
            return state;
        }
    }

    finish() {
        const plugins = this.__plugin_registry;
        this.__plugin_registry = [];
        this.run_as_app(app => {
            for (let i = 0; i < plugins.length; i++) {
                const plugin = plugins[i];
                plugin.finish(app);
            }
        })
        this.__plugin_registry = plugins;
        this.__plugins_state = PluginsState.Finished;
    }


    cleanup() {
        const plugins = this.__plugin_registry;
        this.__plugin_registry = [];
        this.run_as_app(app => {
            for (let i = 0; i < plugins.length; i++) {
                const plugin = plugins[i];
                plugin.cleanup(app);
            }
        })
        this.__plugin_registry = plugins;
        this.__plugins_state = PluginsState.Cleaned;
    }
}

export class SubApps {
    #main: SubApp;
    #sub_apps: Map<AppLabel, SubApp>;
    constructor(main: SubApp, sub_apps: Map<any, any>) {
        this.#main = main;
        this.#sub_apps = sub_apps;
    }

    get sub_apps() {
        return this.#sub_apps;
    }

    main() {
        return this.#main;
    }

    update() {
        this.#main.run_default_schedule();

        for (const [_label, sub_app] of this.#sub_apps.entries()) {
            sub_app.extract(this.#main.world());
            sub_app.update();
        }

        this.#main.world().clear_trackers();
    }

    iter(): Iterator<SubApp> {
        return iter.once(this.#main).chain(this.#sub_apps.values() as any);
    }

    [Symbol.iterator]() {
        return this.iter();
    }

    update_sub_app_by_label(label: AppLabel) {
        const sub_app = this.#sub_apps.get(label);
        if (sub_app) {
            sub_app.extract(this.#main.world());
            sub_app.update()
        }
    }
}