import { ErrorExt, Option, Result, is_error, is_some } from "joshkaposh-option";
import { Component, Resource } from "../ecs/component";
import { Plugin, Plugins } from "../ecs/plugin";
import { Schedule, ScheduleBuildSettings, ScheduleLabel, Schedules } from "../ecs/schedule";
import { World } from "../ecs/world";
import { Event } from "../ecs/event";
import { IntoSytemSetConfigs } from "../ecs/schedule/config";
import { SubApp, SubApps } from "./sub_app";

type States = any;

export class AppExit {
    #ty: 0 | 1;
    #err?: number;
    private constructor(ty: 0 | 1, err?: number) {
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

export type AppLabel = string;

type AppError = { plugin_name: string }
const AppError = {
    DuplicatePlugin(plugin_name: string) {
        return {
            plugin_name
        } as AppError
    }
}



export type PluginsState = 0 | 1 | 2 | 3;
export const PluginsState = {
    Adding: 0,
    Ready: 1,
    Finished: 2,
    Cleaned: 3
} as const

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
    // world: World;
    // runner: (app: App) => void;
    // main_schedule_label: ScheduleLabel;
    // #sub_apps: Map<AppLabel, SubApp>;
    // #plugin_registry: Plugin[];
    // #plugin_name_added: Set<string>;
    // // a private counter to prevent incorrect calls to `App::run()` from `Plugin::build()`
    // #building_plugin_depth: number;
    // #plugins_state: PluginsState;
    constructor(
        sub_apps: SubApps,
        runner: RunnerFn
    ) {
        this.#sub_apps = sub_apps;
        this.#runner = runner;
    }

    static new() {
        return App.default();
    }

    static default() {
        const app = App.empty();
        // app.#sub_apps.main.update_schedule = Main.intern();

        // feature Reflect
        // app.init_resource(AppTypeRegistry) 

        // feature ReflectFunctions
        // app.init_resource(AppFunctionRegistry)

        // app.add_plugins(MainSchedulePlugin);
        // app.add_systems(First,
        //     event_update_system
        //         .run_if(event_update_condition)
        // )

        // app.add_event(AppExit);

        return app;
    }

    static empty() {
        return new App(
            new SubApps(new SubApp(), new Map()),
            run_once as any
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

        const runner = this.#runner;
        runner(this)
    }

    set_runner(runner: (app: App) => AppExit) {
        this.#runner = runner;
        return this;
    }

    plugins_state() {
        const plugins_state = this.main().plugins_state;
        let overall_plugins_state: PluginsState;
        if (plugins_state === PluginsState.Adding) {
            let state = PluginsState.Ready as PluginsState;
            const plugins = this.main().plugin_registry;
            this.main().plugin_registry = undefined;
            for (const plugin of plugins) {
                if (plugin.ready(this)) {
                    state = PluginsState.Adding
                }
            }
            this.main().plugin_registry = plugins;
            overall_plugins_state = state;
        } else {
            overall_plugins_state = plugins_state;
        }

        this.#sub_apps.iter().skip(1).for_each(s => {
            overall_plugins_state = Math.min(overall_plugins_state, s.plugins_state()) as PluginsState;
        })

        return overall_plugins_state;
    }

    finish() {
        const plugins = this.main().plugin_registry;
        for (const plugin of plugins) {
            plugin.finish(this);
        }

        const main = this.main();
        main.plugin_registry = plugins;
        main.plugins_state = PluginsState.Finished;
        this.#sub_apps.iter().skip(1).for_each(s => s.finish())
    }

    cleanup() {
        const plugins = this.main().plugin_registry;
        for (const plugin of plugins) {
            plugin.cleanup(this)
        };

        const main = this.main();
        main.plugin_registry = plugins;
        main.plugins_state = PluginsState.Cleaned;
        this.#sub_apps.iter().skip(1).for_each(s => s.cleanup(this))
    }

    is_building_plugins() {
        return this.#sub_apps.iter().any(s => s.is_building_plugins())
    }

    add_systems(schedule: ScheduleLabel, systems: IntoSystemConfigs<any>) {
        this.main().add_systems(schedule, systems);
        return this;
    }

    register_system<I extends SystemInput, O, M>(input: I, system: IntoSystem<I, O, M>) {
        return this.main().register_system(system);
    }

    configure_sets(schedule: ScheduleLabel, sets: IntoSytemSetConfigs) {
        this.main().configure_sets(schedule, sets);
        return this;
    }

    add_event(type: Event) {
        this.main().add_event(type);
        return this;
    }

    insert_resource(resource: Resource) {
        this.main().insert_resource(resource);
        return this;
    }

    init_resource(resource: Resource) {
        this.main().init_resource(resource);
        return this;
    }

    add_boxed_plugin(plugin: Plugin): Result<this, ErrorExt<AppError>> {
        if (plugin.is_unique() && this.main().plugin_names.contains(plugin.name())) {
            return new ErrorExt(AppError.DuplicatePlugin(plugin.name()))
        }

        const index = this.main().plugin_registry.len();
        this.main().plugin_registry.push(PlaceholderPlugin);
        this.main().plugin_building_depth += 1;

        let result;
        try {
            plugin.build(this)
        } catch (error) {
            result = error
        }

        this.main().plugin_names.insert(plugin.name());
        this.main().plugin_build_depth -= 1;


        if (result) {
            throw result;
        }

        this.main().plugin_registry[index] = plugin;
        return this;
    }

    add_plugins(plugins: Plugins) {
        const s = this.plugins_state();
        if (s === PluginsState.Cleaned || s === PluginsState.Finished) {
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
        return this.#sub_apps.sub_apps().get(label);
    }

    insert_sub_app(label: AppLabel, app: SubApp) {
        return this.#sub_apps.sub_apps().set(label, app);
    }

    remove_sub_app(label: AppLabel) {
        const subapps = this.#sub_apps.sub_apps();
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

    add_schedule(schedule: Schedule) {
        this.main().add_schedule(schedule);
        return this;
    }

    init_schedule(schedule: Schedule) {
        this.main().init_schedule(schedule);
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

    should_exit() {
        const reader = EventCursor.default();
        const _events = this.world().get_resource(AppExitEvents);
        if (!_events) {
            return
        }
        const events = reader.read(_events);
        if (events.len() !== 0) {
            return events.find(exit => exit.is_error()) ?? AppExit.Success()
        }

        return;
    }

}