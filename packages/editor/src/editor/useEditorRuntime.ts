/**
 * props 与一个活的 Tiptap 编辑器之间的一切。
 *
 * ## 这里负责什么
 *
 * 1. **扩展数组。** 由 {@link buildExtensions} 根据 props 构建，每个编辑器实例构建一次。
 *    旧版 `generateExtensions` 往一个模块级的 `baseExtensions` 数组上 push（缺陷 36），
 *    于是创建第二个编辑器 —— 或者只是重新挂载第一个 —— 会把每个扩展注册两遍，
 *    ProseMirror 报 `Duplicate extension names found`。模块级的可变数组才是 bug；返回一个
 *    新数组的函数才是修复。
 *
 * 2. **基础集合，显式列出。** `Document` 始终是多页文档，即使 `multiPage` 为 `false`：
 *    旧函数的那条分支根本*没有*注册文档，于是 ProseMirror 抛出
 *    `Schema is missing its top node type (doc)`（缺陷 37）。分页是可选的；文档不是。
 *
 * 3. **撤销/重做。** 注册了 `@tiptap/extensions` 的 `UndoRedo`。旧编辑器完全没有历史记录
 *    （缺陷 14）。分页事务把自己标成 `addToHistory: false`，所以撤销永远不会重放一次分页。
 *
 * 4. **响应式。** `mode`、文档、填充数据与扩展配置都被 watch 并生效。旧组件完全没有
 *    `watch`，所以模式、文档与扩展集合在创建时就冻结了，`props.data` 也从未被读过
 *    （缺陷 38）。
 *
 * 5. **清理。** 这个 composable 添加的每个监听器都进入 {@link disposers}，并在编辑器被销毁
 *    之前释放。旧组件在 `document` 上加了 `compositionstart`/`compositionend` 监听器却从不
 *    移除，于是它们会在卸载之后解引用一个已销毁的编辑器（缺陷 39）；它还排入了一个事件
 *    发射器订阅却没有退订，于是一次重新挂载之后对话框会打开两次（缺陷 40）。这个集合今天
 *    是空的 —— 分页现在由文档驱动，而不是由输入法标志驱动 —— 但机制留在这里，这样将来加
 *    一个也不会重新引入泄漏。
 *
 * ## 它刻意*不*做什么
 *
 * 没有事件发射器。旧工具栏通过一个模块级发射器与对话框通信，这正是重新挂载会重复订阅的
 * 原因。这里对话框是打开它的组件的子节点，而变量扩展自己的 `onRequestEdit` 回调承载着
 * 唯一必须跨边界的那条消息。
 *
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
import { migrateFurnitureContent } from "../extensions/page/utils/migrateFurniture";
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

/**
 * 调用方没有选择时提供的标题级别。
 *
 * The heading levels offered when the caller does not choose.
 */
const DEFAULT_HEADING_LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6];

/**
 * `useEditorRuntime` 的配置。每个字段都是对 getter 友好的 ref。
 *
 * What `useEditorRuntime` is configured with. Every field is a getter-friendly ref.
 */
export interface UseEditorRuntimeOptions {
  /** `"design"` 或 `"fill"`。 / `"design"` or `"fill"`. */
  mode: MaybeRefOrGetter<EditorMode>;

  /**
   * 文档。一份 JSON 文档、一个 HTML 字符串，或一份完整的已存储模板。
   *
   * The document. A JSON document, an HTML string or a full stored template.
   */
  content?: MaybeRefOrGetter<TemplateContent | undefined>;

  /**
   * 填充数据，按变量 key 索引。每次变化都会替换先前的数据。
   *
   * Fill data, keyed by variable key. Replaces the previous data on every change.
   */
  data?: MaybeRefOrGetter<VariableFillData | undefined>;

  /** 注册页面扩展。默认 `true`。 / Register the page extension. Default `true`. */
  multiPage?: MaybeRefOrGetter<boolean | undefined>;

  /** 只在创建时生效的结构。 / Structures that only apply at creation time. */
  extensions?: MaybeRefOrGetter<SEditorExtensionOptions | undefined>;

  /** 页面扩展选项。 / Page-extension options. */
  page?: MaybeRefOrGetter<PageOptions | undefined>;

  /**
   * 变量扩展选项，去掉 `mode`/`values`。
   *
   * Variable-extension options, minus `mode`/`values`.
   */
  variable?: MaybeRefOrGetter<SEditorVariableProps | undefined>;

  /** 二维码扩展选项。 / QR-code-extension options. */
  qrcode?: MaybeRefOrGetter<QRCodeOptions | undefined>;

  /** 水印扩展选项。 / Watermark-extension options. */
  watermark?: MaybeRefOrGetter<WatermarkOptions | undefined>;

  /** 打印扩展选项。 / Print-extension options. */
  print?: MaybeRefOrGetter<PrintOptions | undefined>;

