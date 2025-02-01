
export function clamp_unchecked(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n))
}

export function clamp(n: number, min: number, max: number) {
    if (min > max) {
        let temp = min;
        min = max;
        max = temp;
    }

    return clamp_unchecked(n, min, max)
}

export function lerp(a: number, b: number, t: number) {
    return a * (1 - t) + b * t
}
