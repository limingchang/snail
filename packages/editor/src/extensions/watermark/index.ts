/**
 * `watermark` 扩展——只用于视图，而且刻意不是内容。
 *
 * ## 为什么用装饰
 *
 * 水印是一个 ProseMirror **widget 装饰**：它会被渲染，但永远不会被序列化。ProseMirror 的
 * 文档明确指出装饰「在你把编辑器保存为 JSON 或 HTML 时不会被包含」
 * （https://tiptap.dev/docs/editor/core-concepts/decorations），而这恰恰是水印需要的性质——
 * 它绝不能渗进合同存储的内容、渗进复制粘贴，或渗进导出。水印是关于纸张的*渲染指令*，而不是
 * 文档的一部分，这也是为什么设置被持久化在文档旁边（在 `TemplateDocument` 里）而不是文档内部。
 *
 * ## 为什么用插件状态而不是 `props.decorations`
 *
 * 装饰集由文档的页面加上*文档之外*的状态构建，因此必须告诉 ProseMirror 何时重建它。一个
 * `apply` 在 `docChanged` 或某个 meta 标记上重建的插件状态，正是 Tiptap 有文档记载的模式
 * （`update: "manual"` 加一次显式刷新）；本模块手写实现了同一套机制，因为它不需要 Decorations
 * API 那套按名字记账，也因为插件状态保证能看到*每一个*事务。{@link WATERMARK_META} 标记那次
 * 设置变更事务，它既不碰文档也不碰选区——因此无法进入撤销历史，也无法重新进入 `onUpdate`。
 *
 * ## 为什么挂在 `page` 节点上
 *
 * 每张纸一个覆盖层，是唯一能让水印出现在每一张打印页上的安排：在编辑器上放单个覆盖层，水印
 * 就落在了文档上，而 body 背景根本打印不出来。因此没有 `page` 节点的文档不会显示水印——
 * 本扩展只有与页面扩展一起使用才有意义。
 *
 * The `watermark` extension — view-only, and deliberately not content.
 *
 * ## Why a decoration
 *
 * The watermark is a ProseMirror **widget decoration**: it is rendered, and it is never
 * serialised. ProseMirror's documentation is unambiguous that decorations "are not
 * included when you save the editor as JSON or HTML"
 * (https://tiptap.dev/docs/editor/core-concepts/decorations), which is exactly the
 * property a watermark needs — it must not leak into the contract's stored content, into a
 * copy/paste, or into an export. A watermark is a *rendering instruction about the sheet*,
 * not part of the document, which is also why the settings are persisted next to the
 * document (in the `TemplateDocument`) instead of inside it.
 *
 * ## Why a plugin state rather than `props.decorations`
 *
 * The decoration set is built from the pages of the document plus state that lives *outside*
 * the document, so ProseMirror has to be told when to rebuild it. A plugin state whose
 * `apply` rebuilds on `docChanged` or on a meta flag is the documented Tiptap pattern
 * (`update: "manual"` + an explicit refresh); this module implements the same mechanism by
 * hand because it does not need the Decorations API's per-name bookkeeping, and because a
 * plugin state is guaranteed to see *every* transaction. {@link WATERMARK_META} tags the
 * settings-change transaction, which touches neither the document nor the selection — so it
 * cannot enter the undo history and cannot re-enter `onUpdate`.
 *
 * ## Why it is attached to `page` nodes
 *
 * One overlay per sheet is the only arrangement that puts the mark on every printed page:
 * a single overlay on the editor would be a mark on the document, and a body background
 * would not print at all. A document that has no `page` nodes therefore shows no watermark
 * — the extension is only meaningful alongside the page extension.
 */

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { WatermarkOptions } from "../../typings/editor";

import { createWatermarkElement } from "./dom";
import { isWatermarkVisible, resolveWatermarkSettings, watermarkSettingsEqual } from "./settings";
import type { WatermarkExtensionOptions, WatermarkSettings, WatermarkStorage } from "./typing";

