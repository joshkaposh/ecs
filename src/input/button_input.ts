import { iter, Iterator } from "joshkaposh-iterator";

export type ButtonState = 0 | 1;
export const ButtonState = {
    Pressed: 0,
    Released: 1
} as const

export class ButtonInput<T> {
    #pressed: Set<T>;
    #just_pressed: Set<T>;
    #just_released: Set<T>;

    constructor(pressed: Set<T> = new Set(), just_pressed: Set<T> = new Set(), just_released: Set<T> = new Set()) {
        this.#pressed = pressed;
        this.#just_pressed = just_pressed;
        this.#just_released = just_released;
    }


    press(input: T) {
        if (!this.#pressed.has(input)) {
            this.#just_pressed.add(input)
        }
        this.#pressed.add(input);
    }

    pressed(input: T): boolean {
        return this.#pressed.has(input);
    }

    any_pressed(inputs: T[]): boolean {
        return inputs.some(input => this.#pressed.has(input))
    }

    release(input: T) {
        if (this.#pressed.delete(input)) {
            this.#just_released.add(input)
        }
    }

    release_all() {
        this.#pressed.forEach(input => this.#just_released.add(input));
        this.#pressed.clear();
    }

    just_pressed(input: T): boolean {
        return this.#just_pressed.has(input);
    }

    any_just_pressed(inputs: T[]) {
        return inputs.some(input => this.#just_pressed.has(input))
    }


    /**
     * Returns true if the input has just been pressed
     */
    clear_just_pressed(input: T): boolean {
        return this.#just_pressed.delete(input);
    }

    just_released(input: T): boolean {
        return this.#just_released.has(input);
    }

    any_just_released(inputs: T[]): boolean {
        return inputs.some(input => this.#just_released.has(input))
    }

    all_just_released(inputs: T[]): boolean {
        return inputs.every(input => this.#just_released.has(input))
    }

    all_just_pressed(inputs: T[]): boolean {
        return inputs.every(input => this.#just_pressed.has(input))
    }

    /**
     * Returns true if the input has just been released
     */
    clear_just_released(input: T) {
        return this.#just_released.delete(input)
    }

    reset(input: T) {
        this.#pressed.delete(input);
        this.#just_pressed.delete(input);
        this.#just_released.delete(input);
    }

    reset_all() {
        this.#pressed.clear();
        this.#just_pressed.clear();
        this.#just_released.clear();
    }

    clear() {
        this.#just_pressed.clear();
        this.#just_released.clear();
    }

    get_pressed(): Iterator<T> {
        return iter(this.#pressed.values());
    }

    get_just_pressed(): Iterator<T> {
        return iter(this.#just_pressed.values());
    }

    get_just_released(): Iterator<T> {
        return iter(this.#just_released.values());
    }
}