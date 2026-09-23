/**
 * `SEditor` 组件契约。
 *
 * ## 两种模式
 *
 * 同一个组件有两种模式，模式几乎决定了其余一切：`design` 用于编写模板，文档可编辑、
 * 显示工具栏、变量显示为带标签的徽标、保存模板；`fill` 用于填写并打印，文档只读、隐藏
 * 工具栏、变量显示为它们的值、什么都不保存。
 *
 * 旧组件有同样的想法（`design?: boolean`），但接线接错了：`editable: props.design` 忽略
 * 了计算出的默认值，而且因为没有对 prop 做 `watch`，模式在创建时就冻结了。这里的模式是
 * 响应式的，工具栏也由它驱动。
 *
 * ## 模板形状与版本
 *
 * 旧包只持久化 `getJSON()`，没有版本字段也没有迁移，因此某个版本写出的模板只能被那个
 * 版本读取。{@link TemplateDocument} 才是存储的产物：版本、文档、页面设置、变量声明与
 * 水印；这样读取方无需编辑器就能渲染模板，未来的版本也有东西可以迁移。
 *
 * The `SEditor` component contract.
 *
 * ## The two modes
 *
 * The editor is the same component in two modes, and the mode decides almost
 * everything else:
 *
 * | | `design` | `fill` |
 * | --- | --- | --- |
 * | purpose | author a template | fill it in and print it |
 * | document | editable | read-only |
 * | toolbar | shown | hidden |
 * | variables | shown as labelled badges | shown as their values |
 * | persistence | save the template | save nothing |
 *
 * The legacy component had the same idea (`design?: boolean`) but wired it up wrong:
 * `editable: props.design` ignored the computed default, and because there was no
 * `watch` on the prop the mode was frozen at creation. Here the mode is reactive and
 * the toolbar is driven by it.
 *
 * ## Template shape and versioning
 *
 * The legacy package persisted `getJSON()` and nothing else, with no version field
 * and no migration, so a template written by one release could only be read by that
 * release. {@link TemplateDocument} is the stored artefact: a version, the document,
 * the page setup, the variable declarations and the watermark, so a reader can render
 * a template without the editor and a future version has something to migrate from.
 */
import type { JSONContent } from "@tiptap/core";
import type { VariableFillData, VariableType } from "./variable";
import type { Margins, Orientation, PaperFormat } from "./paper";

/** 编辑器处于两种模式中的哪一种。 / Which of the two modes the editor is in. */
export type EditorMode = "design" | "fill";

/**
 * 模板正文：一份 ProseMirror JSON 文档，或一个 HTML/序列化字符串。
 *
 * A template body: a ProseMirror JSON document, or an HTML/serialised string.
 */
export type TemplateContent = JSONContent | string;

/** 写入 {@link TemplateDocument} 的版本号。 / The version written into {@link TemplateDocument}. */
export const TEMPLATE_VERSION = 1;

/** 远程模板列表中的一项。 / One entry of a remote template list. */
export interface TemplateListItem {
  /** 用于获取内容的稳定标识符。 / Stable identifier used to fetch the content. */
  id: string;

  /** 显示在选择器中。 / Shown in the picker. */
  name: string;

  /** 可选的第二行。 / Optional second line. */
  description?: string;

  /** 可选的 ISO 时间戳，原样显示。 / Optional ISO timestamp, shown as-is. */
  updatedAt?: string;
}

/**
 * 模板声明的变量，无需遍历文档。
 *
 * The variables a template declares, without walking the document.
 */
export interface TemplateVariableSummary {
  /** 变量的键。 / The variable's key. */
  key: string;
  /** 显示名。 / The label shown. */
  label: string;
  /** 变量类型。 / The variable type. */
  type: VariableType;
  /**
   * 变量既没有值也没有默认值时为 `true`。
   *
   * `true` when the variable has no value and no default.
   */
  required?: boolean;
}

/** 与文档一同记录的页面设置。 / Page setup recorded alongside the document. */
export interface TemplatePageSetup {
  /** 纸张格式。 / The paper format. */
  paperFormat: PaperFormat;
  /** 纸张方向。 / The sheet orientation. */
  orientation: Orientation;
  /** 页边距。 / The page margins. */
  margins: Margins;
  /** 文档的页数，已知时存在。 / How many pages the document has, when known. */
  pageCount?: number;
}

