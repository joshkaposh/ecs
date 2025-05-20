import { test, assert } from "vitest";
import { App } from 'ecs-app';
import { defineEvent } from "define";


const MyEvent = defineEvent(class MyEvent { constructor(public value = 'event instance!') { } });

test('app add_event', () => {
    const app = new App();

    app.addEvent(MyEvent);

    assert(app.getEvent(MyEvent)!.getCursor() != null);
})