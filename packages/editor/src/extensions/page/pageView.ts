/**
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
 * three things that are deliberately **not** content:
 *
 * 1. the logo overlay (`pageLogo`) — absolutely positioned, a sibling of `contentDOM`;
 * 2. the CSS custom properties that carry the page's margins down to the body;
 * 3. any future overlay (a watermark), which now has an obvious home.
 */

import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { resolveMargins, resolvePaperSize } from "../../typings/paper";
import type { ResolvedMargins } from "../../typings/paper";
import {
  CSS_VARIABLE,
  DATA_TYPE,
  DEFAULT_LOGO_ATTRIBUTES,
  PAGE_CLASS,
  PAGE_INNER_CLASS,
  PAGE_LOGO_CLASS
} from "./constant";
import {
  readCss,
  readLogoPosition,
  readMargins,
  readNumber,
  readOrientation,
  readPaperFormat,
  readString
} from "./utils/attributes";
import { findChildNode, PAGE_LOGO_NODE, readPageIndex } from "./utils/nodes";

/** The `page` node's node view. */
export function renderPageNodeView(): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement("section");
    dom.className = PAGE_CLASS;
    dom.setAttribute("data-type", DATA_TYPE.page);

    // `contentDOM` — where ProseMirror renders pageHeader/pageContent/pageFooter.
    const content = document.createElement("div");
    content.className = PAGE_INNER_CLASS;
    dom.appendChild(content);

    // The logo overlay, a *sibling* of `contentDOM` (never a child of it).
    const logo = document.createElement("img");
    logo.className = PAGE_LOGO_CLASS;
    logo.setAttribute("data-type", DATA_TYPE.pageLogo);
    logo.alt = "";
    logo.hidden = true;
    dom.appendChild(logo);

    const apply = (current: PMNode): void => {
      const margins = applyPageGeometry(dom, current);
      applyLogo(logo, current, margins);
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
 * Size the sheet and publish its margins as inherited custom properties.
 *
 * @returns The resolved margins, so the logo overlay can align to the same box.
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

/**
 * Draw the page's logo (if it has one) into the overlay.
 *
 * Anchoring, documented because it is the one thing a consumer cannot infer: the
 * horizontal anchor is inside the page's **content area** (`left` + `margins.left`,
 * `right` + `margins.right`, `center` across it) and the vertical `offsetY` runs down
 * from the **top edge of the sheet**, i.e. inside the header band. That combination is
 * what "a logo in the header area" means in a contract: a mark at the left of the paper
 * with right-aligned header text beside it.
 */
function applyLogo(overlay: HTMLImageElement, page: PMNode, margins: ResolvedMargins): void {
  const logo = findChildNode(page, PAGE_LOGO_NODE);
  const src = logo ? readString(logo.attrs.src, "") : "";

  if (src === "") {
    if (!overlay.hidden) overlay.hidden = true;
    if (overlay.hasAttribute("src")) overlay.removeAttribute("src");
    return;
  }

  overlay.hidden = false;
  if (overlay.getAttribute("src") !== src) overlay.src = src;
  overlay.style.width = readCss(logo?.attrs.width, DEFAULT_LOGO_ATTRIBUTES.width);
  overlay.style.height = readCss(logo?.attrs.height, DEFAULT_LOGO_ATTRIBUTES.height);

  const position = readLogoPosition(logo?.attrs.position);
  const offsetX = `${readNumber(logo?.attrs.offsetX, DEFAULT_LOGO_ATTRIBUTES.offsetX)}mm`;
  const offsetY = `${readNumber(logo?.attrs.offsetY, DEFAULT_LOGO_ATTRIBUTES.offsetY)}mm`;

  overlay.style.top = offsetY;

  if (position === "right") {
    overlay.style.left = "auto";
    overlay.style.right = `calc(${margins.right} + ${offsetX})`;
    overlay.style.transform = "none";
    return;
  }

  if (position === "center") {
    overlay.style.left = "50%";
    overlay.style.right = "auto";
    overlay.style.transform = `translateX(calc(-50% + ${offsetX}))`;
    return;
  }

  overlay.style.left = `calc(${margins.left} + ${offsetX})`;
  overlay.style.right = "auto";
  overlay.style.transform = "none";
}
