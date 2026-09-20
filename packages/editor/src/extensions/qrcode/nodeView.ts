/**
 * The QR code's node view — a plain ProseMirror `NodeView`.
 *
 * Not a Vue component and not built with `@tiptap/vue-3`'s `VueNodeViewRenderer`, so the
 * extension has no framework in it: the same extension works in a Vue host, a React host
 * or a bare ProseMirror editor. The view is one `<img>` — the same element `renderHTML`
 * produces, so the editor and an exported document cannot look different.
 *
 * ## The three legacy bugs this view closes
 *
 * - **The document is the only source of the size and the position.** Every declaration
 *   comes from {@link qrCodeStyle}, which is derived from the node's attributes; the view
 *   writes nothing the document does not know about, so a re-render, an undo or a reload
 *   cannot lose it (defect 32).
 * - **The position is the node's own.** No `document.querySelector('[data-type="qrcode"]')`
 *   anywhere: that lookup was document-global, so it could edit a *different* editor's
 *   code and it dereferenced `null` as soon as the code had been deleted (defect 33).
 * - **Nothing is clipped.** The element positions itself absolutely and adds no clipping
 *   box of its own, and its `z-index` stays below the watermark's.
 */

import { normalizeAttrs, qrCodeStyle, styleString } from "./geometry";
import type { QRCodeAttrs, QRCodeNodeView, QRCodeNodeViewContext } from "./typing";

/** Build the view. */
export function createQRCodeNodeView(context: QRCodeNodeViewContext): QRCodeNodeView {
  const image = document.createElement("img");

  // `draggable` is set explicitly rather than left to ProseMirror. For a *custom* node view
  // ProseMirror only enables its drag behaviour when the node view's own DOM says it is
  // draggable, and that is the whole fix for the customer's "moving" bug: the node is moved
  // through a real ProseMirror drag (which the document records and undo can reverse)
  // instead of by writing `top`/`left` onto the element.
  image.draggable = true;
  image.className = "s-editor-qrcode";
  image.setAttribute("data-type", context.name);

  let attrs = normalizeAttrs(context.attrs);

  /** Mark why the raster is or is not visible, for CSS and for a diagnostic. */
  const setState = (state: "empty" | "loading" | "ready" | "error"): void => {
    image.dataset.qrcodeState = state;
  };

  const handleLoad = (): void => setState("ready");
  const handleError = (): void => setState("error");

  image.addEventListener("load", handleLoad);
  image.addEventListener("error", handleError);

  /**
   * Paint the current attributes.
   *
   * `style.cssText` is a whole-property write, which is correct here: the view owns this
   * element, and every declaration it may ever carry is produced by {@link qrCodeStyle}, so
   * there is nothing else to preserve. (Rewriting is also what makes a *removed* attribute
   * take effect — assigning per-property would leave a stale `width` behind.)
   */
  const paint = (): void => {
    image.style.cssText = styleString(qrCodeStyle(attrs));
    image.alt = attrs.alt;

    if (attrs.src.length === 0) {
      // `removeAttribute` rather than `src = ""`: an empty `src` makes the browser request
      // the containing page again, which is both wrong and noisy.
      image.removeAttribute("src");
      setState("empty");
      return;
    }

    if (image.getAttribute("src") !== attrs.src) {
      setState("loading");
      image.src = attrs.src;
    }
  };

  paint();

  return {
    dom: image,

    update: (node) => {
      attrs = normalizeAttrs(node.attrs as Partial<QRCodeAttrs>);
      paint();
      // `true` means "this node is mine and I handled it"; returning `false` would make
      // ProseMirror rebuild the element on every attribute change.
      return true;
    },

    selectNode: () => {
      image.classList.add("s-editor-qrcode--selected");
    },

    deselectNode: () => {
      image.classList.remove("s-editor-qrcode--selected");
    },

    /**
     * Every mutation inside the element is the view's own painting.
     *
     * A node view's DOM is read back into the document when ProseMirror's observer sees a
     * mutation it did not cause, and this element's `src`/`style`/`alt` are written by
     * {@link paint} on every update — so without this, the raster URL would be treated as
     * a document edit.
     */
    ignoreMutation: () => true,

    destroy: () => {
      // The element is removed by ProseMirror; the listeners are this view's own and would
      // otherwise keep a detached image alive for the lifetime of the page.
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    }
  };
}
