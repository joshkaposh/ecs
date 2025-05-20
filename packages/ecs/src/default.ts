import type { Primitive } from "joshkaposh-iterator";

export type Default<T = any> =
    T extends Primitive ? T :
    T extends new () => any ? T :
    never;