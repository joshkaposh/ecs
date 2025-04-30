import { iter } from "joshkaposh-iterator";
import { Schedule, ScheduleLabel } from "ecs/src/schedule";
import { is_some } from "joshkaposh-option";
import { StorageType, World } from "ecs";
import { defineSystem, set } from 'ecs/src/define'
import { Plugin } from "./plugin";
import { App } from "./app";
import { ExecutorKind } from "ecs/src/executor";
import { defineResource, defineType } from "define";

export const $Main = 'Main';
export const $PreStartup = 'PreStartup';
export const $Startup = 'Startup';
export const $PostStartup = 'PostStartup';
export const $First = 'First';
export const $RunFixedMainLoop = 'RunFixedMainLoop';
export const $FixedFirst = 'FixedFirst';
export const $FixedPreUpdate = 'FixedPreUpdate';
export const $FixedUpdate = 'FixedLast';
export const $FixedPostUpdate = 'FixedPostUpdate';
export const $FixedLast = 'FixedLast';
export const $FixedMain = 'FixedMain';
export const $PreUpdate = 'PreUpdate';
export const $Update = 'Update';
export const $PostUpdate = 'PostUpdate';
export const $Last = 'Last';

export const $SpawnScene = 'SpawnScene';

class MainScheduleOrder {
    static readonly type_id: UUID;
    static readonly storage_type: StorageType;
    static from_world: (world: World) => InstanceType<typeof MainScheduleOrder>
    labels: ScheduleLabel[];
    startup_labels: ScheduleLabel[]
    constructor(labels: ScheduleLabel[] = [
        $First,
        $PreUpdate,
        $RunFixedMainLoop,
        $Update,
        $SpawnScene,
        $PostUpdate,
        $Last
    ],
        startup_labels: ScheduleLabel[] = [
            $PreStartup,
            $Startup,
            $PostStartup
        ]) {
        this.labels = labels;
        this.startup_labels = startup_labels;
    }

    insert_after(after: ScheduleLabel, schedule: ScheduleLabel) {
        const index = iter(this.labels).position(current => current === after);
        if (!is_some(index)) {
            throw new Error(`Expect ${after} to exist`)
        }
        this.labels.splice(index + 1, 0, schedule);
    }

    insert_before(before: ScheduleLabel, schedule: ScheduleLabel) {
        const index = iter(this.labels).position(current => current === before);
        if (!is_some(index)) {
            throw new Error(`Expect ${before} to exist`)
        }
        this.labels.splice(index, 0, schedule);
    }


    insert_startup_after(after: ScheduleLabel, schedule: ScheduleLabel) {
        const index = iter(this.startup_labels).position(current => current === after);
        if (!is_some(index)) {
            throw new Error(`Expect ${after} to exist`)
        }
        this.startup_labels.splice(index + 1, 0, schedule);
    }

    insert_startup_before(before: ScheduleLabel, schedule: ScheduleLabel) {
        const index = iter(this.startup_labels).position(current => current === before);
        if (!is_some(index)) {
            throw new Error(`Expect ${before} to exist`)
        }
        this.startup_labels.splice(index, 0, schedule);
    }
}
defineResource(MainScheduleOrder);

class FixedMainScheduleOrder {
    static readonly type_id: UUID;
    static readonly storage_type: StorageType;
    static from_world: (world: World) => InstanceType<typeof FixedMainScheduleOrder>

    labels: ScheduleLabel[]
    constructor(labels: ScheduleLabel[] = [
        $FixedFirst,
        $FixedPreUpdate,
        $FixedUpdate,
        $FixedPostUpdate,
        $FixedLast
    ]) {
        this.labels = labels
    }

    static default() {
        return new FixedMainScheduleOrder([
            $FixedFirst,
            $FixedPreUpdate,
            $FixedUpdate,
            $FixedPostUpdate,
            $FixedLast
        ])
    }

    insert_after(after: ScheduleLabel, schedule: ScheduleLabel) {
        const index = iter(this.labels).position(current => current === after)
        if (!is_some(index)) {
            throw new Error(`Expected ${after} to exist`)
        }
        this.labels.splice(index + 1, 0, schedule)
    }

    insert_before(before: ScheduleLabel, schedule: ScheduleLabel) {
        const index = iter(this.labels).position(current => current === before)
        if (!is_some(index)) {
            throw new Error(`Expected ${before} to exist`)
        }
        this.labels.splice(index, 0, schedule)
    }


}
defineResource(FixedMainScheduleOrder)

class MainSchedulePlugin extends Plugin {

    build(app: App): void {
        const main_schedule = new Schedule($Main);
        main_schedule.set_executor_kind(ExecutorKind.SingleThreaded);
        const fixed_main_schedule = new Schedule($FixedMain);
        fixed_main_schedule.set_executor_kind(ExecutorKind.SingleThreaded);
        const fixed_main_loop_schedule = new Schedule($RunFixedMainLoop);
        fixed_main_loop_schedule.set_executor_kind(ExecutorKind.SingleThreaded);

        app
            .addSchedule(main_schedule)
            .addSchedule(fixed_main_schedule)
            .addSchedule(fixed_main_loop_schedule)
            .initResource(MainScheduleOrder)
            .initResource(FixedMainScheduleOrder)
            .addSystems($Main, run_main)
            .addSystems($FixedMain, run_fixed_main)
        // .configureSets($RunFixedMainLoop, set(
        //     RunFixedMainLoopSystem.BeforeFixedMainLoop,
        //     RunFixedMainLoopSystem.FixedMainLoop,
        //     RunFixedMainLoopSystem.AfterFixedMainLoop
        // ).chain())

        // .configure_sets($RunFixedMainLoop, [
        // RunFixedMainLoopSystem.BeforeFixedMainLoop,
        // RunFixedMainLoopSystem.FixedMainLoop,
        // RunFixedMainLoopSystem.AfterFixedMainLoop,
        // ].chain()
        // )

        // console.log('MainSchedulePlugin build()', app.world().get_resource(MainScheduleOrder), app.world().get_resource(FixedMainScheduleOrder));
    }
}
defineType(MainSchedulePlugin)

export { MainScheduleOrder, FixedMainScheduleOrder, MainSchedulePlugin }

export const run_main = defineSystem(b => b.world().local(false), function run_main(world, run_at_least_once) {
    if (!run_at_least_once.value) {
        world.resourceScope(MainScheduleOrder, (world, order) => {
            const startup_labels = order.v.startup_labels;
            for (let i = 0; i < startup_labels.length; i++) {
                world.tryRunSchedule(startup_labels[i]);
            }
            run_at_least_once.value = true;
            return order;
        })
    }

    world.resourceScope(MainScheduleOrder, (world, order) => {
        const labels = order.v.labels;
        for (let i = 0; i < labels.length; i++) {
            world.tryRunSchedule(labels[i]);
        }
        return order;
    })

})

export const run_fixed_main = defineSystem(b => b.world(), function run_fixed_main(world) {
    world.resourceScope(FixedMainScheduleOrder, (world, order) => {
        const labels = order.v.labels;
        for (let i = 0; i < labels.length; i++) {
            world.tryRunSchedule(labels[i]);
        }
        return order;
    })
})

export type RunFixedMainLoopSystem = 0 | 1 | 2
export const RunFixedMainLoopSystem = {
    BeforeFixedMainLoop: 0,
    FixedMainLoop: 1,
    AfterFixedMainLoop: 2
} as const