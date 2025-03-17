import type { Instance } from '../util';
import { World } from './world';

export interface FromWorld<T> {
    from_world(world: World): Instance<T>
}

export { EntityMut, EntityRef, EntityWorldMut } from './entity-ref';
export { World } from './world';
export type { WorldId } from './world';
export { DeferredWorld } from './deferred-world';
export { CommandQueue, RawCommandQueue } from './command_queue';
export { SpawnBatchIter } from './spawn-batch'