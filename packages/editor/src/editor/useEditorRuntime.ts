/**
 * Everything between the props and a live Tiptap editor.
 *
 * ## What this owns
 *
 * 1. **The extension array.** Built inside {@link buildExtensions}, once per editor
 *    instance, from the props. The legacy `generateExtensions` pushed onto a
 *    module-level `baseExtensions` array (defect 36), so creating a second editor — or
 *    remounting the first — registered every extension twice and ProseMirror failed with
 *    `Duplicate extension names found`. A module-level mutable array is the bug; a
 *    function that returns a fresh array is the fix.
 *
 * 2. **The base set, explicitly.** `Document` is always the multi-page document, even
 *    when `multiPage` is `false`: the alternate branch of the legacy function registered
 *    *no* document at all, so ProseMirror threw `Schema is missing its top node type
 *    (doc)` (defect 37). Pagination is optional; a document is not.
 *
 * 3. **Undo/redo.** `UndoRedo` from `@tiptap/extensions` is registered. The legacy
 *    editor had no history whatsoever (defect 14). Pagination transactions mark
 *    themselves `addToHistory: false`, so undo never replays a page split.
 *
 * 4. **Reactivity.** `mode`, the document, the fill data and the extension
 *    configuration are all watched and applied. The legacy component had no `watch` at
 *    all, so the mode, the document and the extension set were frozen at creation and
 *    `props.data` was never read (defect 38).
 *
 * 5. **Cleanup.** Every listener this composable adds goes into {@link disposers} and is
 *    released before the editor is destroyed. The legacy component added
 *    `compositionstart`/`compositionend` listeners on `document` and never removed them,
 *    so they dereferenced a destroyed editor after unmount (defect 39), and it queued an
 *    event-emitter subscription with no unsubscribe, so a dialog opened twice after a
 *    remount (defect 40). The set is empty today — pagination is now driven by the
 *    document, not by an IME flag — but the mechanism is here so that adding one cannot
 *    reintroduce the leak.
 *
 * ## What it deliberately does *not* do
 *
 * No event emitter. The legacy toolbar talked to the dialogs through a module-level
 * emitter, which is why a remount duplicated the subscription. Here a dialog is a child
 * of the component that opens it, and the variable extension's own `onRequestEdit`
 * callback carries the one message that has to cross a boundary.
 */

import { computed, onBeforeUnmount, onMounted, shallowRef, toValue, watch } from "vue";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";

// The Vue binding's `Editor`, not the core one: `@tiptap/vue-3`'s `EditorContent` takes a
// `PropType` of *its own* subclass (which adds `reactiveState`, `appContext` and
// `contentComponent`), so a core `Editor` is structurally incompatible with the component
// that has to mount it — and the subclass is what gives a host reactive `state`/`storage`.
import { Editor } from "@tiptap/vue-3";
import type { AnyExtension, Editor as CoreEditor, Extensions, JSONContent } from "@tiptap/core";

import { Bold } from "@tiptap/extension-bold";
import { Heading } from "@tiptap/extension-heading";
import type { Level } from "@tiptap/extension-heading";
import { Image } from "@tiptap/extension-image";
import { Italic } from "@tiptap/extension-italic";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { TableKit } from "@tiptap/extension-table";
import { Text } from "@tiptap/extension-text";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Underline } from "@tiptap/extension-underline";
import { CharacterCount, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions";

import { createDocument } from "../extensions/document";
import { LayoutMode } from "../extensions/layoutMode";
import { Page } from "../extensions/page";
import { ParagraphStyle } from "../extensions/paragraphStyle";
import { Print } from "../extensions/print";
import { QRCode } from "../extensions/qrcode";
import {
  getVariableValues,
  setVariableMode,
  setVariableValues,
  Variable
} from "../extensions/variable";
import { Watermark } from "../extensions/watermark";

import type { EditorMode, PrintOptions, TemplateContent, WatermarkOptions } from "../typings/editor";
import type { VariableAttrs, VariableFillData } from "../typings/variable";

import type { PageOptions } from "../extensions/page";
import type { QRCodeOptions } from "../extensions/qrcode";

import type { SEditorExtensionOptions, SEditorVariableProps } from "./props";
import { emptyDocument, parseTemplateInput } from "./template";

/** The heading levels offered when the caller does not choose. */
const DEFAULT_HEADING_LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6];

