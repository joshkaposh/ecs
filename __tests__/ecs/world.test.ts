import { assert, test } from 'vitest'
import { World, StorageType, Component, Resource, System, Condition, define_system, Schedule, Query, With, Write, define_condition } from '../../src/ecs'
import { define_component, define_marker, define_resource, set } from '../../src/define';

import { ParamBuilder } from '../../src/ecs';
import { Commands } from '../../src/ecs/world/world';
import { Res } from '../../src/ecs/change_detection';

class A { constructor(public value = 'A') { } }
define_component(A)
class B { constructor(public value = 'B') { } }
define_component(B)
class C { constructor(public value = 'C') { } }
define_component(C)


const Marker = define_marker();

class Counter { }
define_resource(Counter);

test('world', () => {
    const w = new World();

    const id4 = w.register_component(A as Component);
    const id5 = w.register_component(B as Component);
    const id6 = w.register_component(C as Component);
    assert(
        id4 === 4 &&
        id5 === 5 &&
        id6 === 6
    )

    for (let i = 0; i < 200; i++) {
        w.spawn([new A(), new B(), new C()])
    }
    assert(w.entities().total_count() === 200);

    const batch = Array.from({ length: 100 }, () => [new A(), new B(), new C()]);
    {
        using _ = w.spawn_batch(batch)
    }

    assert(w.entities().total_count() === 300)
})

class Position { constructor(public x: number, public y: number) { } }
define_component(Position);
class Velocity { constructor(public x: number, public y: number) { } }
define_component(Velocity);

const Player = define_marker();
const Enemy = define_marker();



const spawn_player = define_system((commands: Commands) => {
    console.log('spawning player!');
    commands.spawn([new Position(0, 0), new Velocity(5, 5), new Player()]);

}, builder => builder.commands().params())

function randIntFromRange(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min)
}

const spawn_enemies = define_system((commands: Commands) => {
    commands.spawn_batch(Array.from({ length: 50 }, (_, i) => [new Position(randIntFromRange(0, 100), randIntFromRange(0, 100)), new Velocity(5, 5), new Enemy()]))
}, b => b.commands().params());

const move_player = define_system((query: Query<[Position, Velocity], [With<typeof Player>]>, times_called: InstanceType<Resource<typeof PlayerTimesCalled>>) => {

    times_called.amount++;

    const [position, velocity] = query.one();

    position.x += velocity.x;
    position.y += velocity.y;


}, builder => builder.query_filtered([Write(Position), Velocity], [With(Player)]).res_mut(PlayerTimesCalled).params())


const randomly_returns_true = define_condition(() => {
    return Math.random() >= 0.5;
}, () => []);

const log_enemies = define_system((query: any, times_called: any) => {
    // console.log("Enemies alive: ", query.count());
    times_called.amount++;

}, b => b.query_filtered([Position, Velocity], [With(Enemy)]).res_mut(LogTimesCalled).params());


const PlayerTimesCalled = define_resource(class { constructor(public amount = 0) { } });
const LogTimesCalled = define_resource(class { constructor(public amount = 0) { } });