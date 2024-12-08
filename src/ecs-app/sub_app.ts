import { Option } from "joshkaposh-option";
import { Event, Events, Resource, Schedule, ScheduleBuildSettings, ScheduleLabel, Schedules, World } from "../ecs";
import { App, AppLabel, PluginsState } from "./app";
import { Plugin, Plugins } from "./plugin";
import { IntoSytemSetConfigs } from "../ecs/schedule/config";
import { iter, Iterator } from "joshkaposh-iterator";

export class SubApp {
    world!: World;
    plugin_registry!: Plugin[];
    plugin_names!: Set<any>;
    plugin_build_depth!: number;
    plugins_state!: PluginsState;
    update_schedule!: Option<Schedule>;
    extract!: any;

    constructor() { }

    static new() {
        return this.default();
    }

    static default() {
        const world = World.default();
        world.init_resource(Schedules);
        const app = new SubApp();
        app.world = world;
        app.plugin_registry = [];
        app.plugin_names = new Set();
        app.plugin_build_depth = 0;
        app.plugins_state = PluginsState.Adding;
        app.update_schedule = null;
        app.extract = null;
        return
    }

    run_as_app(fn: (app: App) => void) {
        const app = App.empty();

    }

    update() { }


    add_systems(schedule: ScheduleLabel, systems: IntoSystemConfigs<any>) {
        const schedules = this.world.resource(Schedules)
        schedules.add_systems(schedule, systems)
        return this;
    }

    register_system<I extends SystemInput, O, M>(system: IntoSystem<I, O, M>, input: I) {
        return this.world.register_system(system, input);
    }

    configure_sets(schedule: ScheduleLabel, sets: IntoSytemSetConfigs) {
        const schedules = this.world.resource(Schedules);
        schedules.configure_sets(schedule, sets);
        return this;
    }

    add_schedule(schedule: Schedule) {
        const schedules = this.world.resource(Schedules);
        schedules.insert(schedule);
        return this
    }

    init_schedule(label: ScheduleLabel) {
        const schedules = this.world.resource(Schedules);
        if (!schedules.contains(label)) {
            schedules.insert(new Schedule(label))
        }
        return this;
    }

    get_shedule(label: ScheduleLabel) {
        const schedules = this.world.resource(Schedules);
        return schedules.get(label);
    }

    edit_schedule(label: ScheduleLabel, f: (schedule: Schedule) => void) {
        const schedules = this.world.resource(Schedules);
        if (!schedules.contains(label)) {
            schedules.insert(new Schedule(label))
        }

        const schedule = schedules.get(label)!;
        f(schedule);

        return this;
    }

    configure_schedules(schedule_build_settings: ScheduleBuildSettings) {
        this.world.resource(Schedules).configure_schedules(schedule_build_settings);
        return this;
    }


    add_event(type: Event) {
        if (!this.world.contains_resource(Events)) {
            EventRegistry.register_event(type, this.world)
        }
        return this;
    }

    add_plugins(plugins: Plugins) {
        this.run_as_app(app => plugins.add_to_app(app))
        return this
    }

    is_plugin_added(plugin: Plugin) {
        return this.plugin_names.has(plugin.name())
    }

    is_building_plugins() {
        return this.plugin_build_depth > 0;
    }

    insert_resource(resource: Resource) {
        this.world.insert_resource(resource);
        return this;
    }

    init_resource(resource: Resource) {
        this.world.init_resource(resource);
        return this;
    }


}


export class SubApps {
    main: SubApp;
    sub_apps: Map<AppLabel, SubApp>;
    constructor(main: SubApp, sub_apps: Map<any, any>) {
        this.main = main;
        this.sub_apps = sub_apps;
    }



    update() {
        this.main.run_default_schedule();

        for (const [_label, sub_app] of this.sub_apps.entries()) {
            sub_app.extract(this.main.world);
            sub_app.update();
        }

        this.main.world.clear_trackers();
    }

    iter(): Iterator<SubApp> {
        return iter.once(this.main).chain(this.sub_apps.values() as any);
    }

    [Symbol.iterator]() {
        return this.iter();
    }

    update_sub_app_by_label(label: AppLabel) {
        const sub_app = this.sub_apps.get(label);
        if (sub_app) {
            sub_app.extract(this.main.world);
            sub_app.update()
        }
    }
}