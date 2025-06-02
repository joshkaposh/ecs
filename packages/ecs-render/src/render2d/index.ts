import { defineResource } from 'define';

export const Render2d = defineResource(class Render2d {
    #ctx: CanvasRenderingContext2D;

    constructor(context: CanvasRenderingContext2D) {
        this.#ctx = context;
    }

    static from_world() {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        return new Render2d(canvas.getContext('2d')!);
    }

    get stroke() {
        return this.#ctx.strokeStyle;
    }

    setStroke(style: string | CanvasGradient | CanvasPattern) {
        this.#ctx.strokeStyle = style;
        return this;
    }

    get fillStyle() {
        return this.#ctx.fillStyle;
    }

    setFill(style: string | CanvasGradient | CanvasPattern) {
        this.#ctx.fillStyle = style;
        return this;
    }

    get filter() {
        return this.#ctx.filter;
    }

    setFilter(filter: string) {
        this.#ctx.filter = filter;
        return this;
    }

    clip(fillRule?: CanvasFillRule) {
        this.#ctx.clip(fillRule);
        return this;
    }

    createConicGradient(startAngle: number, x: number, y: number) {
        return this.#ctx.createConicGradient(startAngle, x, y);
    }

    createImageData(sw: number, sh: number, settings?: ImageDataSettings) {
        return this.#ctx.createImageData(sw, sh, settings);
    }

    createLinearGradient() {
        return this.#ctx.createLinearGradient;
    }

    createPattern() {
        return this.#ctx.createPattern;
    }

    createRadialGradient() {
        return this.#ctx.createRadialGradient;
    }

    drawFocusIfNeeded(element: Element): void;
    drawFocusIfNeeded(path: Path2D, element: Element): void;
    drawFocusIfNeeded(path: Path2D | Element, element?: Element) {
        const ctx = this.#ctx;
        element ?
            ctx.drawFocusIfNeeded(path as Path2D, element) :
            ctx.drawFocusIfNeeded(path as Element);

        return this;
    }

    get lineWidth() {
        return this.#ctx.lineWidth;
    }

    setLineWidth(width: number) {
        this.#ctx.lineWidth = width;
        return this;
    }

    get lineCap() {
        return this.#ctx.lineCap;
    }

    setLineCap(cap: CanvasLineCap) {
        this.#ctx.lineCap = cap;
        return this;
    }

    get lineJoin() {
        return this.#ctx.lineJoin;
    }

    setLineJoin(join: CanvasLineJoin) {
        this.#ctx.lineJoin = join;
        return this;
    }

    get lineDashOffset() {
        return this.#ctx.lineDashOffset;
    }

    setLineDashOffset(offset: number) {
        this.#ctx.lineDashOffset = offset;
        return this;
    }

    image(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
        this.#ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
        return this;
    }

    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
        this.#ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        return this;
    }

    clear(x: number, y: number, w: number, h: number) {
        this.#ctx.clearRect(x, y, w, h);
        return this;
    }

    fillRect(x: number, y: number, w: number, h: number) {
        this.#ctx.fillRect(x, y, w, h);
        return this;
    }

    rect(x: number, y: number, w: number, h: number) {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.stroke();
        ctx.closePath();
        return this;
    }

    text(x: number, y: number, text: string) {
        this.#ctx.fillText(text, x, y);
        return this;
    }

    line(x1: number, y1: number, x2: number, y2: number) {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.closePath();
        return this;
    }

    tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x1, x1);
        ctx.stroke();
        ctx.closePath();
        return this;
    }

    fillTri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
        const ctx = this.#ctx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.lineTo(x1, x1);
        ctx.fill();
        ctx.closePath();
        return this;
    }

    polygon(vertices: number[]) {
        const ctx = this.#ctx;
        if (vertices.length === 4) {
            return this.line(vertices[0], vertices[1], vertices[2], vertices[3])
        } else if (vertices.length === 6) {
            return this.tri(vertices[0], vertices[1], vertices[2], vertices[3], vertices[4], vertices[5])
        } else {
            const start_x = vertices[0];
            const start_y = vertices[1];
            ctx.beginPath();
            ctx.moveTo(start_x, start_y)
            for (let i = 2; i < vertices.length; i += 2) {
                ctx.lineTo(i, i + 1);
            }
            ctx.moveTo(start_x, start_y);
            ctx.stroke();
            ctx.closePath();
            return this;
        }
    }

    fillPolygon(vertices: number[]) {
        const ctx = this.#ctx;
        if (vertices.length === 4) {
            return this.line(vertices[0], vertices[1], vertices[2], vertices[3])
        } else if (vertices.length === 6) {
            return this.fillTri(vertices[0], vertices[1], vertices[2], vertices[3], vertices[4], vertices[5])
        } else {
            const start_x = vertices[0];
            const start_y = vertices[1];
            ctx.moveTo(start_x, start_y)
            for (let i = 2; i < vertices.length; i += 2) {
                ctx.lineTo(i, i + 1);
            }
            ctx.moveTo(start_x, start_y);
            ctx.fill();
            return this;
        }
    }
}
)