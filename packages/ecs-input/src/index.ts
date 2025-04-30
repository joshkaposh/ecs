import { App, Plugin } from 'ecs-app';
import { AccumulatedMouseMotion, MouseButton, MouseButtonInput, MouseMotion } from './mouse';
import { KeyboardButtonInput, Key } from './keyboard';
import { ButtonInput, ButtonState } from './button_input';
import { defineEvent, defineResource } from 'define';
import { Event, Events, EventWriter, ResMut } from '../../../src';

export * from './button_input';
export * from './keyboard';
export * from './mouse';
export * from './common_conditions';

const Mouse = defineResource(class Mouse {
    /**
     * The last recorded x position.
     */
    x: number;
    /**
     * The last recorded y position.
     */
    y: number;

    constructor(x = Infinity, y = Infinity) {
        this.x = x;
        this.y = y;
    }
})

const MouseButtonEvent = defineEvent(MouseEvent);

function handleMouseButton(this: {
    mouse_button_input: ButtonInput<MouseButton>,
    events: EventWriter<typeof MouseButtonEvent>
}, e: MouseEvent) {
    const { mouse_button_input, events } = this, btn = e.button;
    // mouse_button_input.bypassChangeDetection().clear();
    // const input = mouse_button_input.derefMut();
    mouse_button_input.clear();
    const state = e.type === 'mousedown';

    state ? mouse_button_input.press(btn) : mouse_button_input.release(btn);
    // state ? input.press(btn) : input.release(btn);
    events.send(e);

}

function handleMouseMove(this: InstanceType<typeof AccumulatedMouseMotion>, e: MouseEvent) {
    this.x = e.clientX;
    this.y = e.clientY;
}

function handleKeydown(this: InstanceType<typeof KeyboardButtonInput>, e: KeyboardEvent) {
    this.clear()
    this.press(e.code as Key);

    console.log(this.justPressed(e.code as Key));

}


function handleKeyup(this: InstanceType<typeof KeyboardButtonInput>, e: KeyboardEvent) {
    this.release(e.code as Key);
}

export class InputPlugin extends Plugin {
    build(app: App): void {
        app
            .initResource(MouseButtonInput)
            .initResource(KeyboardButtonInput)
            .initResource(AccumulatedMouseMotion)
            .addEvent(MouseMotion)
            .addEvent(MouseButtonEvent);


        const handleMouseBtn = handleMouseButton.bind({
            mouse_button_input: app.resource(MouseButtonInput),
            events: app.event(MouseButtonEvent) as any
        })

        window.addEventListener('keydown', handleKeydown.bind(app.resource(KeyboardButtonInput)))
        window.addEventListener('keyup', handleKeyup.bind(app.resource(KeyboardButtonInput)))

        window.addEventListener('mousedown', handleMouseBtn);
        window.addEventListener('mouseup', handleMouseBtn)
        window.addEventListener('mousemove', handleMouseMove.bind(app.resource(AccumulatedMouseMotion)))



    }
}