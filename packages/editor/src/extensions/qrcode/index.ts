/**
 * `qrcode` 块级节点。
 *
 * ## 旧扩展哪里不对
 *
 * - **它根本插不进去。** `insertQRCode` 插入到
 *   `editor.$nodes("pageContent")[0].pos`，而 `$nodes(name).pos` 是该节点*之前*的位置——
 *   一个位于 `page` 内部的槽位，而 `page` 的内容表达式容不下一个块级节点。ProseMirror 抛出
 *   `ReplaceError: Invalid content for node page`，Tiptap 把它改抛为 `TransformError`，
 *   工具栏则把它吞成「插入失败」（缺陷 30）。这里的位置是从光标向外走到最近的、能够*容纳*
 *   块级节点的祖先得到的，并且在派发之前先在一个丢弃的事务上预演一次插入。
 * - **`storage.qrcode.hasQRCode` 只能写一次**（缺陷 31），因此删掉二维码后编辑器就永久无法
 *   再插入一个。这里没有这样的标记：`hasQRCode()` 与 {@link documentHasQRCode} 都读取文档。
 * - **`updateQRCode` 是个空操作**（缺陷 32）——它传入了一个未声明的 `{ options }` 属性，因此
 *   尺寸和位置只能靠工具栏里直接写 DOM 来改。这里的每个属性都是 schema 属性、由命令修改，
 *   而节点视图从这些属性推导自己的样式。
 * - **工具栏在删除之后空指针解引用**（缺陷 33），因为它在整个文档里查询
 *   `[data-type="qrcode"]`。本扩展没有任何地方这样做：命令通过选区与文档解析*它们自己的*
 *   节点。
 * - **`text` 不在 schema 里**（缺陷 34），因此载荷每次保存都会丢失。它是一个属性，并且能往返。
 * - **位图固定为 200 px**（缺陷 34），因此为印刷而放大的码越大越糊。现在宽度由请求的尺寸在
 *   `QR_PRINT_DPI` 下推导。
 *
 * ## 异步
 *
 * 生成位图需要一个 `<canvas>`，因此 `qrcode` 是惰性导入的，生成过程是一个 promise。Tiptap 的
 * 命令是同步的，所以需要位图的命令返回 `true`——「已接受」——并在图片就绪时派发。让这件事安全
 * 的两条规则：
 *
 * - *位置*在派发时（插入）从活动文档解析，或在写入前（更新）重新检查，因此 `await` 之前捕获的
 *   位置永远不会在 `await` 之后被使用；
 * - promise 在触碰视图之前检查 `editor.isDestroyed`，因此在使用方于中途卸载编辑器时，不会在
 *   一个已死的编辑器上派发。
 *
 * 失败通过 `options.onError` 上报，因为没有别的通道：canvas 失败时命令早已返回。
 *
 * The `qrcode` block node.
 *
 * ## What was wrong with the legacy extension
 *
 * - **It could not be inserted at all.** `insertQRCode` inserted at
 *   `editor.$nodes("pageContent")[0].pos`, and `$nodes(name).pos` is the position
 *   *before* the node — a slot inside `page`, whose content expression has no room for a
 *   block. ProseMirror raised `ReplaceError: Invalid content for node page`, Tiptap
 *   rethrew it as a `TransformError`, and the toolbar swallowed it as 「插入失败」
 *   (defect 30). Here the position is found by walking outwards from the caret to the
 *   nearest ancestor that can *hold* a block, and the insertion is rehearsed on a
 *   throwaway transaction before it is dispatched.
 * - **`storage.qrcode.hasQRCode` was write-once** (defect 31), so deleting the code made
 *   the editor permanently unable to insert another. There is no such flag: `hasQRCode()`
 *   and {@link documentHasQRCode} read the document.
 * - **`updateQRCode` was a no-op** (defect 32) — it passed an undeclared `{ options }`
 *   attribute, so size and position only ever changed through a direct DOM write in the
 *   toolbar. Every attribute here is a schema attribute changed by a command, and the
 *   node view derives its styles from those attributes.
 * - **The toolbar null-dereferenced after a delete** (defect 33) because it queried the
 *   whole document for `[data-type="qrcode"]`. Nothing in this extension does that: the
 *   commands resolve *their own* node through the selection and the document.
 * - **`text` was not in the schema** (defect 34), so the payload was lost on every save.
 *   It is an attribute, and it round-trips.
 * - **The raster was a fixed 200 px** (defect 34), so a code enlarged for print got
 *   blurrier the bigger it was. The width is derived from the requested size at
 *   `QR_PRINT_DPI` now.
 *
 * ## Asynchrony
 *
 * Generating a raster needs a `<canvas>`, so `qrcode` is imported lazily and the
 * generation is a promise. Tiptap's commands are synchronous, so a command that needs a
 * raster returns `true` — "accepted" — and dispatches when the image is ready. The two
 * rules that make that safe:
 *
 * - the *position* is resolved from the live document at dispatch time (an insertion) or
 *   re-checked before writing (an update), so a position captured before an `await` can
 *   never be used after it;
 * - the promise checks `editor.isDestroyed` before touching the view, so a host that
 *   unmounts the editor mid-flight cannot get a dispatch on a dead editor.
 *
 * Failures are reported through `options.onError`, because there is no other channel: the
 * command has already returned by the time the canvas fails.
 */

