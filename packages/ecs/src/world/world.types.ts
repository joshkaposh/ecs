import type { Instance } from '../util';
import type { World } from './world';

export type * from './command-queue';
export type * from './entity-fetch';
export type * from './entity-ref';
export type * from './error';
export type * from './spawn-batch';
export type * from './world';
export type * from './deferred-world';

export interface FromWorld<T> {
    from_world(world: World): Instance<T>;
}