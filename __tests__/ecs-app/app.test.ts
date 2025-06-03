import { test, assert, expect } from "vitest";
import { App } from 'ecs-app';
import { defineEvent, definePlugin } from "define";
import { NoopPluginGroup, PluginGroupBuilder } from "ecs-app/src/plugin-group";
import { did_throw } from "../helpers";

const MyEvent = defineEvent(class MyEvent { constructor(public value = 'event instance!') { } });

test('app add_event', () => {
    const app = new App();

    app.addEvent(MyEvent);

    assert(app.getEvent(MyEvent)!.getCursor() != null);
})

const PluginA = definePlugin({
    name: 'PluginA',
    build() { }
})

const PluginB = definePlugin({
    name: 'PluginB',
    build() { }
})

const PluginC = definePlugin({
    name: 'PluginC',
    build() { }
})


test('group contains', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
        .add(PluginA)
        .add(PluginB);

    assert(group.has(PluginA));
    assert(group.has(PluginB));
});

test('basic ordering', () => {
    const group = PluginGroupBuilder
        .start(NoopPluginGroup)
        .add(PluginA)
        .add(PluginB)
        .add(PluginC);

    expect(group.order).toEqual([PluginA.type_id, PluginB.type_id, PluginC.type_id]);
})

test('add before', () => {
    const group = PluginGroupBuilder.start(NoopPluginGroup)
        .add(PluginA)
        .add(PluginB)
        .addBefore(PluginB, PluginC);

    expect(group.order).toEqual([
        PluginA.type_id,
        PluginC.type_id,
        PluginB.type_id
    ])
})

test('add before nonexistent', () => {
    let thrown = did_throw(() => { throw new Error() })
    // let thrown = did_throw(() => PluginGroupBuilder.start(NoopPluginGroup)
    // .add(PluginA)
    // .addBefore(PluginB, PluginC)
    // );
    console.log('throw', thrown);

    // expect().toThrow();
})

