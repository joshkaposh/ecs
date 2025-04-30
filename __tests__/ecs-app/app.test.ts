import { test, assert } from "vitest";
import { defineEvent } from "ecs";
import { App } from 'ecs-app'

const MyEvent = defineEvent(class MyEvent { constructor(public value = 'event instance!') { } });

test('app add_event', () => {
    const app = new App();

    app.addEvent(MyEvent);

    assert(app.getEvent(MyEvent)!.get_cursor() != null);
})