
interface EventHandler<T, E extends Event> {
    (
        e: E & {
            currentTarget: T;
            target: Element;
        }
    ): void;
}
interface BoundEventHandler<T, E extends Event> {
    0: (
        data: any,
        e: E & {
            currentTarget: T;
            target: Element;
        }
    ) => void;
    1: any;
}
type EventHandlerUnion<T, E extends Event> = EventHandler<T, E> | BoundEventHandler<T, E>;
// interface IntrinsicAttributes {
//     ref?: unknown | ((e: unknown) => void);
// }


/**
   * @type {GlobalEventHandlers}
   */
interface EventHandlersLowerCase<T> {
    onabort?: EventHandlerUnion<T, Event>;
    onanimationend?: EventHandlerUnion<T, AnimationEvent>;
    onanimationiteration?: EventHandlerUnion<T, AnimationEvent>;
    onanimationstart?: EventHandlerUnion<T, AnimationEvent>;
    onauxclick?: EventHandlerUnion<T, MouseEvent>;
    onbeforeinput?: EventHandlerUnion<T, InputEvent>;
    onblur?: EventHandlerUnion<T, FocusEvent>;
    oncanplay?: EventHandlerUnion<T, Event>;
    oncanplaythrough?: EventHandlerUnion<T, Event>;
    onchange?: EventHandlerUnion<T, Event>;
    onclick?: EventHandlerUnion<T, MouseEvent>;
    oncontextmenu?: EventHandlerUnion<T, MouseEvent>;
    ondblclick?: EventHandlerUnion<T, MouseEvent>;
    ondrag?: EventHandlerUnion<T, DragEvent>;
    ondragend?: EventHandlerUnion<T, DragEvent>;
    ondragenter?: EventHandlerUnion<T, DragEvent>;
    ondragleave?: EventHandlerUnion<T, DragEvent>;
    ondragover?: EventHandlerUnion<T, DragEvent>;
    ondragstart?: EventHandlerUnion<T, DragEvent>;
    ondrop?: EventHandlerUnion<T, DragEvent>;
    ondurationchange?: EventHandlerUnion<T, Event>;
    onemptied?: EventHandlerUnion<T, Event>;
    onended?: EventHandlerUnion<T, Event>;
    onerror?: EventHandlerUnion<T, Event>;
    onfocus?: EventHandlerUnion<T, FocusEvent>;
    ongotpointercapture?: EventHandlerUnion<T, PointerEvent>;
    oninput?: EventHandlerUnion<T, InputEvent>;
    oninvalid?: EventHandlerUnion<T, Event>;
    onkeydown?: EventHandlerUnion<T, KeyboardEvent>;
    onkeypress?: EventHandlerUnion<T, KeyboardEvent>;
    onkeyup?: EventHandlerUnion<T, KeyboardEvent>;
    onload?: EventHandlerUnion<T, Event>;
    onloadeddata?: EventHandlerUnion<T, Event>;
    onloadedmetadata?: EventHandlerUnion<T, Event>;
    onloadstart?: EventHandlerUnion<T, Event>;
    onlostpointercapture?: EventHandlerUnion<T, PointerEvent>;
    onmousedown?: EventHandlerUnion<T, MouseEvent>;
    onmouseenter?: EventHandlerUnion<T, MouseEvent>;
    onmouseleave?: EventHandlerUnion<T, MouseEvent>;
    onmousemove?: EventHandlerUnion<T, MouseEvent>;
    onmouseout?: EventHandlerUnion<T, MouseEvent>;
    onmouseover?: EventHandlerUnion<T, MouseEvent>;
    onmouseup?: EventHandlerUnion<T, MouseEvent>;
    onpause?: EventHandlerUnion<T, Event>;
    onplay?: EventHandlerUnion<T, Event>;
    onplaying?: EventHandlerUnion<T, Event>;
    onpointercancel?: EventHandlerUnion<T, PointerEvent>;
    onpointerdown?: EventHandlerUnion<T, PointerEvent>;
    onpointerenter?: EventHandlerUnion<T, PointerEvent>;
    onpointerleave?: EventHandlerUnion<T, PointerEvent>;
    onpointermove?: EventHandlerUnion<T, PointerEvent>;
    onpointerout?: EventHandlerUnion<T, PointerEvent>;
    onpointerover?: EventHandlerUnion<T, PointerEvent>;
    onpointerup?: EventHandlerUnion<T, PointerEvent>;
    onprogress?: EventHandlerUnion<T, Event>;
    onratechange?: EventHandlerUnion<T, Event>;
    onreset?: EventHandlerUnion<T, Event>;
    onscroll?: EventHandlerUnion<T, UIEvent>;
    onseeked?: EventHandlerUnion<T, Event>;
    onseeking?: EventHandlerUnion<T, Event>;
    onselect?: EventHandlerUnion<T, UIEvent>;
    onstalled?: EventHandlerUnion<T, Event>;
    onsubmit?: EventHandlerUnion<
        T,
        Event & {
            submitter: HTMLElement;
        }
    >;
    onsuspend?: EventHandlerUnion<T, Event>;
    ontimeupdate?: EventHandlerUnion<T, Event>;
    ontouchcancel?: EventHandlerUnion<T, TouchEvent>;
    ontouchend?: EventHandlerUnion<T, TouchEvent>;
    ontouchmove?: EventHandlerUnion<T, TouchEvent>;
    ontouchstart?: EventHandlerUnion<T, TouchEvent>;
    ontransitionend?: EventHandlerUnion<T, TransitionEvent>;
    onvolumechange?: EventHandlerUnion<T, Event>;
    onwaiting?: EventHandlerUnion<T, Event>;
    onwheel?: EventHandlerUnion<T, WheelEvent>;
}

