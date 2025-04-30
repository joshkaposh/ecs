import { u32 } from "joshkaposh-option";

const MAX = u32.MAX;

const index_mask = 0b00000000_00000000_11111111_11111111;
const generation_mask = 0b11111111_11111111_00000000_00000000;

export function index(id: number) {
    return id & index_mask
}

export function generation(id: number) {
    return (id & generation_mask) >> 16;
}

export function id(index: number, generation = 1) {
    return (generation << 16) | index;
}

export function estr(entity: number) {
    return entity === MAX ? 'PLACEHOLDER' : `${index(entity)}V${generation(entity)}`;
}

