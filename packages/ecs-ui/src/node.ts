import { defineComponent } from 'define';
import type { HTMLAttributes } from './dom';

// type EventListener<E extends HTMLElement, K extends keyof HTMLElementEventMap = keyof HTMLElementEventMap> = (this: E, ev: HTMLElementEventMap[K]) => any;

// type EventListenerMap<E extends HTMLElement, K extends keyof HTMLElementEventMap = keyof HTMLElementEventMap> = Partial<{
//     [P in K]: EventListener<E, P>;
// }>

export interface UINodeAttribute<Tag extends keyof HTMLElementTagNameMap> extends HTMLAttributes<HTMLElementTagNameMap[Tag]> { }

export function UINode<K extends keyof HTMLElementTagNameMap>(type: K) {
    return defineComponent(class UIElement {
        element: HTMLElementTagNameMap[K];
        entity!: number;
        constructor(
            parent: HTMLElement = document.getElementById('root')!,
            attributes: Partial<UINodeAttribute<K>> = Object.create(null)
        ) {
            const element = document.createElement(type);

            for (const key in attributes) {
                element[key as keyof typeof element] = attributes[key as keyof typeof attributes];
            }

            parent.appendChild(element);
            this.element = element;
        }
    })
}