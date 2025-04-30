import { Condition, defineCondition, Res } from 'ecs';
import { ButtonInput } from './button_input';
import { Class } from 'define';
export function input_toggle_active<T>(type: ButtonInput<T>, defaultValue: boolean, input: T) {
    // @ts-expect-error
    defaultValue = Number(defaultValue);
    return defineCondition((b) => b.res(type as any), function input_toggle_active(inputs: Res<ButtonInput<T>>) {
        // @ts-expect-error
        defaultValue ^= inputs.deref().justPressed(input)

        return Boolean(defaultValue);
    })

    // return (inputs: Res<ButtonInput<T>>) => {
    //     // @ts-expect-error
    //     active ^= inputs.deref().justPressed(input);
    //     return Boolean(active);
    // }
}

export function input_pressed<T>(input: T, type: Class<{}, ButtonInput<T>>): Condition<[Res<ButtonInput<T>>]> {
    return defineCondition(b => b.res(type as any), (inputs: Res<ButtonInput<T>>) => inputs.deref().pressed(input)) as unknown as Condition<[Res<ButtonInput<T>>]>
}

export function input_just_pressed<T>(input: T, type: Class<{}, ButtonInput<T>>): Condition<[Res<ButtonInput<T>>]> {
    return defineCondition(b => b.res(type as any), (inputs: Res<ButtonInput<T>>) => inputs.deref().justPressed(input)) as unknown as Condition<[Res<ButtonInput<T>>]>
}

export function input_just_released<T>(input: T, type: ButtonInput<T>): Condition<[Res<ButtonInput<T>>]> {
    return defineCondition(b => b.res(type as any), (inputs: Res<ButtonInput<T>>) => inputs.deref().justReleased(input)) as unknown as Condition<[Res<ButtonInput<T>>]>
}