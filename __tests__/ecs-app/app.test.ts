import { test, assert, expect } from "vitest";
import { App } from '../../packages/ecs-app'
import { define_event } from "../../packages/define";
import { MainScheduleOrder } from "../../packages/ecs-app/src/main_schedule";
import { is_some } from "joshkaposh-option";

const MyEvent = define_event(class MyEvent { constructor(public value = 'event instance!') { } });

test('app add_event', () => {
    const app = App.empty();

    app.add_event(MyEvent);

    const event_from_world = app.event(MyEvent);

    const reader = event_from_world.get_cursor();
    const reader_b = event_from_world.get_cursor();

    expect(reader.read(event_from_world).collect()).toEqual([]);
    event_from_world.send(new MyEvent())
    expect(reader.read(event_from_world).collect()).toEqual([new MyEvent()]);
    event_from_world.send(new MyEvent('second instance!'))
    expect(reader.read(event_from_world).collect()).toEqual([new MyEvent('second instance!')]);
    expect(reader_b.read(event_from_world).collect()).toEqual([new MyEvent(), new MyEvent('second instance!')]);
})

test('app default', () => {
    const app = App.default();
    // for (let i = 0; i < 10; i++) {
    //     console.time('app run');
    //     app.run();
    //     console.timeEnd('app run');
    // }
    // app.run();
})