import { mergeAttributes, Node } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

import {
  mergeQRCodeAttrs,
  qrCodeAttributes,
  QR_CODE_TYPE_ATTRIBUTE,
  QR_CODE_TYPE_VALUE,
  renderQRCodeConfig
} from "./attributes";
import { generateQRCodeDataURL, generationOptions } from "./generate";
import {
  normalizeAttrs,
  QR_PRINT_DPI,
  qrCodeStyle,
  rasterInputsChanged,
  sameQRCodeAttrs,
  styleString
} from "./geometry";
import { createQRCodeNodeView } from "./nodeView";
import type { QRCodeAttrs, QRCodeInput, QRCodeOptions } from "./typing";

/**
 * 重新导出契约，让宿主从一个地方导入所有内容。
 *
 * Re-export the contract, so a host imports everything from one place.
 */
export type {
  QRCodeAttrs,
  QRCodeConfig,
  QRCodeGenerationOptions,
  QRCodeInput,
  QRCodeNodeView,
  QRCodeNodeViewContext,
  QRCodeOptions,
  QRColor,
  QRErrorCorrectionLevel,
  QRLength,
  QRPosition,
  QRUnit
} from "./typing";
export { QR_UNITS } from "./typing";
export type { ToDataURL } from "./generate";
export { generateQRCodeDataURL, generationOptions, loadToDataURL } from "./generate";
export {
  decodeQRCodeConfig,
  encodeQRCodeConfig,
  isQRUnit,
  lengthToCss,
  normalizeAttrs,
  normalizeColor,
  normalizeConfig,
  normalizeLength,
  normalizeMargin,
  normalizePosition,
  qrCodeStyle,
  QR_CODE_Z_INDEX,
  QR_DEFAULT_ALT,
  QR_DEFAULT_COLOR,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_POSITION,
  QR_DEFAULT_SIZE,
  QR_DEFAULT_TEXT,
  QR_MAX_RASTER_PIXELS,
  QR_MIN_RASTER_PIXELS,
  QR_PRINT_DPI,
  rasterInputsChanged,
  sameLength,
  sameQRCodeAttrs,
  styleString,
  toCssPixels,
  toRasterPixels
} from "./geometry";
export {
  parseQRCodeAttributes,
  QR_CODE_ALT_ATTRIBUTE,
  QR_CODE_CONFIG_ATTRIBUTE,
  QR_CODE_SRC_ATTRIBUTE,
  QR_CODE_TEXT_ATTRIBUTE,
  QR_CODE_TYPE_ATTRIBUTE,
  QR_CODE_TYPE_VALUE
} from "./attributes";

/**
 * 正在插入中的编辑器。
 *
 * 用的是 `WeakSet` 而不是扩展上的标记：它不持有强引用（因此被销毁的编辑器可以被回收），也
 * 无法在两个编辑器之间共享。没有它，双击「插入二维码」会插入两个码，因为生成是异步的，第二
 * 次点击在第一次完成之前就到了。
 *
 * Editors with an insertion in flight.
 *
 * A `WeakSet`, not a flag on the extension: it holds no strong reference (so a destroyed
 * editor is collectable) and it cannot be shared between two editors. Without it a
 * double-click on 「插入二维码」 inserts two codes, because generation is asynchronous and
 * the second click arrives before the first has finished.
 */
const insertionsInFlight = new WeakSet<Editor>();

