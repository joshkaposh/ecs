import { ErrorExt, Option } from "joshkaposh-option";
import { defineEvent } from 'define';
import type { Component, Resource } from "ecs/src/component";
import { Event, EventCursor, Events } from "ecs/src/event";
import type { Schedule, ScheduleBuildSettings, ScheduleLabel, SystemSet, Chain, IntoScheduleConfig, Schedulable } from "ecs/src/schedule";
import type { IntoSystem, SystemInput } from "ecs/src/system";
import { PlaceholderPlugin, Plugin, Plugins, PluginsState } from "./plugin";
import { SubApp, SubApps } from "./sub-app";
import { $First, $Main, MainSchedulePlugin } from "./main-schedule";
import { event_update_condition, event_update_system, EventUpdates } from "./update-events";

type AppExit = InstanceType<typeof AppExit>;
const AppExit = defineEvent(class AppExit {
    #ty: 0 | 1;
    // @ts-ignore
    #err?: number;
    constructor(ty: 0 | 1, err?: number) {
        this.#ty = ty;
        this.#err = err;
    }
    static Success() {
        return new AppExit(0)
    }

    static Error(data: number) {
        return new AppExit(1, data)
    }

    static error() {
        return AppExit.Error(1);
    }

    clone() {
        return new AppExit(this.#ty, this.#err);
    }

    is_success() {
        return this.#ty === 0;
    }

    is_error() {
        return this.#ty === 1;
    }

    static from_code(code: number) {
        if (code === 0) {
            return this.Error(code);
        } else {
            return this.Success();
        }
    }

});

export { AppExit }

export type AppLabel = string;

export type AppError = ErrorExt<string>
export function AppError(plugin_name: string) {
    return new ErrorExt(plugin_name)
}


function run_once(app: App): AppExit {
    app.finish();
    app.cleanup();

    app.update();
    return app.shouldExit() ?? AppExit.Success();
}

export class App {
    #sub_apps: SubApps;
    #runner: (app: App) => AppExit
    constructor(sub_apps: SubApps = new SubApps(), runner: (app: App) => AppExit = run_once) {
        this.#sub_apps = sub_apps;
        this.#runner = runner;
    }

    get __sub_apps() {
        return this.#sub_apps;
    }

    set __sub_apps(sub_apps: SubApps) {
        this.#sub_apps = sub_apps;
    }

    static default() {
        const app = new App();
        app.#sub_apps.main.update_schedule = $Main

        app.addPlugin(new MainSchedulePlugin());
        app.addSystems($First,
            event_update_system.inSet(EventUpdates).runIf(event_update_condition)
            // event_update_system.inSet(EventUpdates)
            // .runIf(event_update_condition)
        )

        app.addEvent(AppExit);
        return app;
    }

    get world() {
        return this.main.world;
    }

    get main() {
        return this.#sub_apps.main;
    }

    update() {
        if (this.isBuildingPlugins()) {
            throw new Error('App.update() was called while a plugin was building.')
        }

        this.#sub_apps.update();
    }

    run() {
        if (this.isBuildingPlugins()) {
            throw new Error('App.run() was called while a plugin was building.')
        }

        const runner = this.#runner;
        this.#runner = run_once;
        const app = this;

        app.finish();
        app.cleanup();


        // const empty = new App();

        // app.#runner = empty.#runner;
        // app.#sub_apps = empty.#sub_apps


        // this.#runner(this);
        // this.#runner = run_once;
        return runner(app);
    }

    setRunner(runner: (app: App) => AppExit) {
        this.#runner = runner;
        return this;
    }

    pluginsState() {
        let overall_plugins_state = this.main.__plugins_state;
        if (PluginsState.Adding === overall_plugins_state) {
            const main = this.main;
            let state = PluginsState.Ready as PluginsState;
            const plugins = main.__plugin_registry;
            main.__plugin_registry = [];
            for (let i = 0; i < plugins.length; i++) {
                if (!plugins[i].ready(this)) {
                    state = PluginsState.Adding;
                    break;
                }

            }

            this.main.__plugin_registry = plugins;
            overall_plugins_state = state;
        }
        this.#sub_apps.iter().skip(1).for_each(s => {
            overall_plugins_state = Math.min(overall_plugins_state, s.pluginsState()) as PluginsState;
        })

        return overall_plugins_state;
    }

    finish() {
        const main = this.main;
        const plugins = main.__plugin_registry;

        main.__plugin_registry = [];
        for (let i = 0; i < plugins.length; i++) {
            plugins[i].finish(this);
        }

        main.__plugin_registry = plugins;
        main.__plugins_state = PluginsState.Finished;
        this.#sub_apps.iter().skip(1).for_each(s => s.finish())
    }

    cleanup() {
        const main = this.main;
        const plugins = main.__plugin_registry;
        main.__plugin_registry = [];
        for (let i = 0; i < plugins.length; i++) {
            plugins[i].cleanup(this);
        }

        main.__plugin_registry = plugins;
        main.__plugins_state = PluginsState.Cleaned;
        this.#sub_apps.iter().skip(1).for_each(s => s.cleanup())
    }

    isBuildingPlugins() {
        return this.#sub_apps.iter().any(s => s.isBuildingPlugins())
    }

    addSystems(schedule: ScheduleLabel, systems: IntoScheduleConfig<Schedulable>) {
        this.main.addSystems(schedule, systems);
        return this;
    }

    registerSystem<I extends SystemInput, O>(_input: I, system: IntoSystem<I, O>) {
        return this.main.registerSystem(system);
    }

    configureSets(schedule: ScheduleLabel, sets: IntoScheduleConfig<Schedulable<SystemSet, Chain>>) {
        this.main.configureSets(schedule, sets);
        return this;
    }

    addEvent(type: Event) {
        this.main.addEvent(type);
        return this;
    }

    getEvent<E extends Event>(type: E): Option<Events<E>> {
        return this.world.getResource(type);
    }

    event<E extends Event>(type: E): Events<E> {
        const event = this.getResource(type)
        if (!event) {
            throw new Error(`Expecting event ${type.name} to exist in World, but it does not. Did you forget to initialize this Resource? Resources are also implicitly added by App.add_event()`)
        }
        return event;
    }

    insertResource(resource: Resource) {
        this.main.insertResource(resource);
        return this;
    }

    initResource(resource: Resource) {
        this.main.initResource(resource);
        return this;
    }

    getResource<T extends Resource>(resource: T) {
        return this.world.getResource(resource);
    }

    resource<T extends Resource>(resource: T) {
        const res = this.getResource(resource);
        if (!res) {
            throw new Error(`Expecting Resource ${resource.name} to exist in World, but it does not. Did you forget to initialize this Resource?`)
        }
        return res;
    }


    addPlugin(plugin: Plugin): App {
        // addPlugin(plugin: Plugin): Result<this, ErrorExt<AppError>> {
        if (plugin.is_unique() && this.main.__plugin_names.has(plugin.name)) {
            throw AppError(plugin.name)
        }

        const index = this.main.__plugin_registry.length;
        this.main.__plugin_registry.push(new PlaceholderPlugin());
        this.main.__plugin_build_depth += 1;

        let result;
        try {
            plugin.build(this)
        } catch (error) {
            result = error
        }

        this.main.__plugin_names.add(plugin.name);
        this.main.__plugin_build_depth -= 1;


        if (result) {
            throw result;
        }

        this.main.__plugin_registry[index] = plugin;
        return this;
    }

    addPlugins(plugins: Plugins) {
        const s = this.pluginsState();
        if (PluginsState.Cleaned === s ||
            PluginsState.Finished === s
        ) {
            throw new Error('Plugins cannot be added after App.cleanup() or App.finish() has been called')
        }

        plugins.addToApp(this);
        return this;
    }

    isPluginAdded(plugin: Plugin) {
        return this.main.isPluginAdded(plugin)
    }

    getAddedPlugins(plugin: Plugin) {
        // @ts-expect-error
        return this.main.getAddedPlugins(plugin)
    }

    registerRequiredComponents(c: Component, r: Component) {
        this.world.registerRequiredComponents(c, r);
        return this;
    }

    registerRequiredComponentsWith<T extends Component>(c: T, ctor: new () => InstanceType<T>) {
        this.world.registerRequiredComponentsWith(c, ctor);
        return this;
    }

    subApp(label: AppLabel) {
        const sub_app = this.getSubApp(label);
        if (!sub_app) {
            throw new Error(`No sub-app with label ${label} exists.`)
        }
        return sub_app;
    }

    getSubApp(label: AppLabel) {
        return this.#sub_apps.sub_apps.get(label);
    }

    insertSubApp(label: AppLabel, app: SubApp) {
        return this.#sub_apps.sub_apps.set(label, app);
    }

    removeSubApp(label: AppLabel) {
        const subapps = this.#sub_apps.sub_apps;
        if (subapps.has(label)) {
            const app = subapps.get(label);
            subapps.delete(label);
            return app;
        } else {
            return
        }
    }

    updateSubAppByLabel(label: AppLabel) {
        this.#sub_apps.updateSubAppByLabel(label);
    }

    addSchedule(label: Schedule) {
        this.main.addSchedule(label);
        return this;
    }

    initSchedule(label: ScheduleLabel) {
        this.main.initSchedule(label);
        return this;
    }

    getSchedule(label: ScheduleLabel) {
        return this.main.getSchedule(label);
    }

    editSchedule(label: ScheduleLabel, f: (schedule: Schedule) => void) {
        this.main.editSchedule(label, f);
        return this;
    }

    configureSchedules(schedule_build_settings: ScheduleBuildSettings) {
        this.main.configureSchedules(schedule_build_settings);
        return this;
    }

    shouldExit(): Option<AppExit> {
        const reader = new EventCursor(AppExit);
        const _events = this.world.getResource(AppExit);

        if (!_events) {
            console.warn('Exitting early as AppExit events does not exist');
            return
        }
        const events = reader.read(_events as any);

        if (events.length !== 0) {
            return events.find(exit => exit.is_error()) ?? AppExit.Success();
        }

        return;
    }
}