/** 与文档一同记录的水印设置。 / Watermark settings recorded alongside the document. */
export interface TemplateWatermark {
  /** 是否启用水印。 / Whether the watermark is enabled. */
  enabled: boolean;
  /** 水印文字。 / The watermark text. */
  text?: string;
  /** 水印图片的地址。 / The image source of the watermark. */
  imageSrc?: string;
  /** 逆时针旋转的角度。 / The angle in degrees, anti-clockwise. */
  angle?: number;
  /** 不透明度，`0…1`。 / The opacity, `0…1`. */
  opacity?: number;
  /** 以灰度渲染，而不是用品牌色。 / Render in grey rather than in the brand colour. */
  greyscale?: boolean;
  /**
   * 在整个纸面上重复水印，而不是只放一个居中的。
   *
   * Repeat the mark across the sheet instead of one centred mark.
   */
  tiled?: boolean;
}

/**
 * 作为模板存储下来的东西。
 *
 * 刻意不只是 ProseMirror 文档：只想渲染或校验模板的读取方——服务端检查、邮件预览、
 * 模板列表——不应该为了知道它需要哪些变量而去遍历一棵 ProseMirror 树。
 *
 * What gets stored as a template.
 *
 * Deliberately not just the ProseMirror document: a reader that only wants to render
 * or validate a template — a server-side check, an email preview, a template list —
 * should not have to walk a ProseMirror tree to find out which variables it needs.
 */
export interface TemplateDocument {
  /** 写入时的 {@link TEMPLATE_VERSION}。 / {@link TEMPLATE_VERSION} at the time of writing. */
  version: number;

  /** 文档本身。 / The document itself. */
  doc: JSONContent;

  /** 模板声明的每一个变量。 / Every variable the template declares. */
  variables?: TemplateVariableSummary[];

  /**
   * 页面设置，好让读取方无需编辑器就能渲染页面。
   *
   * Page setup, so a reader can render the sheet without the editor.
   */
  page?: TemplatePageSetup;

  /**
   * 水印设置，好让读取方无需编辑器就能渲染它们。
   *
   * Watermark settings, so a reader can render them without the editor.
   */
  watermark?: TemplateWatermark;

  /**
   * 自由形式的元数据，作者希望它随模板一起走。
   *
   * Free-form metadata the author wants to travel with the template.
   */
  meta?: Record<string, unknown>;
}

/** 编辑器从哪里获取模板。 / Where the editor gets its template from. */
export type TemplateSource =
  /** 内联提供的模板——最简单的情形。 / A template supplied inline — the simplest case. */
  | { kind: "local"; content?: TemplateContent }
  /** 从一个 URL 取回的单个模板。 / One template fetched from a URL. */
  | { kind: "remote"; url: string; headers?: Record<string, string> }
  /**
   * 从 URL 取回的一组模板。
   *
   * `load` 决定挂载时发生什么：`"auto"` 在编辑器就绪后立刻请求列表，并渲染它的
   * **第一项**；`"manual"` 什么都不请求，在列表后面显示一个加载按钮——这正是 fill
   * 模式想要的（由打印员挑选模板，页面不自行抓取）。
   *
   * A list of templates fetched from a URL.
   *
   * `load` decides what happens on mount:
   * `"auto"` requests the list as soon as the editor is ready and renders its **first**
   * entry; `"manual"` requests nothing and shows a load button after the list, which
   * is what the fill mode wants (a print operator picks the template, the page does
   * not fetch on its own).
   */
  | {
      kind: "remote-list";
      /**
       * 返回 `TemplateListItem[]`，或 `{ id, name, doc }` 组成的数组。
       *
       * Returns `TemplateListItem[]`, or an array of `{ id, name, doc }`.
       */
      url: string;
      /** 附加的请求头。 / Extra request headers. */
      headers?: Record<string, string>;
      /**
       * 单项内容所在的位置；默认为 `${url}/${id}`。
       *
       * Where one entry's content lives; defaults to `${url}/${id}`.
       */
      contentUrl?: (item: TemplateListItem) => string;
      /** 默认 `"manual"`。 / Default `"manual"`. */
      load?: "auto" | "manual";
    };

