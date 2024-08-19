import { ErrorExt, Option, Result, is_error, is_some } from "joshkaposh-option";
import { Component, Resource } from "../ecs/component";
import { Plugin, Plugins } from "../ecs/plugin";
import { Schedule, ScheduleBuildSettings, ScheduleLabel, Schedules } from "../ecs/schedule";
import { World } from "../ecs/world";
import { Event } from "../ecs/event";

type States = any;

export class AppExit { }

export type AppLabel = string;

// @ts-expect-error
type IntoSystemConfigs<M> = any;
type IntoSystemSetConfigs = any;


class SubApp {
    app: App;
    #extract: (world: World, app: App) => void;
    constructor(app: App, extract: (world: World, app: App) => void) {
        this.app = app;
        this.#extract = extract;
    }

    run() {
        this.app.world.run_schedule(this.app.main_schedule_label);
    }

    extract(main_world: World) {
        this.#extract(main_world, this.app);
    }
}

export type PluginsState = 0 | 1 | 2 | 3;
export const PluginsState = {
    Adding: 0,
    Ready: 1,
    Finished: 2,
    Cleaned: 3
} as const

function run_once(_app: App) { }


export class App {
    world: World;
    runner: (app: App) => void;
    main_schedule_label: ScheduleLabel;
    #sub_apps: Map<AppLabel, SubApp>;
    #plugin_registry: Plugin[];
    #plugin_name_added: Set<string>;
    // a private counter to prevent incorrect calls to `App::run()` from `Plugin::build()`
    #building_plugin_depth: number;
    #plugins_state: PluginsState;
    constructor(
        world: World,
        runner: (app: App) => void,
        main_schedule_label: ScheduleLabel,
        sub_apps: Map<AppLabel, SubApp>,
        plugin_registry: Plugin[],
        plugin_name_added: Set<string>,
        building_plugin_depth: number,
        plugins_state: PluginsState
    ) {
        this.world = world;
        this.runner = runner;
        this.main_schedule_label = main_schedule_label;
        this.#sub_apps = sub_apps;
        this.#plugin_registry = plugin_registry;
        this.#plugin_name_added = plugin_name_added;
        this.#building_plugin_depth = building_plugin_depth;
        this.#plugins_state = plugins_state;
    }

    static default() {
        const app = App.empty();
        // app.init_resource(AppTypeRegistry);

        // app.add_plugins(MainSchedulePlugin);

        // app.add_event(AppExit);

        // #[cfg(feature = "bevy_ci_testing")]
        // {
        //     crate::ci_testing::setup_app(&mut app);
        // }

        return app;
    }

    static empty() {
        const world = World.default();
        return new App(
            world,
            run_once,
            'himom',//Main, // main_schedule_label
            new Map(),
            [],
            new Set(),
            0,
            PluginsState.Adding
        )
    }

    update() {
        for (const [_label, sub_app] of this.#sub_apps) {
            sub_app.extract(this.world);
            sub_app.run();
        }
    }

    run() {
        // let mut app = std::mem::replace(self, App::empty());

        if (this.#building_plugin_depth > 0) {
            throw new Error('App::run() was called from within Plugin::build(), which is not allowed.');
        }


        const runner = this.runner;
        this.runner = run_once;
        runner(this);
    }

    plugins_state() {
        const state = this.#plugins_state;
        if (state === PluginsState.Adding) {
            for (const plugin of this.#plugin_registry) {
                if (!plugin.ready(this)) {
                    return PluginsState.Adding
                }
            }
        }
        return state;
    }

    finish() {
        const plugin_registry = this.#plugin_registry;
        // @ts-expect-error;
        this.#plugin_registry = null;
        for (const plugin of plugin_registry) {
            plugin.finish(this);
        }
        this.#plugin_registry = plugin_registry;
        this.#plugins_state = PluginsState.Finished;
    }

