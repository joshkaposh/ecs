import { test, assert } from "vitest";
import { App } from '../../src/ecs-app'
import { define_system } from "../../src/ecs";
import { define_resource } from "../../src/define";
import { $Main } from "../../src/ecs-app/main_schedule";

const sA = define_system({
    system: () => console.log('system_a running!'), params: () => []
}).set_name('system_a')

const sB = define_system({ system: () => console.log('system_b running!'), params: () => [] })
    .set_name('system_b');


const sC = define_system({ system: () => console.log('system_c running!'), params: () => [] })
    .set_name('system_c');


const sD = define_system({ system: () => console.log('system_d running!'), params: () => [] })
    .set_name('system_d');


const MyRes = define_resource(class MyRes { value = 'my resource!' })

class MyEvent { value = 'my event!' }

test('app', () => {
    const app = App.default()
        .add_systems($Main, sA, sB, sC, sD)
        .add_event(MyEvent)
        .add_event(MyEvent)

    // console.log('my event', app.world().get_resource(EventRegistry.get_event(MyEvent)));

    const ev = app.get_event(MyEvent);

    ev?.send(new MyEvent())
    ev?.send(new MyEvent())
    ev?.send(new MyEvent())
    ev?.send(new MyEvent())
    ev?.send(new MyEvent())

    assert(app.event(MyEvent).get_cursor().read(app.event(MyEvent)).count() === 5);
    app.event(MyEvent).clear();
    assert(app.event(MyEvent).get_cursor().read(app.event(MyEvent)).count() === 0);

    app.run();
})