  /**
   * 文档已变更。
   *
   * 参数是**core 的** `Editor`，不是 Vue 的子类：这些回调由 Tiptap 自己的 `EditorOptions`
   * 声明，所以 Tiptap 交给它们的就是它当时标注的类型。`@tiptap/vue-3` 的 `Editor` 继承
   * core 的，并且没有重新声明 `EditorOptions`，所以这里不能假定那个更窄的子类类型 —— 见
   * 下面的 `CoreEditor` 别名。
   *
   * The document changed.
   *
   * The parameter is **core's** `Editor`, not the Vue subclass: these callbacks are
   * declared by Tiptap's own `EditorOptions`, so Tiptap hands them exactly what it typed
   * them with. `@tiptap/vue-3`'s `Editor` extends core's and does not re-declare
   * `EditorOptions`, so the narrower subclass type cannot be assumed here — see the
   * `CoreEditor` alias below.
   */
  onUpdate?: (editor: CoreEditor) => void;

  /**
   * 选区移动了。面板用它跟随光标。
   *
   * The selection moved. Panels use this to follow the caret.
   */
  onSelectionUpdate?: (editor: CoreEditor) => void;

  /** 编辑器已存在并已就绪。 / The editor exists and is ready. */
  onReady?: (editor: CoreEditor) => void;

  /**
   * 用户从组件内部要求换一个模式。
   *
   * The user asked for a different mode from inside the component.
   */
  onModeChange?: (mode: EditorMode) => void;

  /**
   * 在设计模式下点了一个变量。无法解析它的位置时 `pos` 为 `-1`。
   *
   * A variable was clicked in design mode. `pos` is `-1` when it could not be resolved.
   */
  onRequestVariableEdit?: (attrs: VariableAttrs, pos: number) => void;
}

/** {@link useEditorRuntime} 返回的东西。 / What {@link useEditorRuntime} returns. */
export interface EditorRuntime {
  /** 编辑器；创建前为 `undefined`。 / The editor, or `undefined` before creation. */
  editor: ShallowRef<Editor | undefined>;

  /**
   * 每一个已注册的扩展名 —— 工具栏的门，而不是 `tools` 列表。
   *
   * Every registered extension name — the toolbar's gate, not the `tools` list.
   */
  enabledExtensions: ComputedRef<ReadonlySet<string>>;

  /**
   * 生效的模式，已应用废弃的 `design` 别名。
   *
   * The effective mode, after the deprecated `design` alias is applied.
   */
  mode: ComputedRef<EditorMode>;

  /**
   * 切换模式，并告知宿主，好让它反映到 prop 上。
   *
   * Switch modes, telling the host so it can reflect it in the prop.
   */
  setMode: (mode: EditorMode) => void;

  /** 注册了该名字的扩展时为 `true`。 / `true` when an extension of that name is registered. */
  hasExtension: (name: string) => boolean;

  /** 替换文档，且不发出 update。 / Replace the document without emitting an update. */
  setContent: (content: TemplateContent) => void;

  /** 当前的填充数据。 / The current fill data. */
  values: () => VariableFillData;

  /**
   * 销毁并重建编辑器，例如扩展配置变化之后。
   *
   * Destroy and rebuild the editor, e.g. after the extension config changed.
   */
  recreate: () => void;
}

/**
 * 给一个配置对象算出确定的、抗循环的字符串。
 *
 * 函数变成 `"fn"` 而不是被丢掉，所以 `{ onBeforePrint }` 与 `{ onAfterPrint }` 不会得到
 * 相同的指纹；而*换一个*回调身份仍然不会重建编辑器，这正是意图 —— 更换回调不能把用户的
 * 选区丢掉。循环被标记出来，而不是递归下去。
 *
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

/** Tiptap 现在就能构建视图时为 `true`。 / `true` when Tiptap can build a view right now. */
function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * 把 props 绑到一个活的编辑器上。
 *
 * Bind the props to a live editor.
 *
 * @param options 运行时配置；见 {@link UseEditorRuntimeOptions} /
 * - the runtime configuration; see {@link UseEditorRuntimeOptions}.
 * @returns 运行时句柄。它必须在组件的 `setup` 里使用：编辑器会在卸载时通过当前实例的
 * 生命周期被销毁 /
 * the runtime handle. It must be used inside a component's `setup`: the editor
 * is destroyed on unmount through the current instance's lifecycle.
 */