/** 在文档里找到的一个二维码。 / A QR code found in a document. */
export interface FoundQRCode {
  /** 节点之前的绝对位置。 / Absolute position before the node. */
  pos: number;
  /** 找到的节点本身。 / The node itself. */
  node: ProseMirrorNode;
}

/**
 * 文档中至少含有一个二维码时返回 `true`。
 *
 * `true` when the document contains at least one QR code.
 */
export function docHasQRCode(doc: ProseMirrorNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === "qrcode") {
      found = true;
      // Stop descending: one is enough, and a QR code has no content to search anyway.
      return false;
    }
    return true;
  });
  return found;
}

/**
 * 编辑器的文档中至少含有一个二维码时返回 `true`。
 *
 * 它替代了旧版只能写一次的 `storage.qrcode.hasQRCode`：每次调用都从文档推导，因此删掉二维码
 * 后它会重新变成 `false`（缺陷 31）。
 *
 * `true` when the editor's document contains at least one QR code.
 *
 * The replacement for the legacy write-once `storage.qrcode.hasQRCode`: derived from the
 * document on every call, so deleting the code makes it `false` again (defect 31).
 */
export function documentHasQRCode(editor: Editor): boolean {
  return docHasQRCode(editor.state.doc);
}

/**
 * 命令应当作用其上的那个二维码。
 *
 * 解析顺序如下，因此一次编辑从不依赖调用方是否选中了正确的东西（旧版
 * `updateAttributes(name, …)` 除非恰好有一个 `NodeSelection` 落在该节点上，否则会悄无声息
 * 地什么都不做）：
 *
 * 1. 落在二维码上的 `NodeSelection`——用户明确指的就是它；
 * 2. 文档里唯一的那个二维码；
 * 3. 离选区最近的那个二维码。
 *
 * The QR code a command should act on.
 *
 * Resolution order, so an edit never depends on the caller having selected the right
 * thing (the legacy `updateAttributes(name, …)` silently did nothing unless a
 * `NodeSelection` happened to sit on the node):
 *
 * 1. a `NodeSelection` on a QR code — the user clearly means that one;
 * 2. the only QR code in the document;
 * 3. the QR code nearest the selection.
 */
export function findCurrentQRCode(state: EditorState): FoundQRCode | undefined {
  const selection = state.selection;

  if (selection instanceof NodeSelection && selection.node.type.name === "qrcode") {
    return { pos: selection.from, node: selection.node };
  }

  const found: FoundQRCode[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === "qrcode") {
      found.push({ pos, node });
      return false;
    }
    return true;
  });

  if (found.length === 0) return undefined;
  if (found.length === 1) return found[0];

  let best = found[0];
  let bestDistance = Math.abs(best.pos - selection.from);
  for (const candidate of found) {
    const distance = Math.abs(candidate.pos - selection.from);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 当 `pos` 处确实可以插入一个节点时返回 `true`。
 *
 * 内容表达式可以接受某个节点类型，却仍然在*这个*位置拒绝它（`listItem` 必须以段落开头，
 * 表格单元格有自己的表达式），因此真正的变换才是唯一的权威。在一个丢弃的事务上预演它，正是
 * 把旧缺陷 30 的 `TransformError` 变成「命令返回 `false`」的原因。
 *
 * `true` when a node can actually be inserted at `pos`.
 *
 * A content expression can accept a node type and still reject it at *this* position
 * (a `listItem` must start with a paragraph, a table cell has its own expression), so the
 * real transform is the only authority. Rehearsing it on a throwaway transaction is what
 * turns legacy defect 30's `TransformError` into "the command returns `false`".
 */
function canInsertAt(state: EditorState, pos: number, node: ProseMirrorNode): boolean {
  if (pos < 0 || pos > state.doc.content.size) return false;
  try {
    state.tr.insert(pos, node);
    return true;
  } catch {
    return false;
  }
}

/**
 * 类型为 `type` 的块级节点可以合法插入的最近位置。
 *
 * 遍历从光标开始向外走。能容纳块级节点的最内层节点就是这个码应当归属的容器；如果它不是光标
 * 直接所在的节点（段落、标题、光标位于段落中的 `pageContent`），这个码就放在光标所在块的
 * *之后*，因此段落永远不会被一个印章劈成两半。当文档里根本没有 `page`/`pageContent` 时使用
 * 顶层节点，这也是本扩展在普通的单页编辑器里也能工作的原因。
 *
 * The nearest position where a block-level node of `type` can legally be inserted.
 *
 * The walk starts at the caret and moves outwards. The innermost node that can hold a
 * block is the container the code belongs in; if it is not the node the caret is directly
 * inside (a paragraph, a heading, a `pageContent` with the caret in a paragraph) the code
 * goes *after* the block around the caret, so a paragraph is never split in half by a
 * stamp. When the document has no `page`/`pageContent` at all the top node is used, which
 * is what makes the extension work in a plain single-page editor too.
 */
export function resolveBlockInsertPosition(state: EditorState, type: NodeType): number | undefined {
  const probe: ProseMirrorNode = type.create();
  const container = Fragment.from(probe);
  const $from = state.selection.$from;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if (!$from.node(depth).type.validContent(container)) continue;

    // `$from.pos` is the caret itself, which is a legal slot when the caret sits directly
    // inside the container (between two blocks). Otherwise the code goes after the block
    // that contains the caret: `after(depth + 1)` is that block's end.
    const candidate = depth === $from.depth ? $from.pos : $from.after(depth + 1);
    if (canInsertAt(state, candidate, probe)) return candidate;
  }

  return undefined;
}