/** What `useEditorRuntime` is configured with. Every field is a getter-friendly ref. */
export interface UseEditorRuntimeOptions {
  /** `"design"` or `"fill"`. */
  mode: MaybeRefOrGetter<EditorMode>;

  /** The document. A JSON document, an HTML string or a full stored template. */
  content?: MaybeRefOrGetter<TemplateContent | undefined>;

  /** Fill data, keyed by variable key. Replaces the previous data on every change. */
  data?: MaybeRefOrGetter<VariableFillData | undefined>;

  /** Register the page extension. Default `true`. */
  multiPage?: MaybeRefOrGetter<boolean | undefined>;

  /** Structures that only apply at creation time. */
  extensions?: MaybeRefOrGetter<SEditorExtensionOptions | undefined>;

  /** Page-extension options. */
  page?: MaybeRefOrGetter<PageOptions | undefined>;

  /** Variable-extension options, minus `mode`/`values`. */
  variable?: MaybeRefOrGetter<SEditorVariableProps | undefined>;

  /** QR-code-extension options. */
  qrcode?: MaybeRefOrGetter<QRCodeOptions | undefined>;

  /** Watermark-extension options. */
  watermark?: MaybeRefOrGetter<WatermarkOptions | undefined>;

  /** Print-extension options. */
  print?: MaybeRefOrGetter<PrintOptions | undefined>;

  /**
   * The document changed.
   *
   * The parameter is **core's** `Editor`, not the Vue subclass: these callbacks are
   * declared by Tiptap's own `EditorOptions`, so Tiptap hands them exactly what it typed
   * them with. `@tiptap/vue-3`'s `Editor` extends core's and does not re-declare
   * `EditorOptions`, so the narrower subclass type cannot be assumed here — see the
   * `CoreEditor` alias below.
   */
  onUpdate?: (editor: CoreEditor) => void;

  /** The selection moved. Panels use this to follow the caret. */
  onSelectionUpdate?: (editor: CoreEditor) => void;

  /** The editor exists and is ready. */
  onReady?: (editor: CoreEditor) => void;

  /** The user asked for a different mode from inside the component. */
  onModeChange?: (mode: EditorMode) => void;

  /** A variable was clicked in design mode. `pos` is `-1` when it could not be resolved. */
  onRequestVariableEdit?: (attrs: VariableAttrs, pos: number) => void;
}

/** What {@link useEditorRuntime} returns. */
export interface EditorRuntime {
  /** The editor, or `undefined` before creation. */
  editor: ShallowRef<Editor | undefined>;

  /** Every registered extension name — the toolbar's gate, not the `tools` list. */
  enabledExtensions: ComputedRef<ReadonlySet<string>>;

  /** The effective mode, after the deprecated `design` alias is applied. */
  mode: ComputedRef<EditorMode>;

  /** Switch modes, telling the host so it can reflect it in the prop. */
  setMode: (mode: EditorMode) => void;

  /** `true` when an extension of that name is registered. */
  hasExtension: (name: string) => boolean;

  /** Replace the document without emitting an update. */
  setContent: (content: TemplateContent) => void;

  /** The current fill data. */
  values: () => VariableFillData;

  /** Destroy and rebuild the editor, e.g. after the extension config changed. */
  recreate: () => void;
}

/**
 * A deterministic, cycle-safe string for a configuration object.
 *
 * Functions become `"fn"` rather than being dropped, so `{ onBeforePrint }` and
 * `{ onAfterPrint }` do not fingerprint identically; a *changed* callback identity still
 * does not rebuild the editor, which is the intent — swapping a callback must not throw
 * away the user's selection. Cycles are marked rather than recursed.
 */
