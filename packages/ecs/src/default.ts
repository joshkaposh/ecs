import type { Primitive } from "joshkaposh-iterator";

export type Default<T = Primitive | (new () => any)> = T