interface ExplicitProperties { }
interface ExplicitAttributes { }
interface CustomEvents { }
interface CustomCaptureEvents { }
type PropAttributes = {
    [Key in keyof ExplicitProperties as `prop:${Key}`]?: ExplicitProperties[Key];
};
type AttrAttributes = {
    [Key in keyof ExplicitAttributes as `attr:${Key}`]?: ExplicitAttributes[Key];
};
type OnAttributes<T> = {
    [Key in keyof CustomEvents as `on:${Key}`]?: EventHandler<T, CustomEvents[Key]>;
}
type OnCaptureAttributes<T> = {
    [Key in keyof CustomCaptureEvents as `oncapture:${Key}`]?: EventHandler<T, CustomCaptureEvents[Key]>;
}

export interface DOMAttributes<T> extends
    PropAttributes, AttrAttributes, OnAttributes<T>, OnCaptureAttributes<T>, EventHandlersLowerCase<T> {
    children?: Element;
    innerHTML?: string;
    innerText?: string | number;
    textContent?: string | number;
    // camel case events
    onCopy?: EventHandlerUnion<T, ClipboardEvent>;
    onCut?: EventHandlerUnion<T, ClipboardEvent>;
    onPaste?: EventHandlerUnion<T, ClipboardEvent>;
    onCompositionEnd?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionStart?: EventHandlerUnion<T, CompositionEvent>;
    onCompositionUpdate?: EventHandlerUnion<T, CompositionEvent>;
    onFocusOut?: EventHandlerUnion<T, FocusEvent>;
    onFocusIn?: EventHandlerUnion<T, FocusEvent>;
    onEncrypted?: EventHandlerUnion<T, Event>;
    onDragExit?: EventHandlerUnion<T, DragEvent>;
    // lower case events
    oncopy?: EventHandlerUnion<T, ClipboardEvent>;
    oncut?: EventHandlerUnion<T, ClipboardEvent>;
    onpaste?: EventHandlerUnion<T, ClipboardEvent>;
    oncompositionend?: EventHandlerUnion<T, CompositionEvent>;
    oncompositionstart?: EventHandlerUnion<T, CompositionEvent>;
    oncompositionupdate?: EventHandlerUnion<T, CompositionEvent>;
    onfocusout?: EventHandlerUnion<T, FocusEvent>;
    onfocusin?: EventHandlerUnion<T, FocusEvent>;
    onencrypted?: EventHandlerUnion<T, Event>;
    ondragexit?: EventHandlerUnion<T, DragEvent>;
}

