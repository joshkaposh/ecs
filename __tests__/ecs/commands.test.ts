import { assert, expect, test } from 'vitest';
import { Schedule, World } from 'ecs';
import { defineComponent, defineResource, defineSystem } from 'define';
import { CommandQueue } from 'ecs/src/world';

const Comp1 = defineComponent(class Comp1 { constructor(public value = 'comp1') { } })
const Comp2 = defineComponent(class Comp2 { constructor(public value = 'comp2') { } })

const Resource1 = defineResource(class Resource1 { constructor(public value = 'resource1') { } })

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

test('system commands', () => {
    const w = new World();
    const s = new Schedule();

    const system = defineSystem(b => b.commands(), (commands) => commands.insertResource(Resource1))

    s.addSystems(system);

    s.run(w);

    console.log(w.getResource(Resource1), w.getResource(Resource1) instanceof Resource1);

})

// test('queue applies commands once', () => {
//     const w = new World();
//     const queue = new CommandQueue();

//     queue.push(new SpawnEmpty() as any);
//     queue.push(new SpawnEmpty() as any);

//     queue.apply(w);

//     assert(w.entities.length === 2);

//     queue.apply(w);

//     assert(w.entities.length === 2);
// })

// test('world receives spawned component from queue', () => {
//     const w = new World();
//     const queue = new CommandQueue();

//     queue.push(new Spawn([new Comp1('himom')]) as any)

//     queue.apply(w);
//     queue.apply(w);

//     assert(w.entities.length === 1);

//     const table_id = w.archetypes.get(1)!.tableId;
//     const id = w.storages.tables.get(table_id)!.entities[0]

//     assert(w.get(id, Comp1) != null);
//     expect(w.get(id, Comp1)).toEqual(new Comp1('himom'))
// })

test('spawn and then insert', () => {

    const w = new World();
    const commands = w.commands;

    const entity = commands.spawn(new Comp1('inserted'));
    const id = entity.id;
    entity.insert([new Comp2()]);

    w.flush();

    expect(w.get(id, Comp1)).toEqual(new Comp1('inserted'))
})

test('two commands', () => {
    const w = new World();

    const a = w.commands;
    const b = w.commands;

    a.spawnEmpty();
    b.spawnEmpty();

    w.flush();

    assert(w.entities.length === 2);

    w.flush();

    assert(w.entities.length === 2);
})