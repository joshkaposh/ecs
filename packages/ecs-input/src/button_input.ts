import { Class, defineResource } from "define";
import { Resource } from "ecs";

export type ButtonState = 0 | 1;
export const ButtonState = {
    Pressed: 0,
    Released: 1
} as const


export interface ButtonInput<T> {
    /**
     * Sets `input` to the pressed state.
     */
    press(input: T): void;

    /**
 * @returns true if `input` is in the pressed state.
 */
    pressed(input: T): boolean;


    /**
 * @returns true if **any** input in `inputs` are in the pressed state.
 */
    anyPressed(inputs: T[]): boolean;
    /**
     * Sets `input` to the released state.
     */
    release(input: T): void;

    /**
     * Sets every input current pressed to the released state.
     */
    releaseAll(): void;

    /**
     * @returns true if the input `T` was just pressed.
     */
    justPressed(input: T): boolean;
    /**
     * @returns true if any `T` in `inputs` was just pressed.
     */
    anyJustPressed(inputs: T[]): boolean;

    /**
     * @returns true if `input` was just pressed.
     */
    clearJustPressed(input: T): boolean;

    /**
     * @returns true if the input `T` was just released.
     */

    justReleased(input: T): boolean;

    /**
     * @returns true if **any** input in `inputs` was just released.
     */
    anyJustReleased(inputs: T[]): boolean

    /**
     * @returns true if **every** input in `inputs` was just released.
     */
    allJustReleased(inputs: T[]): boolean;

    /**
     * @returns true if **every** input in `inputs` was just pressed.
     */
    allJustPressed(inputs: T[]): boolean;
    /**
     * Returns true if the input has just been released
     */
    clearJustReleased(input: T): boolean;
    /**
     * Sets **only** `just_pressed<T>` and `just_released<T>` to released.
     */
    clear(): void;

    /**
     * Sets `input` to released.
     */
    reset(input: T): void;

    /**
     * Sets all inputs to released.
     */
    resetAll(): void;

    /**
     * @returns an Iterator over all the current pressed inputs.
     */
    getPressed(): SetIterator<T>;

    /**
 * @returns an Iterator over all the just pressed inputs.
 */
    getJustPressed(): SetIterator<T>;

    /**
    * @returns an Iterator over all the just released inputs.
    */
    getJustReleased(): SetIterator<T>;

}

export function ButtonInput<T>(): Resource<Class<{}, ButtonInput<T>>> {
    return defineResource(class ButtonInput<T> {
        #pressed: Set<T>;
        #justPressed: Set<T>;
        #justReleased: Set<T>;

        constructor(pressed: Set<T> = new Set(), just_pressed: Set<T> = new Set(), just_released: Set<T> = new Set()) {
            this.#pressed = pressed;
            this.#justPressed = just_pressed;
            this.#justReleased = just_released;
        }

        /**
         * Sets `input` to the pressed state.
         */
        press(input: T) {
            if (!this.#pressed.has(input)) {
                this.#justPressed.add(input)
            }

            this.#pressed.add(input);
        }

        /**
         * @returns true if `input` is in the pressed state.
         */
        pressed(input: T): boolean {
            return this.#pressed.has(input);
        }

        /**
         * @returns true if **any** input in `inputs` are in the pressed state.
         */
        anyPressed(inputs: T[]): boolean {
            return inputs.some(input => this.#pressed.has(input))
        }

        /**
         * Sets `input` to the released state.
         */
        release(input: T) {
            if (this.#pressed.delete(input)) {
                this.#justReleased.add(input);
            }
        }

        /**
         * Sets every input current pressed to the released state.
         */
        releaseAll() {
            this.#pressed.forEach(input => this.#justReleased.add(input));
            this.#pressed.clear();
        }

        /**
         * @returns true if the input `T` was just pressed.
         */
        justPressed(input: T): boolean {
            return this.#justPressed.has(input);
        }

        /**
         * @returns true if any `T` in `inputs` was just pressed.
         */
        anyJustPressed(inputs: T[]) {
            return inputs.some(input => this.#justPressed.has(input))
        }

        /**
         * @returns true if `input` was just pressed.
         */
        clearJustPressed(input: T): boolean {
            return this.#justPressed.delete(input);
        }

        /**
         * @returns true if the input `T` was just released.
         */

        justReleased(input: T): boolean {
            return this.#justReleased.has(input);
        }

        /**
         * @returns true if **any** input in `inputs` was just released.
         */
        anyJustReleased(inputs: T[]): boolean {
            return inputs.some(input => this.#justReleased.has(input))
        }

        /**
         * @returns true if **every** input in `inputs` was just released.
         */
        allJustReleased(inputs: T[]): boolean {
            return inputs.every(input => this.#justReleased.has(input))
        }

        /**
         * @returns true if **every** input in `inputs` was just pressed.
         */
        allJustPressed(inputs: T[]): boolean {
            return inputs.every(input => this.#justPressed.has(input))
        }

        /**
         * Returns true if the input has just been released
         */
        clearJustReleased(input: T) {
            return this.#justReleased.delete(input)
        }
        /**
         * Sets **only** `just_pressed<T>` and `just_released<T>` to released.
         */
        clear() {
            this.#justPressed.clear();
            this.#justReleased.clear();
        }

        /**
         * Sets `input` to released.
         */
        reset(input: T) {
            this.#pressed.delete(input);
            this.#justPressed.delete(input);
            this.#justReleased.delete(input);
        }

        /**
         * Sets all inputs to released.
         */
        resetAll() {
            this.#pressed.clear();
            this.#justPressed.clear();
            this.#justReleased.clear();
        }

        /**
         * @returns an Iterator over all the current pressed inputs.
         */
        getPressed() {
            return this.#pressed.values();
        }

        /**
     * @returns an Iterator over all the just pressed inputs.
     */
        getJustPressed(): SetIterator<T> {
            return this.#justPressed.values();
        }

        /**
        * @returns an Iterator over all the just released inputs.
        */
        getJustReleased(): SetIterator<T> {
            return this.#justReleased.values();
        }
    }) as Resource<new () => ButtonInput<T>>
}
