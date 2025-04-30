import { Key, MouseButton, MouseButtonInput, KeyboardButtonInput } from 'input';

const mouse = new MouseButtonInput();
const keyboard = new KeyboardButtonInput();

window.addEventListener('keydown', (e) => {
    e.preventDefault();
    keyboard.clear()
    keyboard.press(e.code as Key);
    console.log(keyboard.justPressed(e.code as Key), keyboard.pressed(e.code as Key));
});

window.addEventListener('keyup', (e) => {
    e.preventDefault();
    keyboard.release(e.code as Key);
})

window.addEventListener('mousedown', (e) => {
    e.preventDefault();
    mouse.clear()
    mouse.press(e.button as MouseButton);
});

window.addEventListener('mouseup', (e) => {
    e.preventDefault();
    mouse.release(e.button as MouseButton);
})
