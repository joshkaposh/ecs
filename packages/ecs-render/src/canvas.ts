import { defineResource, defineSystem } from "define";

export const Canvas = defineResource(class Canvas {
    #canvas: HTMLCanvasElement;
    constructor() {
        let canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
            let root = document.getElementById('root');
            if (!root) {
                root = document.createElement('div');
                root.id = 'root';
                document.appendChild(root);
            }

            canvas = document.createElement('canvas');
            canvas.id = 'canvas';
            root.appendChild(canvas);
        }
        this.#canvas = canvas;
        this.mount();
    }

    get width() {
        return this.#canvas.width;
    }

    set width(width) {
        this.#canvas.width = width;
    }

    get height() {
        return this.#canvas.height;
    }

    set height(height) {
        this.#canvas.height = height;
    }

    #resize() {
        this.#canvas.width = window.innerWidth;
        this.#canvas.height = window.innerHeight;
    }

    mount() {
        window.addEventListener('resize', this.#resize.bind(this))
    }

    drop() {
        window.removeEventListener('resize', this.#resize);
    }

    get getContext() {
        return this.#canvas.getContext;
    }
})

export const resize_canvas = defineSystem(b => b.resMut(Canvas), function resize_canvas(canvas) {
    canvas.v.width = window.innerWidth;
    canvas.v.height = window.innerHeight;
})