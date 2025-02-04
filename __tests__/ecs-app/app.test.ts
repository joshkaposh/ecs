import { test, assert, expect } from "vitest";
import { App } from '../../packages/ecs-app'
import { define_event } from "../../packages/ecs/src/define";

const MyEvent = define_event(class MyEvent { constructor(public value = 'event instance!') { } });

test('app', () => {
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