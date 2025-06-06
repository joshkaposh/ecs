import { defineSystem, defineResource, defineEvent } from "define";
import { ButtonInput } from "./button_input";

export type MouseButton = 0 | 1 | 2 | 3 | 4 | (number & {})
export const MouseButton = {
    Left: 0,
    Middle: 1,
    Right: 2,
    Back: 3,
    Forward: 4,
    Other(digit: number) { return digit }
} as const

export const MouseButtonInput = ButtonInput<MouseButton>();

// export type MouseMotion = {
//     /**
//      * The change in the position of the pointing device since the last event was sent.
//      */
//     delta: [number, number];
// }

// export type MouseScrollUnit = 0 | 1;
// export const MouseScrollUnit = {
//     /**
//      * The line scroll unit.
//      *
//      * The delta of the associated `MouseWheel` event corresponds to the amount of lines or rows to scroll.
//      */
//     Line: 0,

//     /**
//      * The pixel scroll unit.
//      *
//      * The delta of the associated `MouseWheel` event corresponds to the amount of pixels to scroll.
//      */
//     Pixel: 1
// } as const

// export type MouseWheel = {
//     unit: MouseScrollUnit;
//     x: number;
//     y: number;
//     target: Entity;
// }

// export const mouse_button_input_system = defineSystem(b => b.res_mut(), function mouse_button_input_system() {})

// export function mouse_button_input_system(
//     mouse_button_input: ResMut<ButtonInput<MouseButton>>,
//     mouse_button_input_events: EventReader<MouseButtonInput>
// ) {
//     mouse_button_input.bypass_change_detection().clear();
//     const input = mouse_button_input.deref_mut();

//     mouse_button_input_events.read().for_each(event => {
//         const { state, button } = event;
//         if (ButtonState.Pressed === state) {
//             input.press(button)
//         } else if (ButtonState.Released === state) {
//             input.release(button)
//         }
//     })
// }

// export type AccumulatedMouseMotion = {
//     delta: [number, number];
// }

// export type AccumulatedMouseScroll = {
//     unit: MouseScrollUnit;
//     delta: [number, number];
// }

// export function default_accumulated_mouse_scroll(): AccumulatedMouseScroll {
//     return {
//         unit: 0,
//         delta: [0, 0]
//     }
// }

export const MouseMotion = await defineEvent(class MouseMotion {
    x: number;
    y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
})

export const AccumulatedMouseMotion = defineResource(class AccumulatedMouseMotion {
    x: number;
    y: number;

    constructor(x = Infinity, y = Infinity) {
        this.x = x;
        this.y = y;
    }
})

export const accumulate_mouse_motion_system = defineSystem(b => b.reader(MouseMotion).resMut(AccumulatedMouseMotion), function accumulate_mouse_motion_system(
    _mouse_motion_event,
    _accumulated_mouse_motion
) {
    // const delta = [0, 0];

    // mouse_motion_event.read().for_each(e => {
    //     delta[0] += e[0];
    //     delta[1] += e[1];
    // })

    // const deref = accumulated_mouse_motion.deref_mut();
    // deref.x = delta[0];
    // deref.y = delta[1];
})

// export function accumulate_mouse_motion_system(
//     mouse_motion_event: EventReader<MouseMotion>,
//     accumulated_mouse_motion: ResMut<AccumulatedMouseMotion>
// ) {
//     const delta = [0, 0] as [number, number];
//     mouse_motion_event.read().for_each(event => {
//         const ev_delta = event.delta;
//         delta[0] = ev_delta[0];
//         delta[1] = ev_delta[1];
//     });
//     accumulated_mouse_motion.deref_mut().delta = delta;
// }

// export function accumulate_mouse_scroll_system(
//     mouse_scroll_event: EventReader<MouseWheel>,
//     accumulated_mouse_scroll: ResMut<AccumulatedMouseScroll>
// ) {
//     const delta = [0, 0] as [number, number];
//     let unit: MouseScrollUnit = MouseScrollUnit.Line;
//     mouse_scroll_event.read().for_each(event => {
//         const ev_unit = event.unit;
//         if (ev_unit !== unit) {
//             unit = ev_unit;
//         }
//         delta[0] = event.x;
//         delta[1] = event.y;
//     })

//     const scroll = accumulated_mouse_scroll.deref_mut();
//     scroll.delta = delta;
//     scroll.unit = unit;
// }