export function useEditorRuntime(options: UseEditorRuntimeOptions): EditorRuntime {
  const editor = shallowRef<Editor | undefined>(undefined);

  /**
   * 在创建/销毁时自增，好让 {@link enabledExtensions} 重新读管理器。
   *
   * Bumped on create/destroy so {@link enabledExtensions} re-reads the manager.
   */
  const generation = shallowRef(0);

  /**
   * 这个 composable 注册的每一个监听器。在编辑器死亡之前被排空。
   *
   * Every listener this composable registers. Drained before the editor dies.
   */
  const disposers: Array<() => void> = [];

  const mode = computed<EditorMode>(() => toValue(options.mode) ?? "design");

  /**
   * 结构指纹。
   *
   * `mode`、填充数据与文档是从 `options.variable`/`data` 里显式取出的，而不是整体纳入：
   * 它们变化频繁，纳入进来会让编辑器在填写对话框里每敲一个键就重建一次 —— 正是那种让编辑器
   * 感觉坏掉的「靠重建来重新配置」错误。
   *
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
   * 打开时使用的文档。
   *
   * 两个顶层节点接受的内容不同（`page+` 对 `block+`），所以一份空的多页文档与一份空的扁平
   * 文档是*不同的*值 —— 而把页面形态的默认值交给扁平 schema 是一个 ProseMirror
   * `Invalid content` 错误，正是缺陷 37 的镜像。
   *
   * The document to open with.
   *
   * The two top nodes accept different content (`page+` versus `block+`), so an empty
   * multi-page document and an empty flat one are *different* values — and passing the
   * page-shaped default to the flat schema is a ProseMirror `Invalid content` error, which
   * is the mirror image of defect 37.
   */
  function initialContent(): TemplateContent {
    const content = toValue(options.content);
    if (content === undefined) {
      return wantsPages() ? emptyDocument() : { type: "doc", content: [{ type: "paragraph" }] };
    }
    // An HTML string is parsed by the schema rather than migrated; see `setContent`.
    return typeof content === "string" ? content : migrateFurnitureContent(content).content;
  }

  /**
   * 构建一个全新的扩展数组。绝不用模块级数组 —— 见模块注释。
   *
   * Build a fresh extension array. Never a module-level array — see the module comment.
   */
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

  /**
   * 把模式应用到活的编辑器上：可编辑性，以及变量绘制什么。
   *
   * Apply the mode to a live editor: editability, and what a variable paints.
   */
  function applyMode(instance: Editor, next: EditorMode): void {
    instance.setEditable(next === "design");
    // The variable extension paints labels in design mode and values in fill mode; it
    // has to be told, because writing the option alone repaints nothing.
    setVariableMode(instance, next);
  }

  /**
   * 替换文档，但只在它确实不同的时候。
   *
   * JSON 内容在进入时会被迁移（`migrateFurnitureContent`）：一份写于三区页眉页脚之前的
   * 模板，在带有页面级 Logo 时会被页面节点上的内容表达式*拒绝*。HTML 字符串无法这样迁移
   * —— 解析规则会处理它，而扁平的页眉页脚带（常见的旧形态）是合法的，会在运行时被修复。
   *
   * Replace the document, but only when it really differs.
   *
   * JSON content is migrated on the way in (`migrateFurnitureContent`): a template written before
   * the three-region furniture would otherwise be *rejected* by the page's content expression when
   * it carries a page-level logo. An HTML string cannot be migrated this way — the parse rules
   * handle it, and a flat band (the common legacy shape) is legal and repaired at runtime.
   */
  function setContent(content: TemplateContent): void {
    const instance = editor.value;
    if (!instance) return;

    const parsed = parseTemplateInput(content);
    const target =
      typeof parsed.content === "string"
        ? parsed.content
        : migrateFurnitureContent(parsed.content).content;

    if (typeof target === "string") {
      if (instance.getHTML() === target) return;
    } else if (JSON.stringify(instance.getJSON()) === JSON.stringify(target)) {
      return;
    }

    // `emitUpdate: false`: the change came *from* the host, so echoing it back would
    // make an `update:modelValue` loop, and it would mark the document dirty on a
    // programmatic `setTemplate`.
    instance.commands.setContent(target, { emitUpdate: false });
  }

  /**
   * 直接从拥有填充数据的扩展上读它。
   *
   * Read the fill data straight off the extension, which owns it.
   */
  function values(): VariableFillData {
    const instance = editor.value;
    if (!instance || !hasExtension("variable")) return toValue(options.data) ?? {};
    return getVariableValues(instance);
  }

  /** 注册了该名字的扩展时为 `true`。 / `true` when an extension of that name is registered. */
  function hasExtension(name: string): boolean {
    return enabledExtensions.value.has(name);
  }

  /**
   * 释放这个 composable 注册的一切，然后释放编辑器本身。
   *
   * Release everything this composable registered, then the editor itself.
   */
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

  /**
   * 创建一个新编辑器，替换掉已有的那个。
   *
   * Create a new editor, replacing any existing one.
   */
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

  /** 从头重建编辑器。 / Rebuild the editor from scratch. */
  function recreate(): void {
    createEditor();
    // A rebuild loses the content the user was editing, so the document is re-applied
    // from the prop. When the host does not own the content the editor simply keeps the
    // fresh default, which is the honest outcome of an extension-set change.
    const content = toValue(options.content);
    if (content !== undefined) setContent(content);
  }

  /**
   * 切换模式，并告知宿主，好让它反映到 prop 上。
   *
   * Switch modes, telling the host so it can reflect it in the prop.
   */
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

/**
 * 重新导出，好让 `SEditor.vue` 不必加类型断言就能把 JSON 文档交给运行时。
 *
 * Re-exported so `SEditor.vue` can hand a JSON document to the runtime without a cast.
 */
export type { JSONContent };