    cleanup() {
        const plugin_registry = this.#plugin_registry;
        // @ts-expect-error
        this.#plugin_registry = null;
        for (const plugin of plugin_registry) {
            plugin.cleanup(this)
        }
        this.#plugin_registry = plugin_registry;
        this.#plugins_state = PluginsState.Cleaned;
    }

    // S: States + FromWorld
    init_state(state: States) {
        if (!this.world.contains_resource(state)) {
            // this.world.init_resource()
        }
    }

    add_systems<M>(schedule: ScheduleLabel, systems: IntoSystemConfigs<M>) {
        const schedules = this.world.resource(Schedules as Resource<Component>);
        let sched = schedules.get(schedule);

        if (is_some(sched)) {
            sched.add_systems(systems)
        } else {
            const new_schedule = new Schedule(schedule);
            new_schedule.add_systems(systems);
            schedules.insert(new_schedule);
        }

        return this;
    }

    configure_sets(schedule: ScheduleLabel, sets: IntoSystemSetConfigs) {
        const schedules = this.world.resource(Schedules as any);
        const sched = schedules.get(schedule);

        if (is_some(sched)) {
            sched.configure_sets(sets);
        } else {
            const new_schedule = new Schedule(schedule);
            new_schedule.configure_sets(sets);
            schedules.insert(new_schedule);
        }

        return this
    }

    add_event(type: Event) {

    }

    insert_resource(resource: Resource<Component>) {
        this.world.insert_resource(resource);
        return this;
    }

    init_resource(resource: Resource<Component>) {
        this.world.init_resource(resource);
        return this;
    }

    set_runner(run_fn: (app: App) => void) {
        this.runner = run_fn;
        return this;
    }

    is_plugin_added(plugin: typeof Plugin) {
        return this.#plugin_registry.some((p) => plugin.type_id === p.type_id);
    }

    get_added_plugins() {

    }

    add_plugins(plugins: Plugins) {
        const state = this.plugins_state()
        if (state === PluginsState.Cleaned
            || state === PluginsState.Finished
        ) {
            throw new Error('Plugins cannot be added after App::cleanup() or App::finish() has been called.')
        }

        plugins.add_to_app(this);
        return this;
    }


    sub_app(label: AppLabel) {
        const r = this.get_sub_app(label);
        if (is_error(r)) {
            throw new Error(`Sub-App with label ${label} does not exist`)
        }
    }

    insert_sub_app(label: AppLabel, sub_app: SubApp) {
        this.#sub_apps.set(label, sub_app)
    }

    remove_sub_app(label: AppLabel): Option<SubApp> {
        const app = this.#sub_apps.get(label);
        if (app) {
            this.#sub_apps.delete(label);
            return app;
        }
        return null;
    }

    get_sub_app(label: AppLabel): Result<SubApp, AppLabel> {
        const sub_app = this.#sub_apps.get(label);
        return sub_app ? sub_app.app : new ErrorExt(label) as any;
    }

    add_schedule(schedule: Schedule) {
        this.world.resource(Schedules as any).insert(schedule);
        return this;
    }

    init_schedule(label: ScheduleLabel) {
        const schedules = this.world.resource(Schedules as any);
        if (!schedules.contains(label)) {
            schedules.insert(new Schedule(label))
        }
        return this;
    }

    get_schedule(label: ScheduleLabel): Option<Schedule> {
        return this.world.get_resource(Schedules as any)?.get(label);
    }

    edit_schedule(label: ScheduleLabel, fn: (schedule: Schedule) => void) {
        const schedules = this.world.resource(Schedules as any);
        if (!schedules.get(label)) {
            schedules.insert(new Schedule(label))
        }

        const schedule = schedules.get(label)!;
        fn(schedule);
        return this;
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        this.world
            .resource(Schedules as any)
            .configure_schedules(schedule_build_settings);
        return this;
    }

    static run_once(app: App) {
        app.finish();
        app.cleanup();

        app.update();
    }
}