/**
 * `PageLogo` — an optional, absolutely positioned mark in the page's header area.
 *
 * The node is a **page child** (one position wide, no content) so that the logo lives in
 * the document, round-trips through save/load and can be changed by a command. It is
 * *drawn* by the page's node view (`../pageView.ts`) as an overlay sibling of that view's
 * `contentDOM`; this node view renders only a hidden placeholder. ProseMirror maps a
 * node's children into its parent's `contentDOM`, so a logo rendered there would sit in
 * the document flow, be re-parented on every body re-render, and could never overlay the
 * paper — the same constraint the watermark has to respect.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { DATA_TYPE, PAGE_LOGO_PLACEHOLDER_CLASS } from "../constant/dom";
import { DEFAULT_LOGO_ATTRIBUTES } from "../constant/defaults";
import type { LogoPosition, PageLogoAttributes, PageLogoOptions } from "../typing/pageLogo";
import {
  readCss,
  readLogoPosition,
  readNumber,
  readString
} from "../utils/attributes";
import { collectPages, findChild, PAGE_LOGO_NODE } from "../utils/nodes";
import type { PageRef } from "../utils/nodes";

export const PageLogo = Node.create<PageLogoOptions>({
  name: PAGE_LOGO_NODE,
  group: "page",
  atom: true,
  // Not selectable: the visible mark is an overlay the page renders, so a NodeSelection
  // on the hidden placeholder would highlight nothing. `removeLogo` is the delete path.
  selectable: false,
  draggable: false,

  addOptions() {
    return {
      src: DEFAULT_LOGO_ATTRIBUTES.src,
      width: DEFAULT_LOGO_ATTRIBUTES.width,
      height: DEFAULT_LOGO_ATTRIBUTES.height,
      position: DEFAULT_LOGO_ATTRIBUTES.position,
      offsetX: DEFAULT_LOGO_ATTRIBUTES.offsetX,
      offsetY: DEFAULT_LOGO_ATTRIBUTES.offsetY,
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    const defaults = resolveDefaults(this.options);

    return {
      src: {
        default: defaults.src,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) =>
          typeof attributes.src === "string" && attributes.src !== ""
            ? { "data-src": attributes.src }
            : {}
      },
      width: {
        default: defaults.width,
        parseHTML: (element) => element.getAttribute("data-width"),
        renderHTML: (attributes) => ({ "data-width": attributes.width })
      },
      height: {
        default: defaults.height,
        parseHTML: (element) => element.getAttribute("data-height"),
        renderHTML: (attributes) => ({ "data-height": attributes.height })
      },
      position: {
        default: defaults.position,
        parseHTML: (element) => element.getAttribute("data-position"),
        renderHTML: (attributes) => ({ "data-position": attributes.position })
      },
      offsetX: {
        default: defaults.offsetX,
        parseHTML: (element) => readDataNumber(element, "data-offset-x"),
        renderHTML: (attributes) =>
          attributes.offsetX === 0 || attributes.offsetX === undefined
            ? {}
            : { "data-offset-x": String(attributes.offsetX) }
      },
      offsetY: {
        default: defaults.offsetY,
        parseHTML: (element) => readDataNumber(element, "data-offset-y"),
        renderHTML: (attributes) =>
          attributes.offsetY === 0 || attributes.offsetY === undefined
            ? {}
            : { "data-offset-y": String(attributes.offsetY) }
      }
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${DATA_TYPE.pageLogo}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    // A leaf node: no content hole in the spec.
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes, {
        "data-type": DATA_TYPE.pageLogo
      })
    ];
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.className = PAGE_LOGO_PLACEHOLDER_CLASS;
      dom.setAttribute("data-type", DATA_TYPE.pageLogo);
      // Hidden on purpose: the visible logo is the page node view's overlay. Keeping a
      // real element here (rather than returning `null`) leaves ProseMirror's DOM mapping
      // intact, so `view.nodeDOM(logoPos)` and `removeLogo` keep agreeing.
      dom.hidden = true;

      return {
        dom,
        update: (updated: PMNode) => updated.type.name === PAGE_LOGO_NODE,
        destroy: () => {
          // Nothing to release.
        },
        ignoreMutation: () => true
      };
    };
  },

  addCommands() {
    const defaults = resolveDefaults(this.options);

    return {
      addLogo:
        (attributes?: Partial<PageLogoAttributes>, pageIndex?: number) =>
        (props: CommandProps): boolean =>
          upsertLogo(props, defaults, attributes, pageIndex),

      removeLogo:
        (pageIndex?: number) =>
        (props: CommandProps): boolean =>
          removeLogo(props, pageIndex),

      setLogoPosition:
        (position: LogoPosition, pageIndex?: number) =>
        (props: CommandProps): boolean =>
          setLogoAttribute(props, "position", position, pageIndex)
    };
  }
});

/** The resolved defaults for a fresh logo. */
function resolveDefaults(options: PageLogoOptions): PageLogoAttributes {
  return {
    src: readString(options.src, DEFAULT_LOGO_ATTRIBUTES.src),
    width: readCss(options.width, DEFAULT_LOGO_ATTRIBUTES.width),
    height: readCss(options.height, DEFAULT_LOGO_ATTRIBUTES.height),
    position: readLogoPosition(options.position),
    offsetX: readNumber(options.offsetX, DEFAULT_LOGO_ATTRIBUTES.offsetX),
    offsetY: readNumber(options.offsetY, DEFAULT_LOGO_ATTRIBUTES.offsetY)
  };
}

