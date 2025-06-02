export function did_throw(fn: () => void) {
    let error = false;
    try {
        fn();
    } catch (error) {
        error = true;
    } finally {
        return error;
    }
}