type HTMLAutocapitalize = "off" | "none" | "on" | "sentences" | "words" | "characters";
// All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
interface AriaAttributes {
    /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
    "aria-activedescendant"?: string;
    /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
    "aria-atomic"?: boolean | "false" | "true";
    /**
     * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
     * presented if they are made.
     */
    "aria-autocomplete"?: "none" | "inline" | "list" | "both";
    /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
    "aria-busy"?: boolean | "false" | "true";
    /**
     * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
     * @see aria-pressed @see aria-selected.
     */
    "aria-checked"?: boolean | "false" | "mixed" | "true";
    /**
     * Defines the total number of columns in a table, grid, or treegrid.
     * @see aria-colindex.
     */
    "aria-colcount"?: number | string;
    /**
     * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
     * @see aria-colcount @see aria-colspan.
     */
    "aria-colindex"?: number | string;
    /**
     * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-colindex @see aria-rowspan.
     */
    "aria-colspan"?: number | string;
    /**
     * Identifies the element (or elements) whose contents or presence are controlled by the current element.
     * @see aria-owns.
     */
    "aria-controls"?: string;
    /** Indicates the element that represents the current item within a container or set of related elements. */
    "aria-current"?: boolean | "false" | "true" | "page" | "step" | "location" | "date" | "time";
    /**
     * Identifies the element (or elements) that describes the object.
     * @see aria-labelledby
     */
    "aria-describedby"?: string;
    /**
     * Identifies the element that provides a detailed, extended description for the object.
     * @see aria-describedby.
     */
    "aria-details"?: string;
    /**
     * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
     * @see aria-hidden @see aria-readonly.
     */
    "aria-disabled"?: boolean | "false" | "true";
    /**
     * Indicates what functions can be performed when a dragged object is released on the drop target.
     * @deprecated in ARIA 1.1
     */
    "aria-dropeffect"?: "none" | "copy" | "execute" | "link" | "move" | "popup";
    /**
     * Identifies the element that provides an error message for the object.
     * @see aria-invalid @see aria-describedby.
     */
    "aria-errormessage"?: string;
    /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
    "aria-expanded"?: boolean | "false" | "true";
    /**
     * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
     * allows assistive technology to override the general default of reading in document source order.
     */
    "aria-flowto"?: string;
    /**
     * Indicates an element's "grabbed" state in a drag-and-drop operation.
     * @deprecated in ARIA 1.1
     */
    "aria-grabbed"?: boolean | "false" | "true";
    /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
    "aria-haspopup"?: boolean | "false" | "true" | "menu" | "listbox" | "tree" | "grid" | "dialog";
    /**
     * Indicates whether the element is exposed to an accessibility API.
     * @see aria-disabled.
     */
    "aria-hidden"?: boolean | "false" | "true";
    /**
     * Indicates the entered value does not conform to the format expected by the application.
     * @see aria-errormessage.
     */
    "aria-invalid"?: boolean | "false" | "true" | "grammar" | "spelling";
    /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
    "aria-keyshortcuts"?: string;
    /**
     * Defines a string value that labels the current element.
     * @see aria-labelledby.
     */
    "aria-label"?: string;
    /**
     * Identifies the element (or elements) that labels the current element.
     * @see aria-describedby.
     */
    "aria-labelledby"?: string;
    /** Defines the hierarchical level of an element within a structure. */
    "aria-level"?: number | string;
    /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
    "aria-live"?: "off" | "assertive" | "polite";
    /** Indicates whether an element is modal when displayed. */
    "aria-modal"?: boolean | "false" | "true";
    /** Indicates whether a text box accepts multiple lines of input or only a single line. */
    "aria-multiline"?: boolean | "false" | "true";
    /** Indicates that the user may select more than one item from the current selectable descendants. */
    "aria-multiselectable"?: boolean | "false" | "true";
    /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
    "aria-orientation"?: "horizontal" | "vertical";
    /**
     * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
     * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
     * @see aria-controls.
     */
    "aria-owns"?: string;
    /**
     * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
     * A hint could be a sample value or a brief description of the expected format.
     */
    "aria-placeholder"?: string;
    /**
     * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-setsize.
     */
    "aria-posinset"?: number | string;
    /**
     * Indicates the current "pressed" state of toggle buttons.
     * @see aria-checked @see aria-selected.
     */
    "aria-pressed"?: boolean | "false" | "mixed" | "true";
    /**
     * Indicates that the element is not editable, but is otherwise operable.
     * @see aria-disabled.
     */
    "aria-readonly"?: boolean | "false" | "true";
    /**
     * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
     * @see aria-atomic.
     */
    "aria-relevant"?:
    | "additions"
    | "additions removals"
    | "additions text"
    | "all"
    | "removals"
    | "removals additions"
    | "removals text"
    | "text"
    | "text additions"
    | "text removals";
    /** Indicates that user input is required on the element before a form may be submitted. */
    "aria-required"?: boolean | "false" | "true";
    /** Defines a human-readable, author-localized description for the role of an element. */
    "aria-roledescription"?: string;
    /**
     * Defines the total number of rows in a table, grid, or treegrid.
     * @see aria-rowindex.
     */
    "aria-rowcount"?: number | string;
    /**
     * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
     * @see aria-rowcount @see aria-rowspan.
     */
    "aria-rowindex"?: number | string;
    /**
     * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-rowindex @see aria-colspan.
     */
    "aria-rowspan"?: number | string;
    /**
     * Indicates the current "selected" state of various widgets.
     * @see aria-checked @see aria-pressed.
     */
    "aria-selected"?: boolean | "false" | "true";
    /**
     * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-posinset.
     */
    "aria-setsize"?: number | string;
    /** Indicates if items in a table or grid are sorted in ascending or descending order. */
    "aria-sort"?: "none" | "ascending" | "descending" | "other";
    /** Defines the maximum allowed value for a range widget. */
    "aria-valuemax"?: number | string;
    /** Defines the minimum allowed value for a range widget. */
    "aria-valuemin"?: number | string;
    /**
     * Defines the current value for a range widget.
     * @see aria-valuetext.
     */
    "aria-valuenow"?: number | string;
    /** Defines the human readable text alternative of aria-valuenow for a range widget. */
    "aria-valuetext"?: string;
    role?:
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "button"
    | "cell"
    | "checkbox"
    | "columnheader"
    | "combobox"
    | "complementary"
    | "contentinfo"
    | "definition"
    | "dialog"
    | "directory"
    | "document"
    | "feed"
    | "figure"
    | "form"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "meter"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "region"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem";
}
type HTMLDir = "ltr" | "rtl" | "auto";

export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // [key: ClassKeys]: boolean;
    accessKey?: string;
    class?: string | undefined;
    contenteditable?: boolean | "inherit";
    contextmenu?: string;
    dir?: HTMLDir;
    draggable?: boolean;
    hidden?: boolean;
    id?: string;
    lang?: string;
    spellcheck?: boolean;
    style?: string;
    tabindex?: number | string;
    title?: string;
    translate?: "yes" | "no";
    about?: string;
    datatype?: string;
    inlist?: any;
    prefix?: string;
    property?: string;
    resource?: string;
    typeof?: string;
    vocab?: string;
    autocapitalize?: HTMLAutocapitalize;
    slot?: string;
    color?: string;
    itemprop?: string;
    itemscope?: boolean;
    itemtype?: string;
    itemid?: string;
    itemref?: string;
    part?: string;
    exportparts?: string;
    inputmode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
    contentEditable?: boolean | "inherit";
    contextMenu?: string;
    tabIndex?: number | string;
    autoCapitalize?: HTMLAutocapitalize;
    itemProp?: string;
    itemScope?: boolean;
    itemType?: string;
    itemId?: string;
    itemRef?: string;
    exportParts?: string;
    inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
}