/**
 * Add the logo where it is missing and update it where it exists.
 *
 * New nodes are appended at the **end** of the page's content and pages are visited last
 * to first, so an insertion cannot invalidate a page that has not been handled yet
 * (defect 11).
 */
function upsertLogo(
  props: CommandProps,
  defaults: PageLogoAttributes,
  attributes: Partial<PageLogoAttributes> | undefined,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const nodeType = state.schema.nodes[PAGE_LOGO_NODE];
  if (!nodeType) return false;

  const pages = selectPages(state.doc, pageIndex);
  let changed = false;

  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    const existing = findChild(page, PAGE_LOGO_NODE);

    if (!existing) {
      const attrs = { ...defaults, ...definedOnly(attributes) };
      tr.insert(page.pos + page.node.nodeSize - 1, nodeType.create(attrs));
      changed = true;
      continue;
    }

    for (const [key, value] of Object.entries(definedOnly(attributes))) {
      if (existing.node.attrs[key] === value) continue;
      tr.setNodeAttribute(existing.pos, key, value);
      changed = true;
    }
  }

  if (changed && dispatch) dispatch(tr);
  return changed;
}

/** Remove the logo from the selected pages. Succeeds (with `false`) where there is none. */
function removeLogo(props: CommandProps, pageIndex: number | undefined): boolean {
  const { state, tr, dispatch } = props;
  const pages = selectPages(state.doc, pageIndex);
  let changed = false;

  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const child = findChild(pages[index], PAGE_LOGO_NODE);
    if (!child) continue;
    tr.delete(child.pos, child.pos + child.node.nodeSize);
    changed = true;
  }

  if (changed && dispatch) dispatch(tr);
  return changed;
}

/** Set one logo attribute; `false` when every logo already has that value. */
function setLogoAttribute(
  props: CommandProps,
  key: keyof PageLogoAttributes,
  value: PageLogoAttributes[keyof PageLogoAttributes],
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const pages = selectPages(state.doc, pageIndex);
  let changed = false;

  for (const page of pages) {
    const child = findChild(page, PAGE_LOGO_NODE);
    if (!child) continue;
    if (child.node.attrs[key] === value) continue;
    tr.setNodeAttribute(child.pos, key, value);
    changed = true;
  }

  if (changed && dispatch) dispatch(tr);
  return changed;
}

function selectPages(doc: PMNode, pageIndex: number | undefined): PageRef[] {
  const pages = collectPages(doc);
  if (pageIndex === undefined) return pages;
  return pages.filter((page) => page.ordinal === pageIndex);
}

/** Drop keys whose value is `undefined`, so a partial patch never writes `undefined`. */
function definedOnly(
  attributes: Partial<PageLogoAttributes> | undefined
): Partial<PageLogoAttributes> {
  if (!attributes) return {};
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) defined[key] = value;
  }
  return defined;
}

function readDataNumber(element: HTMLElement, attribute: string): number | null {
  const raw = element.getAttribute(attribute);
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
