/**
 * 二维码的节点视图——一个普通的 ProseMirror `NodeView`。
 *
 * 它不是 Vue 组件，也没有用 `@tiptap/vue-3` 的 `VueNodeViewRenderer` 构建，因此扩展里没有
 * 任何框架：同一个扩展在 Vue 宿主、React 宿主或裸 ProseMirror 编辑器里都可用。视图就是一个
 * `<img>`——与 `renderHTML` 产出的是同一个元素，因此编辑器和导出的文档不可能长得不一样。
 *
 * ## 这个视图关掉的三个旧 bug
 *
 * - **文档是尺寸与位置的唯一来源。** 每条声明都来自 {@link qrCodeStyle}，而它由节点属性推导；
 *   视图不写任何文档不知道的东西，因此重新渲染、撤销或重新加载都不会丢失它（缺陷 32）。
 * - **位置就是节点自己的。** 任何地方都没有
 *   `document.querySelector('[data-type="qrcode"]')`：那个查询是文档全局的，因此它可能改到
 *   *另一个*编辑器的二维码，而且二维码一被删除它就会解引用 `null`（缺陷 33）。
 * - **没有任何裁剪。** 元素自己绝对定位，不添加自己的裁剪盒，`z-index` 也保持在水印之下。
 *
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

/** 构建视图。 / Build the view. */
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

  /**
   * 标记位图可见或不可见的原因，供 CSS 与诊断使用。
   *
   * Mark why the raster is or is not visible, for CSS and for a diagnostic.
   */
  const setState = (state: "empty" | "loading" | "ready" | "error"): void => {
    image.dataset.qrcodeState = state;
  };

  const handleLoad = (): void => setState("ready");
  const handleError = (): void => setState("error");

  image.addEventListener("load", handleLoad);
  image.addEventListener("error", handleError);

  /**
   * 绘制当前属性。
   *
   * `style.cssText` 是一次整属性写入，在这里是正确的：视图拥有这个元素，而它可能携带的每条
   * 声明都由 {@link qrCodeStyle} 产出，因此没有别的东西需要保留。（整写也是*被移除*的属性得
   * 以生效的原因——逐属性赋值会留下过期的 `width`。）
   *
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
     * 元素内部的每一次变更都是视图自己在绘制。
     *
     * 当 ProseMirror 的 observer 看到不是它造成的变更时，节点视图的 DOM 会被读回文档，而这个
     * 元素的 `src`/`style`/`alt` 每次更新都由 {@link paint} 写入——所以没有这个方法的话，位图
     * URL 会被当成一次文档编辑。
     *
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
