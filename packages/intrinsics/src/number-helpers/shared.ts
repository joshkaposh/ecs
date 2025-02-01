
export function int_div(a: number, b: number) {
    b = Math.floor(b);
    if (b === 0) {
        throw new Error('int_div rhs cannot be 0')
    }
    return Math.floor(a) / b;
}