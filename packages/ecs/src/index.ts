import { Primitive } from 'joshkaposh-iterator';

declare global {
    export type UUID = `${string}-${string}-${string}-${string}`;
}


export * from './spawn';
export * from './relationship';
export * from './hierarchy';

export * from './world';
export * from './entity';
export * from './identifier';
export * from './component';
export * from './system';
export * from './schedule';
export * from './event';
export * from './query';
export * from './archetype';
export * from './bundle';
export * from './storage';

export * from './change_detection'
export * from './removal-detection';

export type Default<T = any> =
    T extends Primitive ? T :
    T extends new () => any ? T :
    never;

export { unit } from './util'