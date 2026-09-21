/**
 * The header/footer extension factory.
 *
 * `PageHeader` and `PageFooter` were ~95 % identical in the legacy package, and the two
 * copies drifted: the attribute was `headerLing` in one and the option `headerLine` in
 * the other, and both had their own stale-position flush command (defect 11). Here there
 * is exactly one implementation and two names.
 *
 * ## Ordering rule (defect 11)
 *
 * Whenever several pages are mutated in one transaction, the pages are visited **last to
 * first**. Inserting or deleting a header shifts every position after it, so an ascending
 * loop would splice stale positions — the corruption the legacy `__flush*` commands
 * produced. Descending visits leave all not-yet-visited positions valid.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import {
  DEFAULT_FOOTER_ALIGN,
  DEFAULT_FURNITURE_HEIGHT,
  DEFAULT_FURNITURE_LINE,
  DEFAULT_HEADER_ALIGN
} from "../constant/defaults";
import type { FurnitureAttributes, FurnitureSide, TextAlign } from "../typing/headerFooter";
import { renderFurnitureNodeView } from "./furnitureView";
import { collectPages, findChild, PAGE_FOOTER_NODE, PAGE_HEADER_NODE } from "./nodes";
import type { PageRef } from "./nodes";

/** Resolved options of a furniture extension. `side` is internal: it selects the name. */
interface FurnitureOptions {
  side: FurnitureSide;
  height: number;
  align: TextAlign;
  showLine: boolean;
  HTMLAttributes: Record<string, string>;
}

/** The names one side contributes. */
interface FurnitureNames {
  node: string;
  dataType: string;
  add: string;
  remove: string;
  height: string;
  align: string;
}

const NAMES: Record<FurnitureSide, FurnitureNames> = {
  top: {
    node: PAGE_HEADER_NODE,
    dataType: "page-header",
    add: "addHeader",
    remove: "removeHeader",
    height: "setHeaderHeight",
    align: "setHeaderAlign"
  },
  bottom: {
    node: PAGE_FOOTER_NODE,
    dataType: "page-footer",
    add: "addFooter",
    remove: "removeFooter",
    height: "setFooterHeight",
    align: "setFooterAlign"
  }
};

/**
 * Create the header (`side: "top"`) or footer (`side: "bottom"`) extension.
 *
 * Both are `isolating`, so a click inside the header never extends a selection out of it,
 * and both tolerate a page without them — the state the legacy `createPage` could not
 * build at all (defect 9).
 */