/**
 * 把一个已完全解析的节点插入*活动*文档。
 *
 * 只在一次 `await` 之后调用，因此它会重新解析位置并重新检查 `isDestroyed`，而不是相信之前
 * 捕获的任何东西。
 *
 * Insert a fully-resolved node into the *live* document.
 *
 * Called only after an `await`, which is why it re-resolves the position and re-checks
 * `isDestroyed` instead of trusting anything captured earlier.
 */
function commitInsertion(editor: Editor, attrs: QRCodeAttrs): boolean {
  if (editor.isDestroyed) return false;

  const type = editor.state.schema.nodes.qrcode;
  if (!type) return false;

  const pos = resolveBlockInsertPosition(editor.state, type);
  if (pos === undefined) return false;

  const node = type.create({ ...attrs });
  const tr = editor.state.tr.insert(pos, node);
  // Select the new node, so the toolbar's size/position panel is editing it the moment it
  // appears — and so a second insert is an obvious no-op rather than a silent second stamp.
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.dispatch(tr);
  return true;
}

/**
 * 生成位图并把它写到 `pos` 处的二维码上，**只用一个**事务。
 *
 * 属性与 `src` 是刻意一起写入的：一个只改尺寸、不带匹配位图的中间事务会有一帧渲染出被拉伸的
 * 图片，还会为一次用户操作在撤销历史里留下两步。
 *
 * Generate a raster and write it onto the QR code at `pos`, in **one** transaction.
 *
 * Attributes and `src` are written together on purpose: an intermediate transaction that
 * changed the size without the matching raster would render a stretched image for a frame,
 * and would put two steps in the undo history for one user action.
 */
function generateAndApply(editor: Editor, pos: number, attrs: QRCodeAttrs, options: QRCodeOptions): void {
  void generateQRCodeDataURL(attrs, generationOptions(options))
    .then((src) => {
      // The generation outlives the command, so the editor may be gone by now.
      if (editor.isDestroyed) return;

      const current = editor.state.doc.nodeAt(pos);
      // The position is re-checked rather than re-resolved. If the code was deleted or
      // replaced while the canvas was drawing, writing these attributes onto whatever now
      // sits at that offset would corrupt an unrelated node; doing nothing is the honest
      // outcome, and the window is a few milliseconds wide.
      if (!current || current.type.name !== "qrcode") return;

      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, src }));
    })
    .catch((error: unknown) => {
      options.onError(error);
    });
}

