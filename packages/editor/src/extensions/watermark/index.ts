/**
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

/** Re-export the contract, so a host imports everything from one place. */
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

/** The node type a watermark is attached to. One overlay per page. */
const PAGE_NODE_NAME = "page";

/**
 * The transaction meta flag that says "the settings changed, rebuild the decorations".
 *
 * Deliberately not exported: a caller that set it by hand would also have to know that it must
 * write `editor.storage.watermark.settings` first, and {@link refreshWatermarkDecorations} is
 * that operation with the ordering already right.
 */
const WATERMARK_META = "sEditorWatermarkSettingsChanged";

/** The plugin state: the settings the set was built from, and the set. */
interface WatermarkPluginState {
  settings: WatermarkSettings;
  decorations: DecorationSet;
}

/** Identifies the plugin, so its state can be read back out of the editor state. */
export const watermarkPluginKey = new PluginKey<WatermarkPluginState>("sEditorWatermark");

/**
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

/** The `watermark` extension. */
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

    /** Merge a patch into the settings and repaint. Returns `true` when anything changed. */
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

/** The commands the extension adds. */
declare module "@tiptap/core" {
  interface Storage {
    watermark: WatermarkStorage;
  }

  interface Commands<ReturnType> {
    watermark: {
      /** Replace the watermark settings. `false` when nothing changed. */
      setWatermark: (options: WatermarkOptions) => ReturnType;

      /** Turn the watermark off, keeping its settings. `false` when already off. */
      removeWatermark: () => ReturnType;

      /** Flip the watermark, or set it explicitly. `false` when nothing changed. */
      toggleWatermark: (enabled?: boolean) => ReturnType;
    };
  }
}

/** The default export, so `import Watermark from "./watermark"` also works. */
export default Watermark;
