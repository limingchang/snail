/**
 * `page` 节点的节点视图：纸张盒子。
 *
 * 旧版节点视图给 `dom` 和 `contentDOM` 返回了*同一个*元素，于是 ProseMirror 把页面的每个子节点都
 * 直接渲染进那个元素，任何非文档内容都没有容身之处——这正是为什么加水印或 Logo 只能跟子节点映射
 * 硬碰（重建笔记 §2、缺陷 18 和水印注意事项）。这里 `dom` 是纸张、`contentDOM` 是它内部的列，
 * 从而留出了两种刻意**不属于**内容的东西的位置：把页面页边距传下去给正文的 CSS 自定义属性，
 * 以及未来任何浮层（水印），后者现在有了明确的去处。
 *
 * Logo 已经不再是浮层：它曾是 `page` 的一个 `pageLogo` 子节点，被画进一个与 `contentDOM` 同级的
 * `<img>`，靠 `position` 属性和毫米偏移定位。页面的子节点没有「页脚的左三分之一」，所以模型表达不了
 * Logo 该在哪；现在 Logo 是 `pageRegion` 里的一个块，自己画自己（见 `pageLogo/pageLogo.ts`）。
 *
 * The `page` node view: the paper box.
 *
 * ## Why `dom` and `contentDOM` are different elements
 *
 * The legacy node view returned the *same* element for both:
 *
 * ```ts
 * return { dom: page, contentDOM: page };
 * ```
 *
 * ProseMirror then renders every child of the page straight into that element, so there
 * is no place for anything that is not document content — which is why a watermark or a
 * logo could not be added without fighting the child mapping (rebuild notes §2, defect 18
 * and the watermark caveat).
 *
 * Here `dom` is the sheet and `contentDOM` is the column inside it. That leaves room for
 * two things that are deliberately **not** content:
 *
 * 1. the CSS custom properties that carry the page's margins down to the body;
 * 2. any future overlay (a watermark), which now has an obvious home.
 *
 * ## The logo is not an overlay any more
 *
 * It used to be one: a `pageLogo` child of the page, drawn into an `<img>` that was a sibling of
 * `contentDOM`, positioned by a `position` attribute plus millimetre offsets. A page child has no
 * "left third of the footer", so the model could not express where a logo belongs; the logo is a
 * block inside a `pageRegion` now and draws itself (see `pageLogo/pageLogo.ts`).
 */

import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { resolveMargins, resolvePaperSize } from "../../typings/paper";
import type { ResolvedMargins } from "../../typings/paper";
import {
  CSS_VARIABLE,
  DATA_TYPE,
  PAGE_CLASS,
  PAGE_INNER_CLASS
} from "./constant";
import {
  readMargins,
  readOrientation,
  readPaperFormat
} from "./utils/attributes";
import { readPageIndex } from "./utils/nodes";

/** `page` 节点的节点视图。 / The `page` node's node view. */
export function renderPageNodeView(): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement("section");
    dom.className = PAGE_CLASS;
    dom.setAttribute("data-type", DATA_TYPE.page);

    // `contentDOM` — where ProseMirror renders pageHeader/pageContent/pageFooter.
    const content = document.createElement("div");
    content.className = PAGE_INNER_CLASS;
    dom.appendChild(content);

    const apply = (current: PMNode): void => {
      applyPageGeometry(dom, current);
    };
    apply(node);

    return {
      dom,
      contentDOM: content,
      update: (updated) => {
        if (updated.type !== node.type) return false;
        apply(updated);
        return true;
      },
      destroy: () => {
        // Nothing is scheduled and nothing is subscribed to here. The hook is implemented
        // so the contract is explicit rather than accidental: every node view in this
        // module implements `update` and `destroy` (the legacy ones did neither, and the
        // header leaked a `setTimeout`).
      },
      ignoreMutation: (mutation) => !content.contains(mutation.target)
    };
  };
}

/**
 * 给纸张定尺寸，并把它的页边距发布为可继承的自定义属性。
 *
 * 页边距属于 `page` 节点，但消费它们的内边距在正文上，而只改页面属性时 ProseMirror *不会*重新渲染
 * 正文——所以它们以自定义属性的形式传下去，正文完全不用 JavaScript 就能自己重新设定样式。
 *
 * Size the sheet and publish its margins as inherited custom properties.
 *
 * The margins belong to the `page` node, but the padding that consumes them is on the body, which
 * ProseMirror does *not* re-render when only the page's attributes change — so they travel down as
 * custom properties and the body restyles itself with no JavaScript at all.
 */
function applyPageGeometry(dom: HTMLElement, page: PMNode): ResolvedMargins {
  const size = resolvePaperSize(
    readPaperFormat(page.attrs.paperFormat),
    readOrientation(page.attrs.orientation)
  );
  dom.style.width = `${size.width}mm`;
  dom.style.height = `${size.height}mm`;

  const margins = resolveMargins(readMargins(page.attrs.margins));
  dom.style.setProperty(CSS_VARIABLE.marginTop, margins.top);
  dom.style.setProperty(CSS_VARIABLE.marginRight, margins.right);
  dom.style.setProperty(CSS_VARIABLE.marginBottom, margins.bottom);
  dom.style.setProperty(CSS_VARIABLE.marginLeft, margins.left);

  const index = String(readPageIndex(page, 1));
  if (dom.dataset.index !== index) dom.dataset.index = index;
  const auto = page.attrs.auto === true ? "true" : "false";
  if (dom.dataset.auto !== auto) dom.dataset.auto = auto;

  return margins;
}
