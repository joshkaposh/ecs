import { iter } from "joshkaposh-iterator";
import { Schedule, ScheduleLabel } from "../ecs/schedule";
import { is_some } from "joshkaposh-option";
import { Resource, StorageType, World } from "../ecs";
import { define_resource, define_type } from '../define'
import { Plugin } from "./plugin";
import { App } from "./app";
import { ExecutorKind } from "../ecs/executor";

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

export class MainScheduleOrder {
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

    static default() {
        return new MainScheduleOrder(
            [
                $First,
                $PreUpdate,
                $RunFixedMainLoop,
                $Update,
                $SpawnScene,
                $PostUpdate,
                $Last
            ],
            [
                $PreStartup,
                $Startup,
                $PostStartup
            ]
        )
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
define_resource(MainScheduleOrder);

export class FixedMainScheduleOrder {
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

    static run_fixed_main(world: World) {
        world.resource_scope((world, order) => {
            for (const label of order.labels) {
                world.try_run_schedule(label);
            }
        })
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
define_resource(FixedMainScheduleOrder)

export class MainSchedulePlugin extends Plugin {

    static readonly type_id: UUID;

    build(app: App): void {
        const main_schedule = new Schedule($Main)
        main_schedule.set_executor_kind(ExecutorKind.SingleThreaded);
        const fixed_main_schedule = new Schedule($FixedMain);
        fixed_main_schedule.set_executor_kind(ExecutorKind.SingleThreaded);
        const fixed_main_loop_schedule = new Schedule($RunFixedMainLoop);
        fixed_main_loop_schedule.set_executor_kind(ExecutorKind.SingleThreaded);

        app.add_schedule(main_schedule)
            .add_schedule(fixed_main_schedule)
            .add_schedule(fixed_main_loop_schedule)
            .init_resource(MainScheduleOrder)
            .init_resource(FixedMainScheduleOrder)
        // .add_systems($Main, Main.run_main)
        // .add_systems($FixedMain, FixedMain.run_fixed_main)
        // .configure_sets($RunFixedMainLoop, [
        // RunFixedMainLoopSystem.BeforeFixedMainLoop,
        // RunFixedMainLoopSystem.FixedMainLoop,
        // RunFixedMainLoopSystem.AfterFixedMainLoop,
        // ].chain()
        // )

    }
}
define_type(MainSchedulePlugin);


export class Main {
    static run_main(world: World, run_at_least_once: boolean) {
        // if (!run_at_least_once) {
        //     world.resource_scope((world, order) => {
        //         for (let i = 0; i < order.startup_labels.length; i++) {
        //             world.try_run_schedule(label);
        //         }
        //         run_at_least_once = true
        //     })
        // }

        // world.resource_scope((world, order) => {
        //     for (const label of order.labels) {
        //         world.try_run_schedule(label);
        //     }
        // })
    }
}

export type RunFixedMainLoopSystem = 0 | 1 | 2
export const RunFixedMainLoopSystem = {
    BeforeFixedMainLoop: 0,
    FixedMainLoop: 1,
    AfterFixedMainLoop: 2
} as const