export function createPageFurniture(side: FurnitureSide): Node<FurnitureOptions> {
  const names = NAMES[side];

  return Node.create<FurnitureOptions>({
    name: names.node,
    group: "page",
    content: "block*",
    isolating: true,

    addOptions() {
      return {
        side,
        height: DEFAULT_FURNITURE_HEIGHT,
        align: side === "top" ? DEFAULT_HEADER_ALIGN : DEFAULT_FOOTER_ALIGN,
        showLine: DEFAULT_FURNITURE_LINE,
        HTMLAttributes: {}
      };
    },

    addAttributes() {
      return {
        height: { default: this.options.height },
        align: { default: this.options.align },
        // One spelling, attribute and option alike (defect 20).
        showLine: { default: this.options.showLine }
      };
    },

    parseHTML() {
      return [{ tag: `div[data-type="${names.dataType}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
          "data-type": names.dataType
        }),
        0
      ];
    },

    addNodeView() {
      return renderFurnitureNodeView(side);
    },

    addProseMirrorPlugins() {
      return [furnitureClickPlugin(names)];
    },

    addCommands() {
      const defaults: FurnitureAttributes = {
        height: this.options.height,
        align: this.options.align,
        showLine: this.options.showLine
      };

      if (side === "top") {
        return {
          addHeader: (pageIndex?: number) => (props: CommandProps) =>
            addFurniture(props, names, defaults, pageIndex),
          removeHeader: (pageIndex?: number) => (props: CommandProps) =>
            removeFurniture(props, names, pageIndex),
          setHeaderHeight: (height: number, pageIndex?: number) => (props: CommandProps) =>
            setFurnitureAttribute(props, names, "height", height, pageIndex),
          setHeaderAlign: (align: TextAlign, pageIndex?: number) => (props: CommandProps) =>
            setFurnitureAttribute(props, names, "align", align, pageIndex)
        };
      }

      return {
        addFooter: (pageIndex?: number) => (props: CommandProps) =>
          addFurniture(props, names, defaults, pageIndex),
        removeFooter: (pageIndex?: number) => (props: CommandProps) =>
          removeFurniture(props, names, pageIndex),
        setFooterHeight: (height: number, pageIndex?: number) => (props: CommandProps) =>
          setFurnitureAttribute(props, names, "height", height, pageIndex),
        setFooterAlign: (align: TextAlign, pageIndex?: number) => (props: CommandProps) =>
          setFurnitureAttribute(props, names, "align", align, pageIndex)
      };
    }
  });
}

/** The header extension (`pageHeader` + `addHeader`/`removeHeader`/…). */
export const PageHeader = createPageFurniture("top");

/** The footer extension (`pageFooter` + `addFooter`/`removeFooter`/…). */
export const PageFooter = createPageFurniture("bottom");

/**
 * Clicking anywhere in a header/footer band puts the caret **inside** it.
 *
 * ## The problem this solves
 *
 * A header is a `block*` container whose content, when freshly added, is a single empty
 * paragraph. Clicking the band's padding — or, depending on the browser, the empty paragraph
 * itself — does not resolve to a *text* position: there is no text to hit, so the click maps
 * to the node boundary and ProseMirror selects the whole header (`NodeSelection`). From the
 * user's side that reads as "the header cannot be edited": there is no caret, typing replaces
 * the header instead of filling it, and clicking again does not help. The theme even carries
 * a `.ProseMirror-selectednode` rule for the band, which is this state made visible.
 *
 * ## Why the fix runs after ProseMirror, not instead of it
 *
 * This handler deliberately does **not** intercept the click. It lets ProseMirror do its own
 * mapping and only intervenes in the one case that is wrong: a `NodeSelection` produced by a
 * click that landed inside a band. If the click already produced a caret in the band, nothing
 * here runs — so a future ProseMirror that maps empty bands correctly simply makes this
 * handler a no-op rather than a competing implementation.
 *
 * `TextSelection.near(..., 1)` also handles the "clicked the padding, not the paragraph" case:
 * it walks to the nearest position that can actually hold a caret.
 */
function furnitureClickPlugin(names: FurnitureNames): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        click: (view, event) => {
          // In fill mode the document is read-only: there is no caret to place.
          if (!view.editable) return false;

          const target = event.target as HTMLElement | null;
          const band = target?.closest?.(`[data-type="${names.dataType}"]`) as HTMLElement | null;
          if (!band || !view.dom.contains(band)) return false;

          const tr = planFurnitureClick(view.state, view.posAtDOM(band, 0), names.node);
          if (!tr) return false;

          view.dispatch(tr);
          view.focus();
          return false;
        }
      }
    }
  });
}

/**
 * The transaction that turns "the whole header got selected" back into "the caret is in the
 * header" — or `null` when the click produced a state that is already correct.
 *
 * Pure and separate from the plugin so the one rule that matters is unit-tested without a DOM:
 * it fires **only** when the resulting selection is a `NodeSelection` on exactly this band
 * (`bandPos` is the position before the band, which is what `view.posAtDOM(band, 0)` reports for
 * a node view). A caret already inside the band, a node selection the user made deliberately
 * (a page number, a QR code), or a click elsewhere all return `null` — so this can only correct
 * the broken case, never compete with ProseMirror's own mapping.
 */
export function planFurnitureClick(
  state: EditorState,
  bandPos: number,
  nodeName: string
): Transaction | null {
  if (!(state.selection instanceof NodeSelection)) return null;

  const clamped = Math.min(Math.max(bandPos, 0), state.doc.content.size);
  if (state.selection.from !== clamped) return null;
  if (state.selection.node.type.name !== nodeName) return null;

  // `clamped + 1` is inside the band: `TextSelection.near` walks to the nearest position that
  // can actually hold a caret, which also covers a click on the band's padding rather than on
  // its paragraph.
  const inside = state.doc.resolve(Math.min(clamped + 1, state.doc.content.size));
  return state.tr.setSelection(TextSelection.near(inside, 1));
}

/**
 * Add the furniture node to the pages that lack it.
 *
 * `pageIndex` (1-based) limits the change to one page, which is what makes "only some
 * pages have a header" a supported state rather than a broken one.
 */
function addFurniture(
  props: CommandProps,
  names: FurnitureNames,
  defaults: FurnitureAttributes,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const nodeType = state.schema.nodes[names.node];
  if (!nodeType) return false;

  const pages = selectPages(state.doc, pageIndex);
  // The first piece of furniture already in the document is the template, so a header the
  // user has styled is what the next page gets.
  const templateAttributes = firstFurnitureAttributes(pages, names.node, defaults);

  let changed = false;
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    if (findChild(page, names.node)) continue;
    tr.insert(page.pos + 1, nodeType.create(templateAttributes, emptyBlockContent(state.schema)));
    changed = true;
  }

  if (changed && dispatch) dispatch(tr);
  return changed;
}

/** Remove the furniture node from the pages that have one. Never throws when absent. */
function removeFurniture(
  props: CommandProps,
  names: FurnitureNames,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const pages = selectPages(state.doc, pageIndex);

  let changed = false;
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const child = findChild(pages[index], names.node);
    if (!child) continue;
    tr.delete(child.pos, child.pos + child.node.nodeSize);
    changed = true;
  }

  if (changed && dispatch) dispatch(tr);
  return changed;
}

/**
 * Set one attribute on every furniture node.
 *
 * Returns `false` when every node already has that value, so a caller can avoid a redraw
 * and a pointless history entry (the legacy `setPageFormat` returned `true` always,
 * defect 17).
 */
function setFurnitureAttribute(
  props: CommandProps,
  names: FurnitureNames,
  key: "height" | "align",
  value: number | TextAlign,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const pages = selectPages(state.doc, pageIndex);

  let changed = false;
  for (const page of pages) {
    const child = findChild(page, names.node);
    if (!child) continue;
    if (child.node.attrs[key] === value) continue;
    // Attribute steps do not shift positions, so ascending order is safe here.
    tr.setNodeAttribute(child.pos, key, value);
    changed = true;
  }

  if (changed && dispatch) dispatch(tr);
  return changed;
}

/** The pages a command targets: all of them, or the one with the given 1-based number. */
function selectPages(doc: PMNode, pageIndex: number | undefined): PageRef[] {
  const pages = collectPages(doc);
  if (pageIndex === undefined) return pages;
  return pages.filter((page) => page.ordinal === pageIndex);
}

/** The attributes of the first furniture node present, used as the template for new ones. */
function firstFurnitureAttributes(
  pages: PageRef[],
  typeName: string,
  defaults: FurnitureAttributes
): FurnitureAttributes {
  for (const page of pages) {
    const child = findChild(page, typeName);
    if (!child) continue;
    const attributes: Record<string, unknown> = child.node.attrs;
    return {
      height:
        typeof attributes.height === "number" && Number.isFinite(attributes.height)
          ? attributes.height
          : defaults.height,
      align: isTextAlign(attributes.align) ? attributes.align : defaults.align,
      showLine: typeof attributes.showLine === "boolean" ? attributes.showLine : defaults.showLine
    };
  }
  return defaults;
}

function isTextAlign(value: unknown): value is TextAlign {
  return value === "left" || value === "center" || value === "right" || value === "justify";
}

/**
 * A single empty paragraph, so a freshly added header is immediately typeable.
 *
 * `block*` also accepts an empty header, so this is convenience rather than a schema
 * requirement — and it is skipped when the consumer did not register `paragraph`.
 */
function emptyBlockContent(schema: Schema): Fragment | undefined {
  const paragraph = schema.nodes["paragraph"];
  return paragraph ? Fragment.from(paragraph.create()) : undefined;
}