/** `qrcode` 节点扩展。 / The `qrcode` node extension. */
export const QRCode = Node.create<QRCodeOptions>({
  name: "qrcode",

  /**
   * 块级、原子，并且真正可拖拽。
   *
   * `draggable: true` 是客户那个「移动」bug 的修复：节点由一次真正的 ProseMirror 拖拽来
   * 移动，这会进入文档、也进入撤销历史，而不是把 `top`/`left` 写到元素上、下一次渲染就丢失。
   * `atom: true` 让它没有内容，因此光标永远无法停在它内部。
   *
   * Block-level, an atom, and genuinely draggable.
   *
   * `draggable: true` is the fix for the customer's "moving" bug: the node is moved by a
   * real ProseMirror drag, which goes into the document and into the undo history, instead
   * of by writing `top`/`left` onto the element and losing it on the next render.
   * `atom: true` gives it no content, so the caret can never be parked inside it.
   */
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      errorCorrectionLevel: "M",
      dpi: QR_PRINT_DPI,
      // A silent failure is worse than a noisy one: generation is asynchronous, so a host
      // that wants to show a message has to subscribe, and a host that does not still gets
      // the failure in the console rather than nowhere.
      onError: (error: unknown) => {
        console.error("[snail] QR code generation failed", error);
      }
    };
  },

  addAttributes() {
    return qrCodeAttributes();
  },

  parseHTML() {
    return [
      {
        // `img` plus an attribute check rather than the selector
        // `img[data-type="qrcode"]`: the attribute check is what actually decides the
        // match, so an unrelated pasted `<img>` is left to the image extension, and the
        // rule works with a plain `getAttribute` stub in a test as well as with a real DOM.
        tag: "img",
        getAttrs: (element: HTMLElement) =>
          element.getAttribute(QR_CODE_TYPE_ATTRIBUTE) === QR_CODE_TYPE_VALUE ? {} : false
      }
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = normalizeAttrs(node.attrs as Partial<QRCodeAttrs>);

    return [
      "img",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          "data-type": QR_CODE_TYPE_VALUE,
          class: "s-editor-qrcode",
          // The same declarations the node view writes, so an exported document is
          // positioned and sized exactly like the editor showed it.
          style: styleString(qrCodeStyle(attrs))
        },
        // The four structured attributes, as one JSON blob. See `attributes.ts`.
        renderQRCodeConfig(attrs)
      )
    ];
  },

  addNodeView() {
    return (props) =>
      createQRCodeNodeView({
        name: "qrcode",
        attrs: normalizeAttrs(props.node.attrs as Partial<QRCodeAttrs>)
      });
  },

  addCommands() {
    const extension = this;

    return {
      /**
       * 插入一个二维码。
       *
       * 在没有合法位置或没有载荷时返回 `false`——从不抛错。需要生成位图时，插入会在位图就绪时
       * 发生；需要知道的调用方应当观察文档（或 `onError`）。
       *
       * Insert a QR code.
       *
       * Returns `false` — never throws — when there is no legal position or no payload.
       * When a raster has to be generated the insertion happens when it is ready; a
       * caller that needs to know should watch the document (or `onError`).
       */
      insertQRCode:
        (attrs?: QRCodeInput) =>
        ({ editor, state }) => {
          const type = state.schema.nodes.qrcode;
          if (!type) return false;

          const next = normalizeAttrs(attrs);

          // A caller that already holds a raster — a re-insert, an import, a test — skips
          // the canvas entirely, and the command stays synchronous.
          if (next.src.length > 0) return commitInsertion(editor, next);

          if (next.text.trim().length === 0) return false;
          if (insertionsInFlight.has(editor)) return false;
          insertionsInFlight.add(editor);

          void generateQRCodeDataURL(next, generationOptions(extension.options))
            .then((src) => {
              // The position is resolved inside `commitInsertion`, from the live document,
              // so the insert can never land at a stale address.
              commitInsertion(editor, { ...next, src });
            })
            .catch((error: unknown) => {
              extension.options.onError(error);
            })
            .finally(() => {
              insertionsInFlight.delete(editor);
            });

          return true;
        },

      /**
       * 替换一个二维码的属性，由扩展自己定位它。
       *
       * 没有二维码、载荷被清空、或什么都不会改变时返回 `false`——最后一种让空操作不进入撤销
       * 历史。
       *
       * Replace a QR code's attributes, addressed by the extension itself.
       *
       * `false` when there is no QR code, when the payload was emptied, or when nothing
       * would change — the last of which keeps a no-op out of the undo history.
       */
      updateQRCode:
        (attrs: QRCodeInput) =>
        ({ editor, state, tr, dispatch }) => {
          const found = findCurrentQRCode(state);
          if (!found) return false;

          const current = normalizeAttrs(found.node.attrs as Partial<QRCodeAttrs>);
          const next = mergeQRCodeAttrs(current, attrs);
          if (sameQRCodeAttrs(current, next)) return false;

          const explicitRaster = typeof attrs.src === "string" && attrs.src.length > 0;
          if (explicitRaster || !rasterInputsChanged(current, next)) {
            if (dispatch) tr.setNodeMarkup(found.pos, undefined, { ...next });
            return true;
          }

          if (next.text.trim().length === 0) return false;
          generateAndApply(editor, found.pos, next, extension.options);
          return true;
        },

      /**
       * 删除当前二维码。文档中没有时返回 `false`。
       *
       * Delete the current QR code. `false` when the document has none.
       */
      removeQRCode:
        () =>
        ({ state, tr, dispatch }) => {
          const found = findCurrentQRCode(state);
          if (!found) return false;
          if (dispatch) tr.delete(found.pos, found.pos + found.node.nodeSize);
          return true;
        },

      /** 从自身属性重新绘制当前二维码。 / Redraw the current QR code from its own attributes. */
      regenerateQRCode:
        () =>
        ({ editor, state }) => {
          const found = findCurrentQRCode(state);
          if (!found) return false;

          const attrs = normalizeAttrs(found.node.attrs as Partial<QRCodeAttrs>);
          if (attrs.text.trim().length === 0) return false;

          generateAndApply(editor, found.pos, attrs, extension.options);
          return true;
        },

      /**
       * 按二维码自身的单位移动它一个增量。
       *
       * 纯文档操作——不重新生成位图，因此拖拽或微调都是瞬时的。偏移由属性规范化器钳在 `0`，
       * 因此会把二维码推出左上角的增量会停在角上，而不是让它消失。
       *
       * Move the current QR code by a delta in its own unit.
       *
       * Pure document work — no raster is regenerated, so a drag or a nudge is instant.
       * The offset is clamped at `0` by the attribute normaliser, so a delta that would
       * push the code off the top-left corner stops at the corner instead of vanishing.
       */
      moveQRCode:
        (dx: number, dy: number) =>
        ({ state, tr, dispatch }) => {
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;

          const found = findCurrentQRCode(state);
          if (!found) return false;

          const current = normalizeAttrs(found.node.attrs as Partial<QRCodeAttrs>);
          const next = mergeQRCodeAttrs(current, {
            position: {
              ...current.position,
              x: current.position.x + dx,
              y: current.position.y + dy
            }
          });
          if (sameQRCodeAttrs(current, next)) return false;

          if (dispatch) tr.setNodeMarkup(found.pos, undefined, { ...next });
          return true;
        },

      /**
       * 文档中已经含有二维码时返回 `true`。
       *
       * 从文档推导，永不来自标记——那个标记正是旧编辑器删掉第一个码之后再也插不进第二个的原因
       * （缺陷 31）。宿主用它来决定在「插入」与「编辑」之间选哪个，而不是用它禁止第二个码：
       * 一份合同完全可以同时带一个收款码和一个核验码。
       *
       * `true` when the document already contains a QR code.
       *
       * Derived from the document, never from a flag — that flag is why the legacy editor
       * could never insert a second code after deleting the first (defect 31). A host uses
       * it to decide between 「插入」 and 「编辑」, not to forbid a second code: a contract
       * may legitimately carry a payment code and a verification code.
       */
      hasQRCode:
        () =>
        ({ state }) =>
          docHasQRCode(state.doc)
    };
  }
});

