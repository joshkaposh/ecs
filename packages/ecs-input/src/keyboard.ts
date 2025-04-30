import { ButtonInput, ButtonState } from "./button_input";


export type Key = keyof typeof Key;
/**
 * `KEYS` represents every `KeyboardEvent.code` on the keyboard.
 */
const Key = Object.freeze({
    Escape: 'Escape',
    MetaLeft: 'MetaLeft',
    AudioVolumeMute: 'AudioVolumeMute',
    AudioVolumeDown: 'AudioVolumeDown',
    AudioVolumeUp: 'AudioVolumeUp',
    MediaTrackPrevious: 'MediaTrackPrevious',
    MediaPlayPause: 'MediaPlayPause',
    MediaTrackNext: 'MediaTrackNext',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Backquote: 'Backquote',
    Digit1: 'Digit1',
    Digit2: 'Digit2',
    Digit3: 'Digit3',
    Digit4: 'Digit4',
    Digit5: 'Digit5',
    Digit6: 'Digit6',
    Digit7: 'Digit7',
    Digit8: 'Digit8',
    Digit9: 'Digit9',
    Digit0: 'Digit0',
    Minus: 'Minus',
    Equal: 'Equal',
    Backspace: 'Backspace',
    NumpadDivide: 'NumpadDivide',
    NumpadMultiply: 'NumpadMultiply',
    NumpadSubtract: 'NumpadSubtract',
    Tab: 'Tab',
    NumpadAdd: 'NumpadAdd',
    Numpad7: 'Numpad7',
    Numpad8: 'Numpad8',
    Numpad9: 'Numpad9',
    Numpad4: 'Numpad4',
    Numpad5: 'Numpad5',
    Numpad6: 'Numpad6',
    Numpad1: 'Numpad1',
    Numpad2: 'Numpad2',
    Numpad3: 'Numpad3',
    Numpad0: 'Numpad0',
    NumpadDecimal: 'NumpadDecimal',
    NumpadEnter: 'NumpadEnter',
    KeyA: 'KeyA',
    KeyS: 'KeyS',
    KeyD: 'KeyD',
    KeyF: 'KeyF',
    KeyG: 'KeyG',
    KeyH: 'KeyH',
    KeyJ: 'KeyJ',
    KeyK: 'KeyK',
    KeyL: 'KeyL',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    Enter: 'Enter',
    ShiftLeft: 'ShiftLeft',
    KeyZ: 'KeyZ',
    KeyX: 'KeyX',
    KeyC: 'KeyC',
    KeyV: 'KeyV',
    KeyB: 'KeyB',
    KeyN: 'KeyN',
    KeyM: 'KeyM',
    Comma: 'Comma',
    Period: 'Period',
    Slash: 'Slash',
    ShiftRight: 'ShiftRight',
    ControlLeft: 'ControlLeft',
    AltLeft: 'AltLeft',
    Space: 'Space',
    AltRight: 'AltRight',
    ArrowLeft: 'ArrowLeft',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowRight: 'ArrowRight',
})

export const KeyboardButtonInput = ButtonInput<Key>()

// export const KeyboardButtonInput = ButtonInput<Key>();


// type KeyboardInput = KeyboardEvent & {
//     key: Key;
//     state: ButtonState;
// };

// type KeyboardFocusLost = any;

// export function keyboard_input_system(
//     key_input: ResMut<ButtonInput<Key>>,
//     keyboard_input_events: EventReader<KeyboardInput>,
//     focus_events: EventReader<KeyboardFocusLost>
// ) {

//     key_input.bypass_change_detection().clear();

//     const key_input_ = key_input.deref_mut();
//     keyboard_input_events.read().for_each(event => {
//         const { key, state } = event
//         if (ButtonState.Pressed === state) {
//             key_input_.press(key);
//         } else if (ButtonState.Released === state) {
//             key_input_.release(key);
//         }
//     })
//     // Release all cached input to avoid having stuck input when switching between windows in os
//     if (!focus_events.is_empty()) {
//         key_input_.release_all();
//         focus_events.clear();
//     }
// }