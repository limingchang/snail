/**
 * 组件自身的 prop、emit 与 expose 契约。
 *
 * `typings/editor.ts` 是**模型**的契约 —— 模式、模板、`SEditorExposed`、`ToolName`、
 * `WatermarkOptions`、`PrintOptions`；它并不声明组件自己的 prop 对象，所以本模块把它
 * 推导出来：这里每个字段要么直接引用 `typings/` 中的类型，要么是对其中一个类型的、
 * 有据可查的收窄（`Omit<VariableOptions, "mode" | "values">`，因为模式与填充值归组件
 * 所有，而不归调用方）。
 *
 * ## 整个 prop 对象为什么是一个扁平接口
 *
 * Vue 按名字解析 prop，而旧组件把一半配置嵌在 `extensions` 里，另一半留在顶层
 * （`design`、`tools`、`doc`、`data`），什么都看不出来。这里的切分是显式的，并且按
 * **生命周期**划分：运行时会改变形态的 prop（`mode`、`doc`、`data`、`tools`）放在
 * 顶层，只在创建时配置某个扩展的 prop（`extensions.heading`、`extensions.table` 等）
 * 放在 `extensions` 里，因为改动后者确实需要重建编辑器。
 *
 * The component's prop, emit and expose contracts.
 *
 * `typings/editor.ts` is the captain's contract for *the model* — modes, templates,
 * `SEditorExposed`, `ToolName`, `WatermarkOptions`, `PrintOptions`. It does not declare
 * the component's own prop object, so this module derives it: every field here is
 * either a direct reference to a type from `typings/`, or a documented narrowing of one
 * (`Omit<VariableOptions, "mode" | "values">`, because the mode and the fill values are
 * owned by the component, not by the caller).
 *
 * ## Why the whole prop object is one flat interface
 *
 * Vue resolves a prop by name, and the legacy component nested half its configuration
 * inside `extensions` while the other half sat at the top level (`design`, `tools`,
 * `doc`, `data`). Nothing was discoverable. Here the split is explicit and by
 * *lifetime*: a prop that changes shape at runtime (`mode`, `doc`, `data`, `tools`) is
 * top level, and a prop that only configures an extension at creation time
 * (`extensions.heading`, `extensions.table`, …) is inside `extensions`, because
 * changing those genuinely requires rebuilding the editor.
 */

import type { Editor } from "@tiptap/core";
import type { Level } from "@tiptap/extension-heading";
// The explicit `index` is required at runtime too (`SEditor.vue` imports the value): Element Plus's
// `exports` map resolves `./es/*` to `./es/*.mjs` and there is no `es/locale.mjs`.
import type { Language } from "element-plus/es/locale/index";

import type {
  EditorChangeEvent,
  EditorMode,
  PrintOptions,
  SavePayload,
  SaveResult,
  TemplateContent,
  TemplateSource,
  TemplateSaveTarget,
  ToolName,
  WatermarkOptions
} from "../typings/editor";
import type { VariableFillData, VariableType } from "../typings/variable";

import type { PageOptions } from "../extensions/page";
import type { QRCodeOptions } from "../extensions/qrcode";
import type { VariableOptions } from "../extensions/variable";

import type { EditorLocale } from "./locale";

/**
 * 调用方可以在 `variable` 扩展上配置的内容。
 *
 * `mode` 与 `values` 被省略：它们由组件自己的 `mode` 与 `data` prop 推导而来，允许
 * 调用方在这里设置它们会为两者各造出第二个真相来源 —— 那正是旧组件的问题形态。
 *
 * What a caller may configure on the `variable` extension.
 *
 * `mode` and `values` are omitted: they are derived from the component's own `mode` and
 * `data` props, and letting a caller set them here would create a second source of truth
 * for both — which is the shape of the legacy component's problem.
 */
export interface SEditorVariableProps extends Partial<Omit<VariableOptions, "mode" | "values">> {
  /**
   * 在设计对话框的类型选择器中被隐藏的变量类型。
   *
   * 即旧版的 `SetVariableOptions.exlude`（原文拼写如此），这里拼写正确。一个最终
   * **包含**被排除类型的模板仍然会渲染、仍然能填写：这里只是隐藏选项，并不会让该
   * 类型无法读取。
   *
   * Variable types hidden from the design dialog's type picker.
   *
   * The legacy `SetVariableOptions.exlude` (sic) — spelled correctly here. A template
   * that ends up *containing* an excluded type still renders and still fills: this only
   * hides the choice, it does not make the type unreadable.
   */
  exclude?: readonly VariableType[];
}

/**
 * 只在编辑器被（重新）创建时才生效的配置。
 *
 * 可选扩展**默认会被注册**，除非它们被列在 {@link disable} 中：一个在某个 prop 被设置
 * 之前静默地不渲染任何页面的组件，比一个被显式关掉的组件是更糟的默认值。这个开关的
 * 用途是给想要一个纯富文本输入框的使用方，或给已经有自己的分页实现、不想再要第二个的
 * 使用方。
 *
 * Configuration that only takes effect when the editor is (re)created.
 *
 * The optional extensions are registered **unless** they are named in
 * {@link disable}: a component that silently rendered no pages until a prop was set
 * would be a worse default than one that is switched off explicitly. What the flag is
 * for is a consumer that wants a plain rich-text field, or that already has its own
 * page implementation and does not want a second one.
 */
