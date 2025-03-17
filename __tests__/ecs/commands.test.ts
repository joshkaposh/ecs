import { assert, test } from 'vitest';
import { World } from 'ecs';
import { CommandQueue } from 'ecs/src/world'
test('commands', () => {

    class MyCommand {
        exec(world: World) {
            world.spawn_empty();
        }
    }

    const w = new World();
    const queue = new CommandQueue();

    queue.push(new MyCommand());
    queue.push(new MyCommand());

    queue.apply(w);

    assert(w.entities().length === 2);

    queue.apply(w);

    assert(w.entities().length === 2);

})