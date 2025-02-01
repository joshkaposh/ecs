import { test, assert } from "vitest";
import { App } from 'ecs-app'
import { define_system } from "../../packages/ecs/src";
import { define_event, define_resource } from "ecs/src/define";
import { $Main } from "ecs-app/main_schedule";

// const MyEvent = define_event(class MyEvent { constructor(public data = 0) { } })

test('app', () => {
    // const app = App.empty();

    // app.add_event(MyEvent);
})