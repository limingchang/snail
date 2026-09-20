/**
 * Building the watermark's DOM — the only DOM-dependent part of the extension.
 *
 * Every element created here is a *real* element carrying the mark, which is what makes the
 * watermark print: `print-color-adjust: exact` is documented as a hint a browser may
 * ignore, and a CSS background is explicitly allowed to be dropped when the user has not
 * asked for background graphics. See the module comment in `settings.ts`.
 *
 * The element is created by a widget decoration's `toDOM`, so it is never part of the
 * document: it cannot be copied, cannot be exported and cannot be saved (see `index.ts`).
 */

import {
  WATERMARK_CLASS,
  WATERMARK_MARK_CLASS,
  WATERMARK_TILE_CLASS,
  WATERMARK_TILE_COLUMNS,
  WATERMARK_TILE_ROWS,
  watermarkContainerDeclarations,
  watermarkMarkDeclarations,
  watermarkTileImageAttributes,
  watermarkTileSvgAttributes,
  watermarkTileTextAttributes
} from "./settings";
import type { WatermarkSettings } from "./typing";

/** The SVG namespace, needed by `createElementNS`. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** The XLink namespace, for the legacy `xlink:href` an SVG `<image>` may still need. */
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

/** Write a declaration map onto an element's inline style. */
function applyDeclarations(
  element: HTMLElement | SVGElement,
  declarations: Record<string, string>
): void {
  for (const [property, value] of Object.entries(declarations)) {
    element.style.setProperty(property, value);
  }
}

/** Write an attribute map onto an element. */
function applyAttributes(element: Element, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

/** The single centred text mark. */
function createTextMark(settings: WatermarkSettings): HTMLElement {
  const mark = document.createElement("span");
  mark.className = WATERMARK_MARK_CLASS;
  mark.textContent = settings.text;
  applyDeclarations(mark, watermarkMarkDeclarations(settings));
  return mark;
}

/** The single centred image mark. */
function createImageMark(settings: WatermarkSettings): HTMLElement {
  const mark = document.createElement("img");
  mark.className = WATERMARK_MARK_CLASS;
  mark.src = settings.imageSrc;
  // The whole overlay is `aria-hidden`, so the label is not announced; it is still worth
  // having for a host that renders the same element outside a watermark context.
  mark.alt = settings.text.length > 0 ? settings.text : "水印";
  applyDeclarations(mark, watermarkMarkDeclarations(settings));
  return mark;
}

/**
 * One tile.
 *
 * A tiled watermark is a grid of real inline `<svg>` elements, **not** a repeating CSS
 * background image: a background would be dropped by the print dialog's "Background
 * graphics" setting, and the tiled watermark is the one that most needs to survive — it is
 * what a contract uses to make a photocopy obviously a copy.
 */
function createTile(settings: WatermarkSettings): SVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  applyAttributes(svg, watermarkTileSvgAttributes(settings));
  svg.classList.add(WATERMARK_TILE_CLASS);

  if (settings.imageSrc.length > 0) {
    const image = document.createElementNS(SVG_NAMESPACE, "image");
    applyAttributes(image, watermarkTileImageAttributes(settings));
    // `href` is the SVG 2 spelling and `xlink:href` the SVG 1.1 one that older engines and
    // some print pipelines still read. Setting both is cheaper than choosing.
    image.setAttributeNS(XLINK_NAMESPACE, "xlink:href", settings.imageSrc);
    svg.append(image);
    return svg;
  }

  const text = document.createElementNS(SVG_NAMESPACE, "text");
  applyAttributes(text, watermarkTileTextAttributes(settings));
  text.textContent = settings.text;
  svg.append(text);
  return svg;
}

/**
 * The overlay element for one page.
 *
 * `aria-hidden="true"` keeps it out of the accessibility tree and `pointer-events: none`
 * (in the container declarations) keeps it from intercepting a click — a watermark is
 * decoration, and a decoration must not be able to take focus, be selected or be clicked.
 */
export function createWatermarkElement(settings: WatermarkSettings): HTMLElement {
  const container = document.createElement("div");
  container.className = WATERMARK_CLASS;
  container.setAttribute("aria-hidden", "true");
  // A widget is view-only, but an explicit `contenteditable="false"` also stops a browser's
  // own caret handling from treating it as text inside the page.
  container.setAttribute("contenteditable", "false");
  container.setAttribute("data-watermark", settings.tiled ? "tiled" : "single");
  applyDeclarations(container, watermarkContainerDeclarations(settings));

  if (settings.tiled) {
    const total = WATERMARK_TILE_COLUMNS * WATERMARK_TILE_ROWS;
    for (let index = 0; index < total; index += 1) {
      container.append(createTile(settings));
    }
    return container;
  }

  container.append(
    settings.imageSrc.length > 0 ? createImageMark(settings) : createTextMark(settings)
  );
  return container;
}