export interface SEditorExtensionOptions {
  /**
   * `Paragraph` 样式选择器提供的标题级别。默认 `[1, 2, 3, 4, 5, 6]`。
   *
   * Heading levels offered by `Paragraph`'s style select. Default `[1, 2, 3, 4, 5, 6]`.
   */
  heading?: { levels?: readonly Level[] };

  /** 表格行为。`resizable` 默认为 `true`。 / Table behaviour. `resizable` defaults to `true`. */
  table?: { resizable?: boolean };

  /**
   * 注册段落间距与缩进属性。默认 `true`。
   *
   * Register the paragraph spacing/indent attributes. Default `true`.
   */
  paragraphStyle?: boolean;

  /** 注册布局表模式。默认 `true`。 / Register the layout-table mode. Default `true`. */
  layoutMode?: boolean;

  /**
   * 占位提示文本，由 `@tiptap/extensions` 的 `Placeholder` 显示。
   *
   * Placeholder text, shown by `@tiptap/extensions`' `Placeholder`.
   */
  placeholder?: string;

  /**
   * 最大字符数；`undefined` 表示 `CharacterCount` 不设上限。
   *
   * Maximum character count; `undefined` leaves `CharacterCount` unlimited.
   */
  characterLimit?: number;

  /**
   * 要从 schema 中整体去掉的可选扩展。
   *
   * 在这里点名一个扩展会移除它的节点类型与它的命令，工具栏因此无法提供它 —— 这种
   * 对应关系是有意的（缺陷：旧工具栏只凭一个字符串列表判断，于是某个分组可能在背后
   * 什么都没有的情况下被渲染出来）。
   *
   * Optional extensions to leave out of the schema entirely.
   *
   * Naming one here removes its node types and its commands, and the toolbar therefore
   * cannot offer it — the correspondence is intentional (defect: the legacy toolbar
   * gated on a string list alone, so a section could render with nothing behind it).
   */
  disable?: readonly ("page" | "variable" | "qrcode" | "watermark" | "print")[];
}

/** `SEditor` 的 props。 / `SEditor`'s props. */
export interface SEditorProps {
  /**
   * 文档，供 `v-model` 使用。
   *
   * 每次变更都会回传，因此调用方既可以绑定它（并拥有内容），也可以忽略它、在需要时读取
   * `getTemplate()`。JSON 文档、HTML 字符串或完整的 {@link TemplateDocument} 都接受。
   *
   * The document, for `v-model`.
   *
   * Emitted back on every change, so a caller can either bind it (and own the content)
   * or ignore it and read `getTemplate()` when they need it. A JSON document, an HTML
   * string or a full {@link TemplateDocument} are all accepted.
   */
  modelValue?: TemplateContent;

  /**
   * `"design"` 编写模板；`"fill"` 填写并打印它。默认 `"design"`。
   *
   * `"design"` authors the template; `"fill"` fills and prints it. Default `"design"`.
   */
  mode?: EditorMode;

  /**
   * 旧版的模式开关。
   *
   * The legacy mode switch.
   *
   * @deprecated 请改用 `mode`。因为旧组件把 `design` 记为公开 API，两者都给时以 `mode` 为准。 /
   * Use `mode`. Kept because the legacy component documented `design` as its
   * public API; `mode` wins when both are given.
   */
  design?: boolean;

  /**
   * 要载入的文档。当 `template` 来源提供了文档时忽略。
   *
   * The document to load. Ignored when a `template` source supplies one.
   */
  doc?: TemplateContent;

  /**
   * 填充数据，按变量 key 索引。填写模式与填写对话框都会读取它。
   *
   * Fill data, keyed by variable key. Read in fill mode and by the fill dialog.
   */
  data?: VariableFillData;

  /**
   * 要显示哪些工具栏分组。
   *
   * 一个分组只有在被这里点名**并且**它的扩展已注册时才会渲染 —— 这道门的两半都必需，
   * 这正是对只检查名字的旧工具栏的修复。默认为 {@link DEFAULT_TOOLS}；空数组会隐藏
   * 工具栏。
   *
   * Which toolbar sections to show.
   *
   * A section renders only when it is named here **and** its extension is registered —
   * both halves of the gate are required, which is the fix for the legacy toolbar that
   * checked the name alone. Defaults to {@link DEFAULT_TOOLS}; an empty array hides the
   * toolbar.
   */
  tools?: readonly ToolName[];

  /** 注册页面扩展。默认 `true`。 / Register the page extension. Default `true`. */
  multiPage?: boolean;

  /** 模板的来源。 / Where the template comes from. */
  template?: TemplateSource;

  /**
   * `save()` 写入的位置。没有目标时，`save()` 返回未保存的模板。
   *
   * Where `save()` writes. With no target, `save()` returns the template unsaved.
   */
  save?: TemplateSaveTarget;