function fingerprint(value: unknown, seen = new Set<unknown>()): string {
  if (value === null) return "null";

  const type = typeof value;
  if (type === "function") return "fn";
  if (type !== "object") return JSON.stringify(value) ?? String(value);

  const object = value as object;
  if (seen.has(object)) return "[cycle]";
  seen.add(object);

  if (Array.isArray(object)) {
    return `[${object.map((entry) => fingerprint(entry, seen)).join(",")}]`;
  }

  const record = object as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${key}:${fingerprint(record[key], seen)}`);
  return `{${entries.join(",")}}`;
}

/** `true` when Tiptap can build a view right now. */
function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Bind the props to a live editor.
 *
 * @param options - the runtime configuration; see {@link UseEditorRuntimeOptions}.
 * @returns the runtime handle. It must be used inside a component's `setup`: the editor
 * is destroyed on unmount through the current instance's lifecycle.
 */
export function useEditorRuntime(options: UseEditorRuntimeOptions): EditorRuntime {
  const editor = shallowRef<Editor | undefined>(undefined);

  /** Bumped on create/destroy so {@link enabledExtensions} re-reads the manager. */
  const generation = shallowRef(0);

  /** Every listener this composable registers. Drained before the editor dies. */
  const disposers: Array<() => void> = [];

  const mode = computed<EditorMode>(() => toValue(options.mode) ?? "design");

  /**
   * The structural fingerprint.
   *
   * `mode`, the fill data and the document are read out of `options.variable`/`data`
   * explicitly rather than included wholesale: they change constantly, and including
   * them would rebuild the editor on every keystroke in the fill dialog — exactly the
   * "reconfigure by recreating" mistake that makes an editor feel broken.
   */
  const structuralSignature = computed(() =>
    fingerprint({
      multiPage: wantsPages(),
      extensions: toValue(options.extensions) ?? {},
      page: toValue(options.page) ?? {},
      variable: {
        innerVariable: toValue(options.variable)?.innerVariable ?? [],
        locale: toValue(options.variable)?.locale ?? {},
        exclude: toValue(options.variable)?.exclude ?? []
      },
      qrcode: toValue(options.qrcode) ?? {},
      watermark: toValue(options.watermark) ?? {},
      print: toValue(options.print) ?? {}
    })
  );

  /**
   * Whether the schema has real pages.
   *
   * `multiPage: false` and `extensions.disable: ["page"]` are two spellings of the same
   * request — no `page` node type, no page commands, and no 页面 section in the toolbar —
   * so they are resolved to one boolean here rather than each being tested separately at
   * every call site.
   */
  function wantsPages(): boolean {
    if (toValue(options.extensions)?.disable?.includes("page") === true) return false;
    return toValue(options.multiPage) !== false;
  }

  /**
   * The document to open with.
   *
   * The two top nodes accept different content (`page+` versus `block+`), so an empty
   * multi-page document and an empty flat one are *different* values — and passing the
   * page-shaped default to the flat schema is a ProseMirror `Invalid content` error, which
   * is the mirror image of defect 37.
   */
  function initialContent(): TemplateContent {
    const content = toValue(options.content);
    if (content !== undefined) return content;
    return wantsPages() ? emptyDocument() : { type: "doc", content: [{ type: "paragraph" }] };
  }

  /** Build a fresh extension array. Never a module-level array — see the module comment. */
  function buildExtensions(): Extensions {
    const config = toValue(options.extensions);
    const disabled = new Set(config?.disable ?? []);
    const variableProps = toValue(options.variable);
    const variableConfigured = !disabled.has("variable");

    const list: AnyExtension[] = [
      // The document first: `unshift` in the legacy function was the only thing that made
      // the multi-page document win over the default one, and the alternate branch
      // registered *no* document at all (defect 37).
      //
      // `createDocument` returns the multi-page `page+` top node, or the core `block+` one
      // when pages are not wanted. The choice is the schema's, so it is made here and the
      // initial content below has to agree with it.
      createDocument({ multiPage: wantsPages() }),
      Paragraph,
      Text,
      Bold,
      Italic,
      Underline,
      Strike,
      // Font family, size, line-height, colour and background — the whole `textStyle`
      // group, which is what `ToolFont` reads and writes.
      TextStyleKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Heading.configure({ levels: [...(config?.heading?.levels ?? DEFAULT_HEADING_LEVELS)] }),
      TableKit.configure({ table: { resizable: config?.table?.resizable !== false } }),
      Image,
      // Defect 14: no history. Registered unconditionally — a document editor without
      // undo is not a document editor.
      UndoRedo,
      // A gap cursor is what makes an empty *container* reachable at all: an empty header or
      // footer is a `block*` region with nothing to click into, and without this plugin the
      // only way in is the first keystroke that happens to land there. The furniture click
      // handler in `extensions/page/utils/furniture.ts` covers the other half of the problem
      // (a click that selects the band instead of entering it).
      Gapcursor,
      Placeholder.configure({ placeholder: config?.placeholder ?? "" }),
      CharacterCount.configure(
        config?.characterLimit === undefined ? {} : { limit: config.characterLimit }
      )
    ];

    if (config?.paragraphStyle !== false) list.push(ParagraphStyle);
    if (config?.layoutMode !== false) list.push(LayoutMode);

    // `multiPage: false` means "no page *nodes*", not "no document": the `createDocument`
    // above always supplies a top node, and the page extension is what adds the pages.
    if (wantsPages()) list.push(Page.configure({ ...(toValue(options.page) ?? {}) }));

    if (variableConfigured) {
      list.push(
        Variable.configure({
          mode: mode.value,
          values: toValue(options.data) ?? {},
          innerVariable: variableProps?.innerVariable ?? [],
          locale: variableProps?.locale,
          onRequestEdit: (attrs, pos) => options.onRequestVariableEdit?.(attrs, pos)
        })
      );
    }

    if (!disabled.has("qrcode")) {
      list.push(QRCode.configure({ ...(toValue(options.qrcode) ?? {}) }));
    }

    if (!disabled.has("watermark")) {
      list.push(Watermark.configure({ ...(toValue(options.watermark) ?? {}) }));
    }

    if (!disabled.has("print")) {
      list.push(Print.configure({ ...(toValue(options.print) ?? {}) }));
    }

    return list;
  }

  /** Apply the mode to a live editor: editability, and what a variable paints. */
  function applyMode(instance: Editor, next: EditorMode): void {
    instance.setEditable(next === "design");
    // The variable extension paints labels in design mode and values in fill mode; it
    // has to be told, because writing the option alone repaints nothing.
    setVariableMode(instance, next);
  }

  /** Replace the document, but only when it really differs. */
  function setContent(content: TemplateContent): void {
    const instance = editor.value;
    if (!instance) return;

    const parsed = parseTemplateInput(content);
    if (typeof parsed.content === "string") {
      if (instance.getHTML() === parsed.content) return;
    } else if (JSON.stringify(instance.getJSON()) === JSON.stringify(parsed.content)) {
      return;
    }

    // `emitUpdate: false`: the change came *from* the host, so echoing it back would
    // make an `update:modelValue` loop, and it would mark the document dirty on a
    // programmatic `setTemplate`.
    instance.commands.setContent(parsed.content, { emitUpdate: false });
  }

  /** Read the fill data straight off the extension, which owns it. */
  function values(): VariableFillData {
    const instance = editor.value;
    if (!instance || !hasExtension("variable")) return toValue(options.data) ?? {};
    return getVariableValues(instance);
  }

  /** `true` when an extension of that name is registered. */
  function hasExtension(name: string): boolean {
    return enabledExtensions.value.has(name);
  }

  /** Release everything this composable registered, then the editor itself. */
  function destroyEditor(): void {
    while (disposers.length > 0) {
      const dispose = disposers.pop();
      // A disposer that throws must not stop the others: a half-released editor leaks
      // exactly the listener the array exists to remove.
      try {
        dispose?.();
      } catch {
        // Nothing useful to do; the remaining disposers still have to run.
      }
    }

    editor.value?.destroy();
    editor.value = undefined;
    generation.value += 1;
  }

  /** Create a new editor, replacing any existing one. */
  function createEditor(): void {
    destroyEditor();

    const instance = new Editor({
      // No `element`: `EditorContent` supplies it on mount. Creating the view eagerly on
      // a detached node and letting the component adopt the editor is the documented
      // Tiptap pattern; deferring the *construction* to a parent `onMounted` would run
      // after the child's, so the editor would never find its element.
      extensions: buildExtensions(),
      content: initialContent(),
      editable: mode.value === "design",
      // Every callback reads `props.editor` rather than the surrounding `instance`
      // binding: `onCreate` fires *inside* the constructor, before the `const` is
      // assigned, so closing over it would throw a temporal-dead-zone error.
      onUpdate: ({ editor: live }) => options.onUpdate?.(live),
      onSelectionUpdate: ({ editor: live }) => options.onSelectionUpdate?.(live),
      onCreate: ({ editor: live }) => {
        // The initial data is applied once the view exists, because the extension reads
        // its values at paint time and the store is only built in `onCreate`.
        const initial = toValue(options.data);
        if (initial) setVariableValues(live, { ...initial });
        generation.value += 1;
        options.onReady?.(live);
      }
    });

    editor.value = instance;
  }

  /** Rebuild the editor from scratch. */
  function recreate(): void {
    createEditor();
    // A rebuild loses the content the user was editing, so the document is re-applied
    // from the prop. When the host does not own the content the editor simply keeps the
    // fresh default, which is the honest outcome of an extension-set change.
    const content = toValue(options.content);
    if (content !== undefined) setContent(content);
  }

  /** Switch modes, telling the host so it can reflect it in the prop. */
  function setMode(next: EditorMode): void {
    if (mode.value === next) return;
    const instance = editor.value;
    if (instance) applyMode(instance, next);
    options.onModeChange?.(next);
  }

  const enabledExtensions = computed<ReadonlySet<string>>(() => {
    // `generation` is read so the computed re-evaluates after a rebuild; the manager's
    // list itself is not reactive.
    void generation.value;
    const names = new Set<string>();
    for (const extension of editor.value?.extensionManager.extensions ?? []) {
      names.add(extension.name);
    }
    return names;
  });

  if (hasDom()) {
    createEditor();
  } else {
    // No DOM: an SSR pass. The editor is created on the client's mount, which is early
    // enough because `EditorContent` only needs it once it has an element of its own.
    onMounted(createEditor);
  }

  // Anything the extension set is sensitive to rebuilds the editor. Everything else is
  // applied to the live instance, which is what keeps the caret.
  watch(structuralSignature, () => recreate());

  watch(mode, (next) => {
    const instance = editor.value;
    if (instance) applyMode(instance, next);
  });

  watch(
    () => toValue(options.content),
    (next) => {
      if (next !== undefined) setContent(next);
    }
  );

  watch(
    () => toValue(options.data),
    (next) => {
      const instance = editor.value;
      if (!instance || !hasExtension("variable")) return;
      setVariableValues(instance, { ...(next ?? {}) });
    },
    { deep: true }
  );

  onBeforeUnmount(destroyEditor);

  return { editor, enabledExtensions, mode, setMode, hasExtension, setContent, values, recreate };
}

/** Re-exported so `SEditor.vue` can hand a JSON document to the runtime without a cast. */
export type { JSONContent };
