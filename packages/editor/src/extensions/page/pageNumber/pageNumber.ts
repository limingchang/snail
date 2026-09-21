/**
 * `PageNumber`——自动页码，作为一个**内联原子节点**。
 *
 * 旧版页眉 / 页脚在刷新时把 `"第#页，共&页"` 物化成真正的文本节点，带来三个后果，每个都是缺陷：
 * `textFormat` 默认为 `""`，于是 `schema.text("")` 抛出
 * `RangeError: Empty text nodes are not allowed`——「新页面」和页边距面板在默认文档里就会抛错
 * （缺陷 1）；号码被冻进保存的模板，增删页面会让旧号码失效（缺陷 10）；刷新它们意味着在同一个事务
 * 里、用过期位置重写每一页的文本（缺陷 11）。
 *
 * 节点没有这些性质：标签在渲染时由所在 `page` 节点的 `index` 属性和 `editor.storage.page.total`
 * 算出来，所以一次重编号只是属性变化，永远不会重写文档文本。
 *
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
import type { FurnitureSide, FurnitureSlot } from "../typing/headerFooter";
import type { PageNumberOptions } from "../typing/pageNumber";
import type { PageStorage } from "../typing/page";
import { FURNITURE_META } from "../utils/furnitureEditing";
import type { FurnitureMeta } from "../utils/furnitureEditing";
import { countPages, PAGE_NUMBER_NODE, resolvePageNumber } from "../utils/nodes";
import { formatPageNumberLabel } from "../utils/pageNumberLabel";
import {
  planPageNumberFormat,
  planPageNumberPlacement,
  planPageNumberRemoval
} from "../utils/pageNumberFormat";

/**
 * `pageNumber` 扩展：只读的内联原子节点，标签在渲染时算出。
 *
 * The `pageNumber` extension: a read-only inline atom whose label is computed at render time.
 */
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
       * 节点视图的 `update` 只在*它自己*的节点或属性变化时被调用。页码的标签却取决于**兄弟**页面的
       * `index`，它变化时这个节点根本没被碰过——所以视图必须自己跟随编辑器的事务并重新计算。订阅在
       * `destroy` 里解除。
       *
       * 代价是每个页码节点、每个事务一次廉价的标签计算（一次 `resolve`、一次深度遍历、一次字符串
       * 拼接，以及一次在值未变时不写入的 `textContent` 比较）。在合同这种规模下——几十页、每页一个
       * 号码——这远比旧版重写每一页文本的做法便宜。
       *
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
       * 设置页码格式——并且**在文档一个页码都没有时创建它**。
       *
       * 这就是 页码格式 控件调用的命令。打开页脚只会得到一个空页脚，于是「把格式写到已有页码上」
       * 无处可写：选择一个格式*就是*用户要一个页码的方式，所以缺失的那个会被创建出来，放在
       * `DEFAULT_PAGE_NUMBER_PLACEMENT`（页脚中间三分之一），面板随后把它显示为当前位置。
       *
       * 无事可做时返回 `false`：没有任何页面能容纳页码，或每一页的页码已经就是那个样子。
       *
       * Set the page number's format — and **create the number when the document has none**.
       *
       * This is what the 页码格式 control calls. Turning the footer on gives the page an empty
       * footer, so "write the format onto the existing numbers" would have nothing to write to:
       * choosing a format *is* how a user asks for a page number, so the missing one is created —
       * in `DEFAULT_PAGE_NUMBER_PLACEMENT` (the footer's centre third), which the panel then shows
       * as the current position.
       *
       * Returns `false` when there is nothing to do: no page can hold a number, or every page's
       * number already reads that way.
       */
      applyPageNumberFormat:
        (format: string) =>
        ({ state, tr, dispatch }: CommandProps): boolean => {
          const planned = planPageNumberFormat(state, format, tr);
          if (!planned) return false;
          markFurnitureCommand(planned);
          if (dispatch) dispatch(planned);
          return true;
        },

      /**
       * 把页码放到页眉或页脚的指定区域（左 / 中 / 右）。
       *
       * 中文：一页只有一个页码 —— 放到新区域时原来的会被删除（并保留原来的格式），该区域随后不可
       * 编辑；目标页眉 / 页脚或该区域不存在时会先创建它们。
       *
       * Move every page's number into a region: `side` is the header or the footer, `slot` is left,
       * centre or right. One number per page — moving it removes the old one and keeps its format —
       * and the region it lands in is not editable. A band or region that does not exist yet is
       * created, because asking for a placement is asking for the furniture that holds it.
       */
      setPageNumberSlot:
        (side: FurnitureSide, slot: FurnitureSlot) =>
        ({ state, tr, dispatch }: CommandProps): boolean => {
          const planned = planPageNumberPlacement(state, { side, slot }, tr);
          if (!planned) return false;
          markFurnitureCommand(planned);
          if (dispatch) dispatch(planned);
          return true;
        },

      /**
       * 移除所有页码（面板上的 不显示），它原来占据的区域随之解锁。
       *
       * Remove every page number (the panel's 不显示), which unlocks the region it was in.
       */
      removePageNumber:
        () =>
        ({ state, tr, dispatch }: CommandProps): boolean => {
          const planned = planPageNumberRemoval(state, tr);
          if (!planned) return false;
          markFurnitureCommand(planned);
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
 * 把一个事务标记为页眉 / 页脚自己的命令。
 *
 * 事务过滤器（`utils/furnitureEditing.ts`）拒绝触碰页眉 / 页脚的文档改动，除非用户打开了某条栏；
 * 而来自面板的命令是按位置寻址的，无论当时有没有栏打开都必须通过。
 *
 * Mark a transaction as one of the furniture's own commands.
 *
 * The transaction filter (`utils/furnitureEditing.ts`) refuses document changes that touch
 * furniture unless the user has opened a band; a command from the panel is addressed by position
 * and must go through whether or not a band happens to be open.
 */
function markFurnitureCommand(transaction: import("@tiptap/pm/state").Transaction): void {
  transaction.setMeta(FURNITURE_META, { type: "command", command: true } satisfies FurnitureMeta);
}

/**
 * 文档有多少页。
 *
 * `storage.page.total` 在每次结构变化后重算，所以它是首选来源；在 `Page` 扩展没有注册的编辑器里
 * 则退回到数文档（此时 storage 条目在运行时不存在，无论类型增强怎么说）。
 *
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