/** 扩展添加的命令。 / The commands the extension adds. */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    qrcode: {
      /**
       * 插入一个二维码。没有合法位置、或没有载荷时返回 `false`。
       *
       * Insert a QR code. `false` when there is nowhere legal to put one, or no payload.
       */
      insertQRCode: (attrs?: QRCodeInput) => ReturnType;

      /**
       * 替换当前二维码的属性。什么都没变时返回 `false`。
       *
       * Replace the current QR code's attributes. `false` when nothing changed.
       */
      updateQRCode: (attrs: QRCodeInput) => ReturnType;

      /**
       * 删除当前二维码。文档中没有时返回 `false`。
       *
       * Delete the current QR code. `false` when the document has none.
       */
      removeQRCode: () => ReturnType;

      /** 从属性重新绘制当前二维码。 / Redraw the current QR code from its attributes. */
      regenerateQRCode: () => ReturnType;

      /**
       * 按自身单位移动当前二维码 `dx`/`dy`。
       *
       * Move the current QR code by `dx`/`dy` in its own unit.
       */
      moveQRCode: (dx: number, dy: number) => ReturnType;

      /**
       * 文档含有二维码时返回 `true`。派生而来，永不存储。
       *
       * `true` when the document contains a QR code. Derived, never stored.
       */
      hasQRCode: () => ReturnType;
    };
  }
}

/**
 * 默认导出，因此 `import QRCode from "./qrcode"` 也可用。
 *
 * The default export, so `import QRCode from "./qrcode"` also works.
 */
export default QRCode;