  /**
   * 页面扩展选项，用作创建时的默认值。
   *
   * Page-extension options, used as the creation-time defaults.
   */
  page?: PageOptions;

  /** 变量扩展选项。 / Variable-extension options. */
  variable?: SEditorVariableProps;

  /** 水印扩展选项。 / Watermark-extension options. */
  watermark?: WatermarkOptions;

  /**
   * 打印扩展选项，用作打印命令的默认值。
   *
   * Print-extension options, used as the defaults for the print command.
   */
  print?: PrintOptions;

  /** 二维码扩展选项。 / QR-code-extension options. */
  qrcode?: QRCodeOptions;

  /**
   * 只在编辑器被创建时生效的配置。
   *
   * Configuration that only applies when the editor is created.
   */
  extensions?: SEditorExtensionOptions;

  /** 覆盖内置中文字符串的局部内容。 / Partial overrides over the built-in Chinese strings. */
  locale?: Partial<EditorLocale>;

  /**
   * Element Plus 的语言包，决定 Element Plus 组件自身文案的语言（颜色选择器的「确定 / 清空」、
   * 下拉的「无数据」、分页的「共 x 条」等）。
   *
   * Element Plus 的默认语言是**英文**，所以本包在编辑器内部套一层 `el-config-provider` 并默认
   * 使用中文，而不是要求使用方去 `app.use(ElementPlus, { locale })` —— 使用方全局注册的语言包
   * 仍然可以通过这个 prop 传进来覆盖它。
   *
   * Element Plus's locale, which decides the language of Element Plus's own strings (the colour
   * picker's 确定 / 清空 buttons, a select's "no data", a pagination's "x items"). Element Plus
   * defaults to **English**, so the editor provides its own `el-config-provider` defaulting to
   * Chinese rather than requiring `app.use(ElementPlus, { locale })` — a consumer that has
   * registered another locale can pass it here to override the default.
   */
  elementLocale?: Language;

  /**
   * 用户保存时带着模板调用。
   *
   * 无论 {@link save} 是什么都会被调用：通过自己的 API 持久化的调用方只传 `onSave`，使用
   * 内置目标的调用方两者都传。
   *
   * Called with the template whenever the user saves.
   *
   * Always called, whatever {@link save} is: a caller that persists through its own API
   * passes `onSave` alone, and one that uses a built-in target passes both.
   */
  onSave?: (payload: SavePayload) => void;

  /**
   * 每次文档变更时调用。`change` emit 携带同样的载荷。
   *
   * Called on every document change. The `change` emit carries the same payload.
   */
  onChange?: (event: EditorChangeEvent) => void;
}

/** `SEditor` 的 emits。 / `SEditor`'s emits. */
export interface SEditorEmits {
  /**
   * 文档已变更。见 {@link SEditorProps.modelValue}。
   *
   * The document changed. See {@link SEditorProps.modelValue}.
   */
  "update:modelValue": [content: TemplateContent];

  /**
   * 文档已变更，附带模板与 HTML。
   *
   * The document changed, with the template and the HTML.
   */
  change: [event: EditorChangeEvent];

  /**
   * 一次保存结束。失败时会设置 `SaveResult.error`。
   *
   * A save finished. `SaveResult.error` is set when it failed.
   */
  save: [result: SaveResult];

  /** 编辑器已存在，可以被驱动。 / The editor exists and is ready to be driven. */
  ready: [editor: Editor];

  /**
   * 模式是从组件内部被改变的（比如底部的某个操作）。
   *
   * The mode was changed from inside the component (a footer action, say).
   */
  "update:mode": [mode: EditorMode];
}

/**
 * 每个工具面板都会收到的东西。
 *
 * 工具面板是叶子：它只拿编辑器和一份 locale 覆盖，别的什么都没有，因此工具栏可以用一个
 * `v-for` 渲染其中任意一个，新增一个分组也不必改动工具栏的 props。
 *
 * What every tool panel receives.
 *
 * A tool panel is a leaf: it takes the editor and a locale override and nothing else, so
 * the toolbar can render any of them from one `v-for` and a section can be added without
 * touching the toolbar's props.
 */
export interface ToolProps {
  /**
   * 编辑器。挂载前为 `undefined`，每个面板都必须容忍这一点。
   *
   * The editor. `undefined` before mount, which every panel must tolerate.
   */
  editor?: Editor;

  /**
   * 局部的 locale 覆盖，通常由根组件向下传递。
   *
   * Partial locale overrides, usually passed down from the root component.
   */
  locale?: Partial<EditorLocale>;
}

/**
 * 工具面板的窗格，即工具栏渲染出来的形态。
 *
 * A tool panel's pane, as the toolbar renders it.
 */
export interface ToolSection {
  /** 分组自己的名字。 / The section's own name. */
  name: ToolName;

  /** 本地化标题。 / Localised title. */
  title: string;

  /**
   * 当该分组的扩展已注册且 `tools` 点名了它时为 `true`。
   *
   * `true` when the section's extension is registered and `tools` names it.
   */
  enabled: boolean;
}