/** 编辑器保存到哪里。 / Where the editor saves to. */
export type TemplateSaveTarget =
  /**
   * `localStorage`（设置了 `session` 时用 `sessionStorage`）。不走网络，这正是
   * 单人编写会话想要的。
   *
   * `localStorage` (or `sessionStorage` when `session` is set). No network, which is
   * what a single-user authoring session wants.
   */
  | { kind: "local"; storageKey?: string; session?: boolean }
  /**
   * 把模板 POST 到后端。
   *
   * `structured: true`（默认）发送一个 {@link TemplateDocument}；`false` 则改为发送
   * 序列化后的 HTML 字符串，适合只存标记的后端。
   *
   * POST the template to a backend.
   *
   * `structured: true` (the default) sends a {@link TemplateDocument}; `false` sends
   * the serialised HTML string instead, for a backend that only stores markup.
   */
  | {
      kind: "remote";
      /** 保存的目标地址。 / Where to send the template. */
      url: string;
      /** HTTP 方法，默认 `"POST"`。 / The HTTP method; defaults to `"POST"`. */
      method?: "POST" | "PUT";
      /** 附加的请求头。 / Extra request headers. */
      headers?: Record<string, string>;
      /** 发送完整模板文档而非 HTML。 / Send a full template document rather than HTML. */
      structured?: boolean;
    };

/** `save()` 产出的结果。 / What `save()` produced. */
export interface SaveResult {
  /** `"local"` 或 `"remote"`，与保存目标一致。 / `"local"` or `"remote"`, mirroring the target. */
  kind: "local" | "remote";
  /**
   * 序列化后的模板；总会返回，方便调用方自行处理。
   *
   * The serialised template, always returned so a caller can do its own thing.
   */
  template: TemplateDocument;
  /** 远程保存时存在。 / Present for a remote save. */
  status?: number;
  /**
   * 保存失败时设置；抛出的错误也会被重新抛出。
   *
   * Set when the save failed; the thrown error is also re-raised.
   */
  error?: unknown;
}

/**
 * 交给 {@link SEditorProps.onSave} 的载荷。
 *
 * Payload handed to {@link SEditorProps.onSave}.
 */
export interface SavePayload {
  /** 序列化后的模板。 / The serialised template. */
  template: TemplateDocument;
  /** 设计模式保存时为 `true`。 / `true` for a design-mode save. */
  design: boolean;
}

/** 编辑器发出的一切。 / Everything the editor emits. */
export interface EditorChangeEvent {
  /** 序列化后的模板。 / The serialised template. */
  template: TemplateDocument;
  /**
   * 文档的 HTML 形式，供存储标记的使用者使用。
   *
   * The document as HTML, for a consumer that stores markup.
   */
  html: string;
}

/**
 * 工具栏分区。只有注册了对应的扩展，分区才会渲染。
 *
 * `table` 是独立的一个分区——表格工具过去与 `insert` 共用面板，让那个面板混成了
 * 「放进新东西」和「改动你正身处其中的表格」两种事。这里的每个名字既是一个 `tools`
 * 条目，也是一个面板。
 *
 * Toolbar sections. A section only renders when its extension is registered.
 *
 * `table` is a section in its own right — the table tools used to share the `insert` pane,
 * which made that pane a mixture of "put something new in" and "change the table you are
 * standing in". Each name here is both a `tools` entry and a pane.
 */
export type ToolName =
  | "font"
  | "paragraph"
  | "insert"
  | "table"
  | "qrcode"
  | "variable"
  | "page"
  | "watermark"
  | "print"
  | "template";

/**
 * 未给出 `tools` 时显示的工具栏分区。
 *
 * `table` 在默认集合里：表格是模板作者最先要用的东西，而一个只有在知道要指名它时
 * 才出现的分区，是谁也找不到的分区。
 *
 * `template` 也在默认集合里，并且排在第一个：加载一份模板是作者在编辑之前要做的事，
 * 把它放在「格式」之后意味着先改格式、再发现模板选错了。它没有对应的扩展——模板管线是
 * `editor/template.ts` 而不是一个 Tiptap 扩展——所以它的分区不带扩展闸门。
 *
 * `watermark` 收尾：水印是成品合同的一部分，不是一个高级选项，而一个只有在知道要指名它时
 * 才出现的分区，是谁也找不到的分区。放在最后，因为它是作者最后才会去动的东西。
 *
 * The toolbar sections shown when `tools` is not given.
 *
 * `table` is in the default set: a table is the first thing a template author reaches for,
 * and a section that only appears when somebody knows to name it is a section nobody finds.
 *
 * `template` is in the default set too, and first: loading a template is what an author does
 * before editing, and putting it after 「格式」 means changing the formatting before noticing the
 * wrong template was loaded. It has no extension behind it — the template pipeline is
 * `editor/template.ts` rather than a Tiptap extension — so its section carries no extension gate.
 *
 * `watermark` closes the default set: a watermark is part of a finished contract rather than an
 * advanced option, and a section that only appears when somebody knows to name it is a section
 * nobody finds. It is last because it is the last thing an author reaches for.
 */
