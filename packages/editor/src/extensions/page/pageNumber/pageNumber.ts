/**
 * `PageNumber` — the automatic page number, as an **inline atom**.
 *
 * ## Why a node and not text
 *
 * The legacy header/footer materialised `"第#页，共&页"` into a real text node at flush
 * time. That had three consequences, all of them defects:
 *
 * 1. `textFormat` defaulted to `""`, so `schema.text("")` threw
 *    `RangeError: Empty text nodes are not allowed` — 「新页面」 and the margin panel threw
 *    in a default document (defect 1);
 * 2. the number was frozen into the saved template, so adding or removing a page left the
 *    old numbers wrong (defect 10);
 * 3. refreshing them meant rewriting text in every page, from stale positions, in the
 *    same transaction (defect 11).
 *
 * A node has none of those properties: the label is computed from the enclosing `page`
 * node's `index` attribute and `editor.storage.page.total` at render time, so a
 * renumbering pass is a pure attribute change and no document text is ever rewritten.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps, Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { DATA_TYPE, PAGE_NUMBER_CLASS } from "../constant/dom";
import { DEFAULT_PAGE_NUMBER_ATTRIBUTES } from "../constant/defaults";
import type { PageNumberOptions } from "../typing/pageNumber";
import type { PageStorage } from "../typing/page";
import { countPages, PAGE_NUMBER_NODE, resolvePageNumber } from "../utils/nodes";
import { formatPageNumberLabel } from "../utils/pageNumberLabel";
import { planPageNumberFormat } from "../utils/pageNumberFormat";

export const PageNumber = Node.create<PageNumberOptions>({
  name: PAGE_NUMBER_NODE,
  group: "inline",
  inline: true,
  // `atom` + no `contentDOM`: the caret can never be parked inside an invisible node,
  // which is the variable extension's defect 24 (Backspace then deleted hidden text).
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      format: DEFAULT_PAGE_NUMBER_ATTRIBUTES.format,
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    const fallback = this.options.format ?? DEFAULT_PAGE_NUMBER_ATTRIBUTES.format;

    return {
      format: {
        default: fallback,
        parseHTML: (element) => element.getAttribute("data-format"),
        renderHTML: (attributes) => ({ "data-format": attributes.format })
      }
    };
  },

  parseHTML() {
    return [{ tag: `span[data-type="${DATA_TYPE.pageNumber}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes, {
        "data-type": DATA_TYPE.pageNumber
      })
    ];
  },

  addNodeView() {
    const fallbackFormat = this.options.format ?? DEFAULT_PAGE_NUMBER_ATTRIBUTES.format;

    return ({ node, editor, getPos }) => {
      const dom = document.createElement("span");
      dom.className = PAGE_NUMBER_CLASS;
      dom.setAttribute("data-type", DATA_TYPE.pageNumber);
      // A leaf atom with nothing to edit: the caret must not enter it. This is *not* the
      // defect-19 mistake, which set `contentEditable="false"` on the contentDOM of a
      // node whose whole purpose was to hold editable content.
      dom.contentEditable = "false";

      let format = readFormat(node.attrs.format, fallbackFormat);

      const render = (): void => {
        const total = resolveTotal(editor);
        const position = getPos();
        const page =
          position === undefined ? 1 : resolvePageNumber(editor.state.doc, position, total).page;
        const label = formatPageNumberLabel(format, page, total, fallbackFormat);
        if (dom.textContent !== label) dom.textContent = label;
      };

      /**
       * A node view's `update` is only called when *its own* node or attributes change.
       * A page number's label depends on a **sibling** page's `index`, which changes
       * without this node being touched at all — so the view has to follow the editor's
       * transactions itself and recompute. The subscription is removed in `destroy`.
       *
       * The cost is one cheap label computation per transaction per page number node
       * (a `resolve`, a depth walk, a string build and a `textContent` comparison that
       * writes nothing when the value is unchanged). At contract scale — tens of pages,
       * one number each — that is far cheaper than the legacy alternative of rewriting
       * every page's text.
       */
      const onTransaction = (): void => render();
      editor.on("transaction", onTransaction);
      render();

      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== PAGE_NUMBER_NODE) return false;
          format = readFormat(updated.attrs.format, fallbackFormat);
          render();
          return true;
        },
        destroy: () => {
          editor.off("transaction", onTransaction);
        },
        ignoreMutation: () => true
      };
    };
  },

  addCommands() {
    const fallback = this.options.format ?? DEFAULT_PAGE_NUMBER_ATTRIBUTES.format;

    return {
      insertPageNumber:
        (format?: string) =>
        ({ commands, editor, state }: CommandProps): boolean => {
          if (!editor.schema.nodes[PAGE_NUMBER_NODE]) return false;

          // An inline node cannot live in a block NodeSelection (the variable inserter's
          // defect 29 threw `RangeError` from exactly this state). Refuse instead.
          if (state.selection instanceof NodeSelection && !state.selection.node.isTextblock) {
            return false;
          }

          return commands.insertContent({
            type: PAGE_NUMBER_NODE,
            attrs: { format: format ?? fallback }
          });
        },

      /**
       * Set the page number's format — and **create the number when the document has none**.
       *
       * This is what the 页码格式 control calls. Turning the footer on gives the page an empty
       * footer, so "write the format onto the existing numbers" would have nothing to write to:
       * choosing a format *is* how a user asks for a page number, so the missing one is created.
       * {@link planPageNumberFormat} holds the whole rule (footer before header, one number per
       * page, highest position first) and is pure, so the behaviour is unit-tested without a DOM.
       *
       * Returns `false` when there is nothing to do: no page has furniture, or every page number
       * already carries this format.
       */
      applyPageNumberFormat:
        (format: string) =>
        ({ state, tr, dispatch }: CommandProps): boolean => {
          const planned = planPageNumberFormat(state, format, tr);
          if (!planned) return false;
          if (dispatch) dispatch(planned);
          return true;
        }
    };
  }
});

function readFormat(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/**
 * How many pages the document has.
 *
 * `storage.page.total` is recomputed after every structural change, so it is the primary
 * source; counting the document is the fallback for an editor where the `Page` extension
 * is not registered (the storage entry is then absent at runtime, whatever the type
 * augmentation says).
 */
function resolveTotal(editor: Editor): number {
  const storage = editor.storage.page as PageStorage | undefined;
  if (storage && typeof storage.total === "number" && storage.total >= 1) return storage.total;
  return Math.max(1, countPages(editor.state.doc));
}