/**
 * 重新导出契约，让宿主从一个地方导入所有内容。
 *
 * Re-export the contract, so a host imports everything from one place.
 */
export type { WatermarkExtensionOptions, WatermarkSettings, WatermarkStorage } from "./typing";
export { WATERMARK_Z_INDEX } from "./typing";
export type { WatermarkOptions } from "../../typings/editor";
export {
  estimateTextWidth,
  isWatermarkVisible,
  resolveWatermarkSettings,
  WATERMARK_CLASS,
  WATERMARK_DEFAULT_ANGLE,
  WATERMARK_DEFAULT_COLOR,
  WATERMARK_DEFAULT_FONT_SIZE,
  WATERMARK_DEFAULT_OPACITY,
  WATERMARK_GREY,
  WATERMARK_IMAGE_TILE_VIEW_BOX,
  WATERMARK_MARK_CLASS,
  WATERMARK_TILE_CLASS,
  WATERMARK_TILE_COLUMNS,
  WATERMARK_TILE_ROWS,
  watermarkContainerDeclarations,
  watermarkFontSizePx,
  watermarkMarkDeclarations,
  watermarkSettingsEqual,
  watermarkTileImageAttributes,
  watermarkTileSvgAttributes,
  watermarkTileTextAttributes
} from "./settings";
export { createWatermarkElement } from "./dom";

/**
 * 水印所挂载的节点类型。每页一个覆盖层。
 *
 * The node type a watermark is attached to. One overlay per page.
 */
const PAGE_NODE_NAME = "page";

/**
 * 表示「设置变了，重建装饰」的事务 meta 标记。
 *
 * 刻意不导出：手工设置它的调用方还得知道必须先写 `editor.storage.watermark.settings`，而
 * {@link refreshWatermarkDecorations} 就是那个已经把顺序摆好的操作。
 *
 * The transaction meta flag that says "the settings changed, rebuild the decorations".
 *
 * Deliberately not exported: a caller that set it by hand would also have to know that it must
 * write `editor.storage.watermark.settings` first, and {@link refreshWatermarkDecorations} is
 * that operation with the ordering already right.
 */
const WATERMARK_META = "sEditorWatermarkSettingsChanged";

/**
 * 插件状态：构建该集合所依据的设置，以及该集合。
 *
 * The plugin state: the settings the set was built from, and the set.
 */
interface WatermarkPluginState {
  /** 构建该集合所依据的设置。 / The settings the set was built from. */
  settings: WatermarkSettings;
  /** 由这些设置构建出的装饰集。 / The decoration set built from those settings. */
  decorations: DecorationSet;
}

/**
 * 标识该插件，以便从编辑器状态里读回它的状态。
 *
 * Identifies the plugin, so its state can be read back out of the editor state.
 */
export const watermarkPluginKey = new PluginKey<WatermarkPluginState>("sEditorWatermark");

/**
 * 为一份文档构建装饰集。
 *
 * 每个 `page` 节点一个 widget，放在该页的**内容起点**（`pos + 1`），于是覆盖层是页面自身元素
 * 的子节点，它的 `inset: 0` 因此就意味着「这张纸」。（放在 `pos` 会让它成为页面的*兄弟*，
 * 从而落在纸与纸之间的空隙里——与旧缺陷 6 属于同一类差一错误。）
 *
 * widget 的 `key` 由页面的序号推导。文档不变时它保持稳定，在本编辑器的集合内也唯一，这正是
 * ProseMirror 对 widget key 的要求；页面的序号是页面唯一的身份，而改用绝对位置会让它上面的每
 * 一次按键都改变所有 key。
 *
 * Build the decoration set for a document.
 *
 * One widget per `page` node, placed at the page's **content start** (`pos + 1`), so the
 * overlay is a child of the page's own element and its `inset: 0` therefore means "the
 * sheet". (Placing it at `pos` would make it a *sibling* of the page and put it in the gap
 * between sheets — the same off-by-one family as legacy defect 6.)
 *
 * The widget's `key` is derived from the page's ordinal position. It is stable while the
 * document is unchanged and unique within this editor's set, which is what ProseMirror
 * requires of a widget key; a page's ordinal is the only identity a page has, and using the
 * absolute position instead would make every key change on every keystroke above it.
 */
