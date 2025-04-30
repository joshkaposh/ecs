import type { Instance } from '../util';
import type { World } from './world';

export interface FromWorld<T> {
    from_world(world: World): Instance<T>
}

export * from './error';
export * from './world';
export * from './deferred-world';
export * from './entity-ref';
export * from './command-queue';
export * from './spawn-batch';