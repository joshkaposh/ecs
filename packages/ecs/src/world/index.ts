import type { Instance } from '../util';
import type { World } from './world';

export interface FromWorld<T> {
    from_world(world: World): Instance<T>
}

export * from './world';
export * from './entity-ref';
export * from './deferred-world';
export * from './command_queue';
export { SpawnBatchIter } from './spawn-batch'