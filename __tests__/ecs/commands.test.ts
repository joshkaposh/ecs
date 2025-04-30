import { assert, expect, test } from 'vitest';
import { World } from 'ecs';
import { CommandQueue } from 'ecs/src/world';
import { defineComponent } from 'define';

const Comp1 = defineComponent(class Comp1 { value = 'comp1' })
const Comp2 = defineComponent(class Comp2 { value = 'comp2' })

class SpawnEmpty {
    exec(world: World) {
        world.spawnEmpty();
    }
}

class Spawn {
    #data: any[];
    constructor(data: any[]) {
        this.#data = data;
    }
    exec(world: World) {
        world.spawn(this.#data);
    }
}


test('queue applies commands once', () => {
    const w = new World();
    const queue = new CommandQueue();

    queue.push(new SpawnEmpty());
    queue.push(new SpawnEmpty());

    queue.apply(w);

    assert(w.entities.length === 2);

    queue.apply(w);

    assert(w.entities.length === 2);

})

test('world receives spawned component from queue', () => {
    const w = new World();
    const queue = new CommandQueue();

    queue.push(new Spawn([new Comp1()]))

    queue.apply(w);
    queue.apply(w);

    assert(w.entities.length === 1);

    const table_id = w.archetypes.get(1)!.tableId;
    const id = w.storages.tables.get(table_id)!.entities[0]

    assert(w.get(id, Comp1) != null);
    expect(w.get(id, Comp1)).toEqual(new Comp1())
})

test('world receives spawned component from commands', () => {
    const w = new World();
    const commands = w.commands;

    // const id = commands.spawn(new Comp1()).id;

    // w.flush()

    // assert(null != w.get(id, Comp1));
    // expect(w.get(id, Comp1)).toEqual(new Comp1())
})

test('spawn and then insert', () => {

    const w = new World();
    const commands = w.commands;

    // const entity = commands.spawn(new Comp1());
    // const id = entity.id;
    // entity.insert([new Comp2()]);

    // assert(w.get(id, Comp1) != null)

})

test('two commands', () => {
    const w = new World();

    const a = w.commands;
    const b = w.commands;

    a.spawn_empty();
    b.spawn_empty();

    w.flush();

    assert(w.entities.length === 2);

    w.flush();

    assert(w.entities.length === 2);
})