export const DEFAULT_TOOLS: readonly ToolName[] = [
  "template",
  "font",
  "paragraph",
  "insert",
  "table",
  "page",
  "watermark"
];

/**
 * 水印扩展的选项，为 prop 类型而再导出。
 *
 * Options for the watermark extension, re-exported for the prop type.
 */
export interface WatermarkOptions {
  /** 是否启用水印。 / Whether the watermark is enabled. */
  enabled?: boolean;
  /** 水印文字。 / The watermark text. */
  text?: string;
  /** 水印图片的地址。 / The image source of the watermark. */
  imageSrc?: string;
  /** 逆时针的角度。默认 `-30`。 / Degrees anti-clockwise. Default `-30`. */
  angle?: number;
  /** `0…1`。默认 `0.12`。 / `0…1`. Default `0.12`. */
  opacity?: number;
  /** 以灰度渲染，而不是用品牌色。 / Render in grey rather than in the brand colour. */
  greyscale?: boolean;
  /**
   * 在整个纸面上重复水印，而不是只放一个居中的。
   *
   * Repeat the mark across the sheet instead of one centred mark.
   */
  tiled?: boolean;
  /** 文字水印的字号。默认 `"48px"`。 / Font size for a text watermark. Default `"48px"`. */
  fontSize?: string;
  /** 水印颜色。 / The watermark colour. */
  color?: string;
}

/** 打印扩展的选项。 / Options for the print extension. */
export interface PrintOptions {
  /**
   * `@page` 尺寸；默认使用文档自己的页面设置。
   *
   * `@page` size; defaults to the document's own page setup.
   */
  paperFormat?: PaperFormat;
  /** 纸张方向。 / The sheet orientation. */
  orientation?: Orientation;
  /** 页边距。 / The page margins. */
  margins?: Margins;
  /**
   * 让浏览器用它自己的页眉/页脚渲染页码。
   *
   * 用的是 `@page` 页边距框，Chromium 131+ 支持，Firefox/Safari 不支持；在不支持的地方，
   * 文档自己的 `pageNumber` 节点仍会打印，因此页码永远不会丢失。
   *
   * Let the browser render its own running header/footer with page numbers.
   *
   * Uses `@page` margin boxes, which Chromium 131+ supports and Firefox/Safari do
   * not; where they are unsupported the document's own `pageNumber` nodes still
   * print, so page numbers are never lost.
   */
  marginBoxes?: boolean;
  /**
   * 浏览器提供「另存为 PDF」时建议的文件名。
   *
   * File name suggested when the browser offers "Save as PDF".
   */
  documentTitle?: string;
  /**
   * 在打印之前调用，此时字体与图片都已就绪。
   *
   * Called just before printing, after fonts and images have settled.
   */
  onBeforePrint?: () => void | Promise<void>;
  /** 打印对话框关闭后调用。 / Called after the print dialog closes. */
  onAfterPrint?: () => void;
}

/** 调用方持有的编辑器引用。 / Reference a caller can hold to drive the editor. */
export interface SEditorExposed {
  /** Tiptap 编辑器，挂载前为 `undefined`。 / The Tiptap editor, or `undefined` before mount. */
  readonly editor: unknown;

  /** 文档的 ProseMirror JSON 形式。 / The document as ProseMirror JSON. */
  getJSON(): JSONContent;

  /** 文档的 HTML 形式。 / The document as HTML. */
  getHTML(): string;

  /**
   * 完整的存储产物，包含页面设置、变量与水印。
   *
   * The full stored artefact, including page setup, variables and watermark.
   */
  getTemplate(): TemplateDocument;

  /**
   * 替换文档。接受 JSON、HTML 或完整模板。
   *
   * Replace the document. Accepts JSON, HTML, or a full template.
   */
  setTemplate(content: TemplateContent | TemplateDocument): void;

  /** 填写变量，但不改动模板。 / Fill the variables without changing the template. */
  fill(values: VariableFillData): void;

  /** 打开填写对话框。 / Open the fill dialog. */
  openFillDialog(): void;

  /** 打印文档。 / Print the document. */
  print(): void;

  /** 用配置好的目标保存。 / Save using the configured target. */
  save(): Promise<SaveResult>;

  /**
   * 请求模板列表，前提是来源为远程列表。
   *
   * Request the template list, if the source is a remote list.
   */
  loadTemplateList(): Promise<TemplateListItem[]>;

  /** 取回并渲染模板列表中的一项。 / Fetch and render one entry of the template list. */
  selectTemplate(id: string): Promise<void>;

  /** 把焦点移入文档。 / Move focus into the document. */
  focus(): void;
}
