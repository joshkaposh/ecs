import { test, assert } from "vitest";
import { App } from '../../src/ecs-app'
import { define_system } from "../../src/ecs";
import { define_event, define_resource } from "../../src/define";
import { $Main } from "../../src/ecs-app/main_schedule";

// const MyEvent = define_event(class MyEvent { constructor(public data = 0) { } })

test('app', () => {
    // const app = App.empty();

    // app.add_event(MyEvent);
})