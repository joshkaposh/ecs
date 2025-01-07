import { Res } from '../ecs/change_detection'
import { ButtonInput } from './button_input';

export function input_toggle_active<T>(default_value: boolean, input: T) {
    let active = default_value;
    return (inputs: Res<ButtonInput<T>>) => {
        // @ts-expect-error
        active ^= inputs.deref().just_pressed(input);
        return Boolean(active);
    }
}

export function input_pressed<T>(input: T) {
    return (inputs: Res<ButtonInput<T>>) => inputs.deref().pressed(input);
}

export function input_just_pressed<T>(input: T) {
    return (inputs: Res<ButtonInput<T>>) => inputs.deref().just_pressed(input);
}


export function input_just_released<T>(input: T) {
    return (inputs: Res<ButtonInput<T>>) => inputs.deref().just_released(input);
}