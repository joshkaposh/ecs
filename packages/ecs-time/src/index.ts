import { defineResource, defineSystem, set } from 'define';
import { $First, $FixedPostUpdate, $RunFixedMainLoop, event_update_system, Plugin, RunFixedMainLoopSystem, signal_event_update_system } from 'ecs-app';
import { EventRegistry, ShouldUpdateEvents } from 'ecs';
import { Time } from './time';
import { Real } from './real';
import { Fixed, run_fixed_main_schedule } from './fixed';
import { update_virtual_time, Virtual } from './virtual';

export const TimeSystems = set();

export const TimePlugin = Plugin({
    name: 'TimePlugin',
    build(app) {
        app.initResource(Time)
            .initResource(Real)
            .initResource(Fixed)
            .initResource(TimeUpdateStrategy);

        app.addSystems($First, time_system.inSet(TimeSystems).ambiguousWith(event_update_system))
            .addSystems($RunFixedMainLoop, run_fixed_main_schedule.inSet(RunFixedMainLoopSystem.FixedMainLoop))
            .addSystems($FixedPostUpdate, signal_event_update_system);

        // Ensure that events are not dropped until `FixedMain` systems can observe them
        const event_registry = app.world.resourceMut(EventRegistry as any);
        // we need to start in a waiting state so that the events are not updated until the first fixed update.
        event_registry.v.should_update = ShouldUpdateEvents.Waiting;
    }
});

export const TimeUpdateStrategy = defineResource(class TimeUpdateStrategy {
    type: 0 | 1 | 2;
    data?: number;
    constructor(ty: 0 | 1 | 2 = 0, data?: number) {
        this.type = ty;
        this.data = data;
    }

    static Automatic() {
        return new TimeUpdateStrategy(0);
    }

    static ManualInstant(instant: number) {
        return new TimeUpdateStrategy(1, instant);
    }

    static ManualDuration(duration: number) {
        return new TimeUpdateStrategy(2, duration);
    }
});

const time_system = defineSystem(b => b.resMut(Real).resMut(Virtual).resMut(Time).res(TimeUpdateStrategy), function time_system(real_time, virtual_time, time, update_strategy) {
    const strategy = update_strategy.v,
        real = real_time.v;
    strategy.type === 0 ? real.updateWithInstant(performance.now()) : real.updateWithInstant(strategy.data!)

    update_virtual_time(time.v, virtual_time.v, real);
});

export * from './time';
export * from './timer';
export * from './stopwatch';
export * from './real';
export * from './fixed';
export * from './virtual';