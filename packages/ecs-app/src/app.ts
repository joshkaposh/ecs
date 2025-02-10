import { ErrorExt, Option, Result } from "joshkaposh-option";
import { Component, Resource } from "ecs/src/component";
import { PlaceholderPlugin, Plugin, Plugins, PluginsState } from "./plugin";
import { Schedule, ScheduleBuildSettings, ScheduleLabel } from "ecs/src/schedule";
import { Event, EventCursor, Events } from "ecs/src/event";
import { IntoSystemConfigs, IntoSystemSetConfigs } from "ecs/src/schedule/config";
import { SubApp, SubApps } from "./sub_app";
import { $First, $Main, MainSchedulePlugin } from "./main_schedule";
import { define_event } from "define";
import { event_update_condition, event_update_system } from "ecs/src/event/update";
import { SystemInput } from "ecs";

type States = any;

export class AppExit {
    #ty: 0 | 1;
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

}
define_event(AppExit);

export type AppLabel = string;

export type AppError = { plugin_name: string }
export const AppError = {
    DuplicatePlugin(plugin_name: string) {
        return new ErrorExt({ plugin_name: plugin_name })
    }
}

function run_once(app: App): AppExit {
    app.finish();
    app.cleanup();

    app.update();

    return app.should_exit() ?? AppExit.Success();
}
type RunnerFn = (app: App) => AppExit;

export class App {
    #sub_apps: SubApps;
    #runner: RunnerFn
    constructor(
        sub_apps: SubApps,
        runner: RunnerFn
    ) {
        this.#sub_apps = sub_apps;
        this.#runner = runner;
    }

    get __sub_apps() {
        return this.#sub_apps;
    }

    set __sub_apps(sub_apps: SubApps) {
        this.#sub_apps = sub_apps;
    }

    static new() {
        return App.default();
    }

    static default() {
        const app = App.empty();
        app.#sub_apps.main().update_schedule = $Main

        app.add_plugins(new MainSchedulePlugin());
        app.add_systems($First,
            event_update_system
                .run_if(event_update_condition)
        )

        app.add_event(AppExit);
        return app;
    }

    static empty() {
        return new App(
            new SubApps(new SubApp(), new Map()),
            run_once
        )
    }

    update() {
        if (this.is_building_plugins()) {
            throw new Error('App.update() was called while a plugin was building.')
        }

        this.#sub_apps.update();
    }

    run() {
        if (this.is_building_plugins()) {
            throw new Error('App.run() was called while a plugin was building.')
        }


        // const runner = this.#runner;
        // this.#runner = run_once;

        // const empty = App.empty();
        // const app = this;

        // app.#runner = empty.#runner;
        // app.#sub_apps = empty.#sub_apps


        this.#runner(this);
        // return (runner)(app);
        // return this.#runner(this);
    }

    set_runner(runner: (app: App) => AppExit) {
        this.#runner = runner;
        return this;
    }