export function buildWatermarkDecorations(
  doc: ProseMirrorNode,
  settings: WatermarkSettings
): DecorationSet {
  // A server-side render has no page to decorate, and no `document` to build an element
  // with: the extension must import and instantiate cleanly there.
  if (!isWatermarkVisible(settings) || typeof document === "undefined") {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  let pageIndex = 0;

  doc.descendants((node, pos) => {
    if (node.type.name !== PAGE_NODE_NAME) return true;

    const key = `s-editor-watermark-${pageIndex}`;
    pageIndex += 1;

    decorations.push(
      Decoration.widget(pos + 1, () => createWatermarkElement(settings), {
        key,
        side: 1,
        // The overlay paints over the page and must not be part of the selection, and it
        // must not turn a click on the page into a click on itself.
        ignoreSelection: true,
        stopEvent: () => true
      })
    );

    // A page cannot contain another page, so there is nothing below to look at.
    return false;
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * 请视图重建装饰集。
 *
 * 这个事务只带 meta 标记：没有文档步骤、也没有选区变化，因此它对历史和宿主的 `onUpdate` 都是
 * 不可见的。
 *
 * Ask the view to rebuild the decoration set.
 *
 * The transaction carries only the meta flag: no document step and no selection change, so
 * it is invisible to the history and to a host's `onUpdate`.
 */
export function refreshWatermarkDecorations(editor: Editor): void {
  if (editor.isDestroyed) return;
  const view = editor.view;
  if (!view) return;

  const tr = view.state.tr.setMeta(WATERMARK_META, true);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

/** `watermark` 扩展。 / The `watermark` extension. */
export const Watermark = Extension.create<WatermarkExtensionOptions, WatermarkStorage>({
  name: "watermark",

  addOptions() {
    return {
      enabled: false,
      text: "",
      imageSrc: "",
      angle: -30,
      opacity: 0.12,
      greyscale: false,
      tiled: false,
      fontSize: "48px",
      color: "#000000"
    };
  },

  addStorage() {
    // Default-resolved on purpose: Tiptap may call `addStorage` before the configured
    // options have been merged, and `onCreate` below is the authoritative refresh. Starting
    // from "disabled" also means a half-built editor can never flash a watermark.
    return { settings: resolveWatermarkSettings(undefined) };
  },

  onCreate() {
    const resolved = resolveWatermarkSettings(this.options);
    const stale = this.storage.settings;
    this.storage.settings = resolved;

    // Only repaint when the placeholder and the configuration disagree, so an editor that
    // was configured with the defaults dispatches no transaction at all.
    if (!watermarkSettingsEqual(stale, resolved)) {
      refreshWatermarkDecorations(this.editor);
    }
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin<WatermarkPluginState>({
        key: watermarkPluginKey,

        state: {
          init: (_config, state: EditorState): WatermarkPluginState => {
            const settings = extension.storage.settings;
            return { settings, decorations: buildWatermarkDecorations(state.doc, settings) };
          },

          apply: (
            tr,
            value: WatermarkPluginState,
            _oldState: EditorState,
            newState: EditorState
          ): WatermarkPluginState => {
            const forced = tr.getMeta(WATERMARK_META) === true;
            // Nothing moved and nothing changed, so the existing set is still correct: the
            // widget keys do not depend on absolute positions, and no page was added or
            // removed.
            if (!forced && !tr.docChanged) return value;

            const settings = extension.storage.settings;
            return { settings, decorations: buildWatermarkDecorations(newState.doc, settings) };
          }
        },

        props: {
          decorations: (state: EditorState): DecorationSet =>
            watermarkPluginKey.getState(state)?.decorations ?? DecorationSet.empty
        }
      })
    ];
  },

  addCommands() {
    const extension = this;

    /**
     * 把补丁合并进设置并重绘。有任何变化时返回 `true`。
     *
     * Merge a patch into the settings and repaint. Returns `true` when anything changed.
     */
    const apply = (editor: Editor, patch: WatermarkOptions): boolean => {
      const next = resolveWatermarkSettings({ ...extension.options, ...patch });
      if (watermarkSettingsEqual(extension.storage.settings, next)) return false;

      // Both copies are written: `options` is what a re-`configure`/`onCreate` cycle reads,
      // and `storage` is what the plugin and a host read. They are the same values, so the
      // pair cannot drift.
      Object.assign(extension.options, next);
      extension.storage.settings = next;
      refreshWatermarkDecorations(editor);
      return true;
    };

    return {
      /**
       * 替换水印设置。
       *
       * 部分替换：`setWatermark({ angle: -45 })` 只改倾角，文本保持不变。设置本来就与它完全
       * 相同时返回 `false`，这样宿主可以跳过一次多余的重绘。
       *
       * Replace the watermark settings.
       *
       * Partial: `setWatermark({ angle: -45 })` changes the tilt and leaves the text alone.
       * Returns `false` when the settings already said exactly this, so a host can skip a
       * redundant repaint.
       */
      setWatermark:
        (options: WatermarkOptions) =>
        ({ editor }) =>
          apply(editor, options),

      /**
       * 关闭水印而不忘掉它。
       *
       * 文本、角度和不透明度都会保留，因此重新启用会恢复同一个水印；想让配置彻底消失的宿主
       * 可以通过 {@link setWatermark} 和模板把它清掉。
       *
       * Turn the watermark off without forgetting it.
       *
       * The text, angle and opacity survive, so re-enabling restores the same mark; a host
       * that wants the configuration gone clears it through {@link setWatermark} and the
       * template.
       */
      removeWatermark:
        () =>
        ({ editor }) =>
          apply(editor, { enabled: false }),

      /**
       * 翻转水印，或显式设置它。
       *
       * `toggleWatermark()` 取当前 `enabled` 的反；`toggleWatermark(true)` 是幂等的「开」，
       * 用于可能两次报告同一个值的复选框。
       *
       * Flip the watermark, or set it explicitly.
       *
       * `toggleWatermark()` negates the current `enabled`; `toggleWatermark(true)` is an
       * idempotent "on" for a checkbox that may report the same value twice.
       */
      toggleWatermark:
        (enabled?: boolean) =>
        ({ editor }) =>
          apply(editor, { enabled: enabled ?? !extension.storage.settings.enabled })
    };
  }
});

/** 扩展添加的命令。 / The commands the extension adds. */
declare module "@tiptap/core" {
  interface Storage {
    /** 水印扩展的运行时存储。 / The watermark extension's runtime storage. */
    watermark: WatermarkStorage;
  }

  interface Commands<ReturnType> {
    watermark: {
      /**
       * 替换水印设置。什么都没变时返回 `false`。
       *
       * Replace the watermark settings. `false` when nothing changed.
       */
      setWatermark: (options: WatermarkOptions) => ReturnType;

      /**
       * 关闭水印，但保留其设置。本来就是关闭时返回 `false`。
       *
       * Turn the watermark off, keeping its settings. `false` when already off.
       */
      removeWatermark: () => ReturnType;

      /**
       * 翻转水印，或显式设置它。什么都没变时返回 `false`。
       *
       * Flip the watermark, or set it explicitly. `false` when nothing changed.
       */
      toggleWatermark: (enabled?: boolean) => ReturnType;
    };
  }
}

/**
 * 默认导出，因此 `import Watermark from "./watermark"` 也可用。
 *
 * The default export, so `import Watermark from "./watermark"` also works.
 */
export default Watermark;
