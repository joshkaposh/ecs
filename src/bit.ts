import { IterInputType, iter } from "joshkaposh-iterator";

export function carrot_left(n: number, times: number) {
    for (let i = 0; i < times; i++) {
        n = Math.floor(n * 0.5);
    }
    return n;
}

export function shift_left(n: number, times: number) {
    return n * Math.pow(2, times);
}
// TODO: implement
// export function carrot_right(n: number, times: number) {
//     n = Math.floor(n);
//     for (let i = 0; i < times; i++) {
//         n = n * 2;
//     }
//     return n;
// }

export function check(bitmask: number, bit: number) {
    if (bitmask === 0 && bit === 0) {
        return true;
    }
    return ((bitmask >> bit) & 1) !== 0;
}

export function set(bitmask: number, bit: number) {
    return bitmask | (1 << bit);
}

export function set_many(bitmask: number, ...indices: (boolean | number)[]) {
    for (const i of indices) {
        // @ts-expect-error
        bitmask = set(bitmask, i);
    }
    return bitmask;
}

export function set_to(bitmask: number, bit: number, enabled: 0 | 1 | false | true) {
    // @ts-expect-error
    return (bitmask & ~(1 << bit)) | (enabled << bit)
}

export function clear(bitmask: number, bit: number) {
    return bitmask & ~(1 << bit);
}

export function toggle(bitmask: number, bit: number) {
    return bitmask ^ (1 << bit);
}

// returns the number of trailing zeros in the binary representation of 'n'
export function trailing_zeros(n: number): number {
    if (n === 0) {
        return 0
    } else {
        let i = -1;
        let count = 0;
        while (true) {
            i++;
            if (check(n, i)) {
                break;
            }
            count++;
        }
        return count;
    }
}

export function count_ones(n: number) {
    let count = 0;
    let mask = 1;
    for (let i = 0; i < 32; i++) {
        if ((mask & n) !== 0) {
            count++;
        }
        mask <<= 1;
    }
    return count;
}

export function subset(bits: IterInputType<number>, target: number) {
    return iter(bits).all(bit => check(target, bit));
}