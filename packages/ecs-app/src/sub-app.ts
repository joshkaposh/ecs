import { Option } from "joshkaposh-option";
import { iter, Iterator } from "joshkaposh-iterator";
import { TODO } from 'joshkaposh-iterator/src/util';
import { Component, Event, EventRegistry, IntoSystem, Resource, Schedule, ScheduleBuildSettings, ScheduleLabel, Schedules, SystemInput, World } from "ecs";
// import { ECS_EVENTS_TYPE } from "define";
import { App, AppLabel } from "./app";
import { Plugin, Plugins, PluginsState } from "./plugin";
// import { $Main, Main } from "./main_schedule";
import { IntoSystemSet, SystemSet } from "ecs/src/schedule/set";
// import { MainScheduleOrder } from "./main_schedule";
import { IntoScheduleConfig, Schedulable } from "ecs/src/schedule/config";
import { Chain } from "ecs/src/schedule/schedule";
import { DiagnosticStore, type Diagnostic } from 'ecs-diagnostic';

type GetTypeRegistration = any;

type ExtractFn = (world1: World, world2: World) => void;

export class SubApp {
    #world!: World;
    __plugin_registry: Required<Plugin>[];
    __plugin_names!: Set<any>;
    __plugin_build_depth!: number;
    __plugins_state: PluginsState;
    #extract: Option<ExtractFn>;
    update_schedule: Option<ScheduleLabel>;

