import { test, assert } from "vitest";
import { App } from '../../packages/ecs-app'
import { defineEvent } from "../../packages/define";

const MyEvent = defineEvent(class MyEvent { constructor(public value = 'event instance!') { } });

test('app add_event', () => {
    const app = new App();

    app.addEvent(MyEvent);

    assert(app.getEvent(MyEvent)!.get_cursor() != null);
})