    plugins_state() {
        let overall_plugins_state = this.main().__plugins_state;
        if (PluginsState.Adding === overall_plugins_state) {
            const main = this.main();
            let state = PluginsState.Ready as PluginsState;
            const plugins = main.__plugin_registry;
            main.__plugin_registry = [];
            for (let i = 0; i < plugins.length; i++) {
                if (!plugins[i].ready(this)) {
                    state = PluginsState.Adding;
                    break;
                }

            }

            this.main().__plugin_registry = plugins;
            overall_plugins_state = state;
        }
        this.#sub_apps.iter().skip(1).for_each(s => {
            overall_plugins_state = Math.min(overall_plugins_state, s.plugins_state()) as PluginsState;
        })

        return overall_plugins_state;
    }

    finish() {
        const main = this.main();
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
        const main = this.main();
        const plugins = main.__plugin_registry;
        main.__plugin_registry = [];
        for (let i = 0; i < plugins.length; i++) {
            plugins[i].cleanup(this);
        }

        main.__plugin_registry = plugins;
        main.__plugins_state = PluginsState.Cleaned;
        this.#sub_apps.iter().skip(1).for_each(s => s.cleanup())
    }

    is_building_plugins() {
        return this.#sub_apps.iter().any(s => s.is_building_plugins())
    }

    add_systems(schedule: ScheduleLabel, ...systems: (IntoSystemConfigs<any> | IntoSystemSetConfigs<any>)[]) {
        this.main().add_systems(schedule, ...systems);
        return this;
    }

    register_system<I extends SystemInput, O, M>(input: I, system: IntoSystem<I, O, M>) {
        return this.main().register_system(system);
    }

    configure_sets(schedule: ScheduleLabel, sets: IntoSystemSetConfigs<any>) {
        this.main().configure_sets(schedule, sets);
        return this;
    }

    add_event(type: Event) {
        this.main().add_event(type);
        return this;
    }

    get_event<E extends Event>(type: E): Option<Events<E>> {
        return this.world().get_resource(type.ECS_EVENTS_TYPE);
    }

    event<E extends Event>(type: E): Events<E> {
        const event = this.world().get_resource(type.ECS_EVENTS_TYPE);
        if (!event) {
            throw new Error(`Expecting event ${type.name} to exist in World, but it does not. Did you forget to initialize this Resource? Resources are also implicitly added by App.add_event()`)
        }
        return event;
    }

    insert_resource(resource: Resource) {
        this.main().insert_resource(resource);
        return this;
    }

    init_resource(resource: Resource) {
        this.main().init_resource(resource);
        return this;
    }

    add_plugin(plugin: Plugin): Result<this, ErrorExt<AppError>> {
        if (plugin.is_unique() && this.main().__plugin_names.has(plugin.name())) {
            return new ErrorExt(AppError.DuplicatePlugin(plugin.name()))
        }

        const index = this.main().__plugin_registry.length;
        this.main().__plugin_registry.push(new PlaceholderPlugin());
        this.main().__plugin_build_depth += 1;

        let result;
        try {
            plugin.build(this)
        } catch (error) {
            result = error
        }

        this.main().__plugin_names.add(plugin.name());
        this.main().__plugin_build_depth -= 1;


        if (result) {
            throw result;
        }

        this.main().__plugin_registry[index] = plugin;
        return this;
    }

    add_plugins(plugins: Plugins) {
        const s = this.plugins_state();
        if (PluginsState.Cleaned === s ||
            PluginsState.Finished === s
        ) {
            throw new Error('Plugins cannot be added after App.cleanup() or App.finish() has been called')
        }

        plugins.add_to_app(this);
        return this;
    }

    is_plugin_added(plugin: Plugin) {
        return this.main().is_plugin_added(plugin)
    }

    get_added_plugins(plugin: Plugin) {
        return this.main().get_added_plugins(plugin)
    }

    register_required_components(c: Component, r: Component) {
        this.world().register_required_components(c, r);
        return this;
    }

    register_required_components_with(c: Component, ctor: () => Component) {
        this.world().register_required_components_with(c, ctor);
        return this;
    }

    world() {
        return this.main().world();
    }

    main() {
        return this.#sub_apps.main();
    }

    sub_app(label: AppLabel) {
        const sub_app = this.get_sub_app(label);
        if (!sub_app) {
            throw new Error(`No sub-app with label ${label} exists.`)
        }
        return sub_app;
    }

    get_sub_app(label: AppLabel) {
        return this.#sub_apps.sub_apps.get(label);
    }

    insert_sub_app(label: AppLabel, app: SubApp) {
        return this.#sub_apps.sub_apps.set(label, app);
    }

    remove_sub_app(label: AppLabel) {
        const subapps = this.#sub_apps.sub_apps;
        if (subapps.has(label)) {
            const app = subapps.get(label);
            subapps.delete(label);
            return app;
        } else {
            return
        }
    }

    update_sub_app_by_label(label: AppLabel) {
        this.#sub_apps.update_sub_app_by_label(label);
    }

    add_schedule(label: Schedule) {
        this.main().add_schedule(label);
        return this;
    }

    init_schedule(label: ScheduleLabel) {
        this.main().init_schedule(label);
        return this;
    }

    get_schedule(label: ScheduleLabel) {
        return this.main().get_schedule(label);
    }

    edit_schedule(label: ScheduleLabel, f: (schedule: Schedule) => void) {
        this.main().edit_schedule(label, f);
        return this;
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        this.main().configure_schedules(schedule_build_settings);
        return this;
    }

    should_exit(): Option<AppExit> {
        const reader = new EventCursor()
        const _events = this.world().get_resource(AppExit.ECS_EVENTS_TYPE);

        if (!_events) {
            console.warn('Exitting early as AppExit events does not exist');
            return
        }
        const events = reader.read(_events);
        if (events.len() !== 0) {
            return events.find(exit => exit.is_error()) ?? AppExit.Success()
        }

        return;
    }
}