    constructor(
        world = new World(),
        plugin_registry: Required<Plugin>[] = [],
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
        world.initResource(Schedules as any);
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

    get world() {
        return this.#world;
    }

    /**
     * This method is a workaround. Each `SubApp` can have its own plugins, but `Plugin`
     * works on an `App` as a whole
     */
    runAsApp(fn: (app: App) => void) {
        const app = new App();
        const main = app.main;
        SubApp.#memswap(this, main);
        fn(app);
        SubApp.#memswap(this, main);
    }

    runDefaultSchedule() {
        if (this.isBuildingPlugins()) {
            throw new Error('SubApp.run_default_schedule was called while a plugin was building.')
        }

        const label = this.update_schedule;
        if (label) {
            this.#world.runSchedule(label)
        }
    }

    update() {
        this.runDefaultSchedule();
        this.#world.clearTrackers();
    }

    /**
     * Extracts data from `world` into the app's world using the registered extract method
     *
     * **NOTE** There is no default extract method! Calling extract() does nothing if SubApp.set_extract() has not been called.
     */
    extract(world: World) {
        this.#extract?.call(null, world, this.#world)
    }

    setExtract(extract: ExtractFn) {
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
    takeExtract(): Option<ExtractFn> {
        const extract = this.#extract;
        this.#extract = undefined;
        return extract;
    }

    initResource(resource: Resource) {
        this.#world.initResource(resource);
        return this;
    }

    insertResource(resource: Resource) {
        this.#world.insertResource(resource);
        return this;
    }

    addSystems(schedule: ScheduleLabel, systems: IntoScheduleConfig<Schedulable>) {
        this.#world.resource(Schedules).addSystems(schedule, systems)
        return this;
    }

    registerSystem<In extends SystemInput, Out>(system: IntoSystem<In, Out>) {
        return this.#world.registerSystem(system);
    }

    configureSets(schedule: ScheduleLabel, sets: IntoScheduleConfig<Schedulable<SystemSet, Chain>>) {
        const schedules = this.#world.resourceMut(Schedules).v;
        schedules.configureSets(schedule, sets as any);
        return this;
    }

    addSchedule(schedule: Schedule) {
        const schedules = this.#world.resource(Schedules);
        schedules.insert(schedule);
        return this
    }

    initSchedule(label: ScheduleLabel) {
        const schedules = this.#world.resourceMut(Schedules).v;
        if (!schedules.has(label)) {
            schedules.insert(new Schedule(label))
        }
        return this;
    }

    getSchedule(label: ScheduleLabel): Option<Schedule> {
        return this.#world.resource(Schedules).get(label);
    }

    editSchedule(label: ScheduleLabel, f: (schedule: Schedule) => void) {
        const schedules = this.#world.resource(Schedules) as any;
        if (!schedules.has(label)) {
            schedules.insert(new Schedule(label))
        }

        const schedule = schedules.get(label)!;
        f(schedule);

        return this;
    }

    configureSchedules(schedule_build_settings: ScheduleBuildSettings) {
        this.#world.resource(Schedules).configureSchedules(schedule_build_settings);
        return this;
    }

    allowAmbiguousComponent(type: Component) {
        TODO('App.allowAmbiguousComponent() -- this.#world.allowAmbiguousComponent(type)', type)
        // this.#world.allowAmbiguousComponent(type)
        return this;
    }

    allowAmbiguousResource(type: Resource) {
        TODO('App.allowAmbiguousResource() -- this.#world.allowAmbiguousResource(type)', type)
        // this.#world.allowAmbiguousResource(type)
        return this;
    }

    ignoreAmbiguity(label: ScheduleLabel, a: IntoSystemSet, b: IntoSystemSet) {
        const schedules = this.#world.resourceMut(Schedules) as any;
        schedules.v.ignoreAmbiguity(label, a, b);
        return this;
    }

    addEvent(type: Event) {
        if (!this.#world.hasResource(type)) {
            EventRegistry.registerEvent(type, this.#world)
        }

        return this;
    }

    registerType<T extends GetTypeRegistration>(_type: T) {
        // const registry = this.#world.resourceMut(AppTypeRegistry);
        // registry.write().register(type);
        return this;
    }

    registerTypeData(_type: any, _data: any) {
        // const registry = this.#world.resourceMut(AppTypeRegistry);
        // registry.write().registerTypeData(type, data);
        return this;
    }

    registerFunction<T extends any>(_type: T) {
        // const registry = this.#world.resourceMut(AppFunctionRegistry);
        // registry.write().register(type);
        return this;
    }

    registerDiagnostic(diagnostic: Diagnostic) {
        this.initResource(DiagnosticStore);
        this.world.resourceMut(DiagnosticStore).v.add(diagnostic);
        return this;
    }

    addPlugins(plugins: Plugins) {
        this.runAsApp(app => plugins.addToApp(app))
        return this
    }

    isPluginAdded(plugin: Plugin) {
        return this.__plugin_names.has(plugin.name)
    }

    getAddedPlugins() {
        return Array.from(this.__plugin_registry)
    }

    isBuildingPlugins() {
        return this.__plugin_build_depth > 0;
    }

    /**
     * Return the state of this `Subapp`s plugins.
     */
    pluginsState() {
        let state = this.__plugins_state
        if (PluginsState.Adding === state) {
            state = PluginsState.Ready;
            const plugins = this.__plugin_registry;
            this.__plugin_registry = [];
            this.runAsApp(app => {
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
        this.runAsApp(app => {
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
        this.runAsApp(app => {
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
    constructor(main: SubApp = new SubApp(), sub_apps: Map<any, any> = new Map()) {
        this.#main = main;
        this.#sub_apps = sub_apps;
    }

    get sub_apps() {
        return this.#sub_apps;
    }

    get main() {
        return this.#main;
    }

    update() {
        this.#main.runDefaultSchedule();

        for (const [_label, sub_app] of this.#sub_apps.entries()) {
            sub_app.extract(this.#main.world);
            sub_app.update();
        }

        this.#main.world.clearTrackers();
    }

    iter(): Iterator<SubApp> {
        return iter.once(this.#main).chain(this.#sub_apps.values() as any);
    }

    [Symbol.iterator]() {
        return this.iter();
    }

    updateSubAppByLabel(label: AppLabel) {
        const sub_app = this.#sub_apps.get(label);
        if (sub_app) {
            sub_app.extract(this.#main.world);
            sub_app.update()
        }
    }
}