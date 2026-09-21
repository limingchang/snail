/**
 * 模板的管线，以纯函数实现。
 *
 * 组件为了*存储*、*读取*与*定位*一份 {@link TemplateDocument} 所需的一切都在这里，没有
 * 编辑器、没有 DOM、也没有框架，所以整份模板契约都能在 Node 环境里做单元测试。
 * `SEditor.vue` 只保留接线：调用这里的哪一个，以及何时调用。
 *
 * ## 为什么要有版本，以及为什么要剥掉易变属性
 *
 * 旧包持久化的只有 `editor.getJSON()`，别无其他（缺陷 43）。两个后果：某个版本写出的模板
 * 只有那个版本能读，而且 `pageContent.attrs._updateTimestamp` 会让一份*完全相同*的模板在
 * 每次加载时序列化出不同的结果 —— 于是「文档变了吗？」无法回答，任何迁移也永远写不出来。
 * 因此 {@link buildTemplateDocument} 会盖上 {@link TEMPLATE_VERSION} 并丢掉每一个易变
 * 属性，而 {@link migrateTemplate} 是未来版本升级的唯一入口。
 *
 * The template plumbing, as pure functions.
 *
 * Everything the component needs in order to *store*, *read* and *locate* a
 * {@link TemplateDocument} lives here, with no editor, no DOM and no framework, so the
 * whole template contract is unit-testable in a Node environment. `SEditor.vue` keeps
 * only the wiring: which of these to call, and when.
 *
 * ## Why a version, and why volatile attributes are stripped
 *
 * The legacy package persisted `editor.getJSON()` and nothing else (defect 43). Two
 * consequences: a template written by one release could only be read by that release,
 * and `pageContent.attrs._updateTimestamp` made an *identical* template serialise
 * differently on every load — so "did the document change?" was unanswerable and no
 * migration could ever be written. {@link buildTemplateDocument} therefore stamps
 * {@link TEMPLATE_VERSION} and drops every volatile attribute, and
 * {@link migrateTemplate} is the single place a future version gets upgraded.
 */

import type { JSONContent } from "@tiptap/core";

import { TEMPLATE_VERSION } from "../typings/editor";
import type {
  SaveResult,
  TemplateContent,
  TemplateDocument,
  TemplateListItem,
  TemplatePageSetup,
  TemplateSaveTarget,
  TemplateSource,
  TemplateVariableSummary,
  TemplateWatermark,
  WatermarkOptions
} from "../typings/editor";
import type { VariableAttrs } from "../typings/variable";
import { DEFAULT_MARGINS } from "../typings/paper";
import type { Margins, Orientation, PaperFormat } from "../typings/paper";

// ---------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------

/**
 * 模板层可能失败的每一种方式。由 `editor/locale.ts` 映射成一句话。
 *
 * Every way the template layer can fail. Mapped to a sentence by `editor/locale.ts`.
 */
export type TemplateErrorCode =
  | "invalid-template"
  | "not-a-json-document"
  | "storage-unavailable"
  | "storage-write-failed"
  | "network-unavailable"
  | "network-error"
  | "response-error"
  | "invalid-list";

/**
 * 携带稳定 {@link TemplateErrorCode} 的错误。
 *
 * 是码而不是消息：本模块是纯的、没有 locale，因此它不能决定用户读到什么语言。
 * `SEditor.vue` 通过 {@link describeTemplateError} 把码映射出去。
 *
 * An error carrying a stable {@link TemplateErrorCode}.
 *
 * A code rather than a message: this module is pure and has no locale, so it must not
 * decide what language the user reads. `SEditor.vue` maps the code through
 * {@link describeTemplateError}.
 */
export interface TemplateError extends Error {
  /** 稳定、机器可读的失败码。 / A stable, machine-readable failure code. */
  readonly code: TemplateErrorCode;
}

/**
 * 构建一个 {@link TemplateError}。`message` 面向开发者，永不展示。
 *
 * Build a {@link TemplateError}. `message` is developer-facing, never shown.
 */
export function createTemplateError(code: TemplateErrorCode, message?: string): TemplateError {
  const error = new Error(message ?? code) as Error & { code: TemplateErrorCode };
  error.code = code;
  return error;
}

/**
 * 当一个抛出的值是 {@link TemplateError} 时为 `true`。
 *
 * `true` when a thrown value is a {@link TemplateError}.
 */
export function isTemplateError(value: unknown): value is TemplateError {
  return (
    value instanceof Error && typeof (value as { code?: unknown }).code === "string"
  );
}

/**
 * 抛出值的 {@link TemplateErrorCode}，供要把它渲染出来的调用方使用。
 *
 * The {@link TemplateErrorCode} of a thrown value, for a caller that renders it.
 */
export function templateErrorCode(value: unknown): TemplateErrorCode {
  return isTemplateError(value) ? value.code : "invalid-template";
}

// ---------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------

/**
 * 把某个值标记为易变的属性名前缀。
 *
 * 前导下划线是页面扩展用于记账属性的约定，例如 `_updateTimestamp`；它是一个*约定*而不是
 * 一份清单，因此新增的临时属性无需本模块知道它的名字就会被剥掉。
 *
 * The attribute-name prefix that marks a value as volatile.
 *
 * A leading underscore is the convention the page extension uses for bookkeeping
 * attributes such as `_updateTimestamp`, and it is a *convention* rather than a list so
 * a new transient attribute is stripped without this module having to learn its name.
 */
const VOLATILE_ATTRIBUTE_PREFIX = "_";

/**
 * 当一个属性绝不能进入已存储的模板时为 `true`。
 *
 * `true` for an attribute that must never reach a stored template.
 */
export function isVolatileAttribute(name: string): boolean {
  return name.startsWith(VOLATILE_ATTRIBUTE_PREFIX);
}

/**
 * 深拷贝一份 ProseMirror JSON 文档，并去掉它的易变属性。
 *
 * 是拷贝，绝不改动原对象：调用方交进来的是 `editor.getJSON()` 返回的实时文档（它本身已经
 * 是拷贝），但持有缓存对象的调用方也能到达这里，改动它会是个意外。
 *
 * Deep-copy a ProseMirror JSON document without its volatile attributes.
 *
 * A copy, never a mutation: the caller hands in the live document returned by
 * `editor.getJSON()` (itself already a copy), but this function is also reachable from a
 * consumer with a cached object, and mutating that would be a surprise.
 */
export function sanitiseDocument(doc: JSONContent): JSONContent {
  const clean: JSONContent = {};

  if (doc.type !== undefined) clean.type = doc.type;
  if (doc.text !== undefined) clean.text = doc.text;
  if (doc.marks !== undefined) clean.marks = doc.marks.map((mark) => ({ ...mark }));

  if (doc.attrs !== undefined) {
    const attrs: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(doc.attrs)) {
      if (isVolatileAttribute(name)) continue;
      attrs[name] = value;
    }
    clean.attrs = attrs;
  }

  if (doc.content !== undefined) clean.content = doc.content.map(sanitiseDocument);

  return clean;
}

/**
 * 编辑器回退到的空文档。
 *
 * 按**多页** schema 塑形，因为即使 `multiPage` 为 `false`，那份文档也是模型（旧缺陷 37：
 * 另一条分支根本没有注册顶层节点，于是 ProseMirror 抛出
 * `Schema is missing its top node type (doc)`）。一个 page 加一个内容块是页面 schema 能
 * 接受的最小文档。
 *
 * The empty document the editor falls back to.
 *
 * Shaped for the **multi-page** schema, because that document is the model even when
 * `multiPage` is `false` (legacy defect 37: the alternate branch registered no top node
 * at all, so ProseMirror threw `Schema is missing its top node type (doc)`). One page
 * with one content block is the smallest document the page schema accepts.
 */
export function emptyDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "page",
        content: [{ type: "pageContent", content: [{ type: "paragraph" }] }]
      }
    ]
  };
}

// ---------------------------------------------------------------------------------
// Reading a document
// ---------------------------------------------------------------------------------

/** 深度优先查找某个类型的第一个节点。 / Depth-first search for the first node of a type. */
function findNode(doc: JSONContent, type: string): JSONContent | undefined {
  if (doc.type === type) return doc;
  if (!doc.content) return undefined;
  for (const child of doc.content) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return undefined;
}

/** 深度优先遍历每一个节点。 / Depth-first walk over every node. */
function walk(doc: JSONContent, visit: (node: JSONContent) => void): void {
  visit(doc);
  if (!doc.content) return;
  for (const child of doc.content) walk(child, visit);
}

/**
 * 页面设置的兜底值，与页面扩展自己的默认值一致。
 *
 * The page-setup fallback, mirroring the page extension's own defaults.
 */
export const DEFAULT_PAGE_SETUP: TemplatePageSetup = {
  paperFormat: "A4",
  orientation: "portrait",
  margins: { ...DEFAULT_MARGINS }
};

/**
 * 从第一个 `page` 节点读出页面设置。
 *
 * page 的属性就是模型，所以它们是读回来的，而不是另行记住的：用户可能用页面面板改了纸张
 * 大小却从未碰过任何 prop，而只根据 props 写出的模板会记录错误的纸张。
 *
 * Read the page setup out of the first `page` node.
 *
 * The page's attributes are the model, so they are read back rather than remembered
 * separately: the user may change the paper size with the page panel and never touch a
 * prop, and a template written from props alone would record the wrong sheet.
 */
export function readPageSetup(doc: JSONContent, fallback: TemplatePageSetup = DEFAULT_PAGE_SETUP): TemplatePageSetup {
  const page = findNode(doc, "page");
  const attrs = (page?.attrs ?? {}) as Partial<{
    paperFormat: PaperFormat;
    orientation: Orientation;
    margins: Margins;
  }>;

  return {
    paperFormat: attrs.paperFormat ?? fallback.paperFormat,
    orientation: attrs.orientation ?? fallback.orientation,
    margins: attrs.margins ?? fallback.margins,
    pageCount: fallback.pageCount
  };
}

/** 统计一份文档里的 `page` 节点数。 / Count the `page` nodes in a document. */
export function countPages(doc: JSONContent): number {
  let total = 0;
  walk(doc, (node) => {
    if (node.type === "page") total += 1;
  });
  return total;
}

/**
 * 一份文档声明的每一个变量，无需询问编辑器。
 *
 * 已存储的模板必须能被一个没有编辑器的读取方检查 —— 服务端校验、模板列表、邮件预览 ——
 * 所以这份摘要是从 JSON 推导出来的，而不是来自 `getVariables()`。按 key 去重，因为一份
 * 合同完全可能在正文里重复 `{甲方}`、又在签署区再写一次；*第一次*出现者胜出，摘要因此
 * 保持文档顺序。
 *
 * Every variable a document declares, without asking the editor.
 *
 * A stored template has to be checkable by a reader that has no editor — a server-side
 * validation, a template list, an email preview — so the summary is derived from the
 * JSON rather than from `getVariables()`. Deduplicated by key, because a contract
 * legitimately repeats `{甲方}` in the body and again in the signature block; the
 * *first* occurrence wins so the summary keeps document order.
 */
export function summariseVariables(doc: JSONContent): TemplateVariableSummary[] {
  const seen = new Set<string>();
  const summary: TemplateVariableSummary[] = [];

  walk(doc, (node) => {
    if (node.type !== "variable") return;
    const attrs = node.attrs as Partial<VariableAttrs> | undefined;
    const key = attrs?.key;
    if (typeof key !== "string" || key === "" || seen.has(key)) return;
    seen.add(key);

    const data = attrs?.data;
    summary.push({
      key,
      label: typeof attrs?.label === "string" ? attrs.label : key,
      type: data?.type ?? "text",
      // "Required" means "nothing supplies a value": a `system` variable is supplied by
      // the document and a `formula` derives its own, so neither is ever required.
      required:
        data?.type !== "system" && data?.type !== "formula" && attrs?.defaultValue === undefined
    });
  });

  return summary;
}

/**
 * 把水印设置记录成存储形态，并丢掉未启用的水印。
 *
 * Record the watermark settings in the stored shape, dropping a disabled mark.
 */
export function readWatermark(options: WatermarkOptions | undefined): TemplateWatermark | undefined {
  if (!options || options.enabled !== true) return undefined;
  return {
    enabled: true,
    text: options.text,
    imageSrc: options.imageSrc,
    angle: options.angle,
    opacity: options.opacity,
    greyscale: options.greyscale,
    tiled: options.tiled
  };
}

// ---------------------------------------------------------------------------------
// Building and reading a TemplateDocument
// ---------------------------------------------------------------------------------

/**
 * 用户索要模板时，`SEditor.vue` 所知道的一切。
 *
 * Everything `SEditor.vue` knows when the user asks for a template.
 */
export interface TemplateBuildInput {
  /**
   * 实时文档，即 `editor.getJSON()` 返回的东西。
   *
   * The live document, as returned by `editor.getJSON()`.
   */
  doc: JSONContent;
  /** 页面设置；省略时从文档里读。 / Page setup; omit to read it from the document. */
  page?: TemplatePageSetup;
  /**
   * 变量摘要；省略时从文档推导。
   *
   * Variable summaries; omit to derive them from the document.
   */
  variables?: TemplateVariableSummary[];
  /** 水印设置。 / Watermark settings. */
  watermark?: TemplateWatermark;
  /** 自由形式的元数据。 / Free-form metadata. */
  meta?: Record<string, unknown>;
}

/**
 * 构建被存储下来的产物。
 *
 * `version` 始终存在，文档也始终经过 {@link sanitiseDocument}，因此对一份未改动的文档保存
 * 两次会得到逐字节相同的 JSON。正是这个性质让「这份模板脏了吗？」可以回答、让迁移可以
 * 测试。
 *
 * Build the stored artefact.
 *
 * `version` is always present, and the doc always goes through
 * {@link sanitiseDocument}, so two saves of an unchanged document produce byte-identical
 * JSON. That property is what makes "is this template dirty?" answerable and a migration
 * testable.
 */
export function buildTemplateDocument(input: TemplateBuildInput): TemplateDocument {
  const doc = sanitiseDocument(input.doc);
  const template: TemplateDocument = {
    version: TEMPLATE_VERSION,
    doc
  };

  const variables = input.variables ?? summariseVariables(doc);
  if (variables.length > 0) template.variables = variables;

  const page = input.page ?? readPageSetup(doc);
  template.page = { ...page, pageCount: page.pageCount ?? countPages(doc) };

  const watermark = readWatermark(input.watermark);
  if (watermark) template.watermark = watermark;

  if (input.meta) template.meta = input.meta;

  return template;
}

/**
 * 把一份已存储的模板升级到 {@link TEMPLATE_VERSION}。
 *
 * 目前只有一个版本，所以真正要做的事只是规范化一份裸文档；这个函数现在就存在，是为了让
 * *下一个*版本有一个显然的地方加一步，也让调用方能知道迁移是否发生过。
 *
 * Upgrade a stored template to {@link TEMPLATE_VERSION}.
 *
 * There is one version so far, so the only real work is normalising a bare document; the
 * function exists now so that the *next* release has an obvious place to add a step and
 * so a caller can tell whether a migration happened.
 */
export function migrateTemplate(template: TemplateDocument): { template: TemplateDocument; migrated: boolean } {
  const migrated = template.version !== TEMPLATE_VERSION;
  return {
    template: { ...template, version: TEMPLATE_VERSION, doc: sanitiseDocument(template.doc) },
    migrated
  };
}

/**
 * 当一个值是 {@link TemplateDocument} 而不是裸文档时为 `true`。
 *
 * `true` when a value is a {@link TemplateDocument} rather than a bare document.
 */
export function isTemplateDocument(value: unknown): value is TemplateDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { doc?: unknown; version?: unknown };
  return typeof candidate.doc === "object" && candidate.doc !== null;
}

/**
 * 当一个值看起来像 ProseMirror JSON 文档时为 `true`。
 *
 * `true` when a value looks like a ProseMirror JSON document.
 */
function isJsonDocument(value: unknown): value is JSONContent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** {@link parseTemplateInput} 产出的东西。 / What {@link parseTemplateInput} produces. */
export interface ParsedTemplate {
  /** 存储形态，始终处于当前版本。 / The stored shape, always at the current version. */
  template: TemplateDocument;
  /**
   * 交给编辑器的东西：一份 JSON 文档，或一个 HTML 字符串。
   *
   * What to hand the editor: a JSON document, or an HTML string.
   */
  content: TemplateContent;
  /**
   * 当输入是一份旧版本模板时为 `true`。
   *
   * `true` when the input was a template of an older version.
   */
  migrated: boolean;
}

/**
 * 把调用方可能持有的三种东西读成一种形态。
 *
 * `TemplateContent` 刻意是 `JSONContent | string`，而字符串是有歧义的 —— 它要么是序列化后
 * 的 JSON，要么是 HTML。这里不靠 schema 猜测，而是用*第一个有效字符*来决定：`{` 意味着
 * JSON。对两种情况都精确（`<p>` 两个都不是），而且它会响亮地失败，而不是把原始 JSON
 * 静默地当文本渲染出来。
 *
 * Read any of the three things a caller may hold into one shape.
 *
 * `TemplateContent` is deliberately `JSONContent | string`, and a string is ambiguous —
 * it is either stringified JSON or HTML. Rather than guess from a schema, the decision is
 * made from the *first significant character*: `{` means JSON. That is exact for both
 * cases (`<p>` starts neither) and it fails loudly instead of silently rendering raw JSON
 * as text.
 */
export function parseTemplateInput(input: TemplateContent | TemplateDocument): ParsedTemplate {
  if (isTemplateDocument(input)) {
    const { template, migrated } = migrateTemplate(input);
    return { template, content: template.doc, migrated };
  }

  if (typeof input === "string") {
    const trimmed = input.trim();

    if (trimmed.startsWith("{")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw createTemplateError("not-a-json-document");
      }
      return parseTemplateInput(parsed as TemplateContent | TemplateDocument);
    }

    // HTML. The stored document is empty because HTML carries no separate page setup;
    // the editor parses the markup into whatever the schema allows.
    const template: TemplateDocument = { version: TEMPLATE_VERSION, doc: emptyDocument() };
    return { template, content: input, migrated: false };
  }

  if (isJsonDocument(input)) {
    const template: TemplateDocument = { version: TEMPLATE_VERSION, doc: sanitiseDocument(input) };
    return { template, content: template.doc, migrated: false };
  }

  throw createTemplateError("invalid-template");
}

// ---------------------------------------------------------------------------------
// Remote sources
// ---------------------------------------------------------------------------------

/**
 * 本模块需要的 `fetch` 的结构子集。可注入，因此可测试。
 *
 * The structural subset of `fetch` this module needs. Injectable, therefore testable.
 */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/**
 * 结构意义上的 `localStorage`/`sessionStorage`。可注入，因此可测试。
 *
 * `localStorage`/`sessionStorage`, structurally. Injectable, therefore testable.
 */
export interface StorageLike {
  /** 读一个键，没有则为 `null`。 / Read a key, or `null` when it is absent. */
  getItem(key: string): string | null;
  /** 在一个键下写入一个值。 / Store a value under a key. */
  setItem(key: string, value: string): void;
  /** 删除一个键。 / Remove a key. */
  removeItem(key: string): void;
}

/**
 * 当 {@link TemplateSource} 走 `remote-list` 分支时为 `true`。
 *
 * `true` for the `remote-list` arm of {@link TemplateSource}.
 */
export function isRemoteListSource(
  source: TemplateSource | undefined
): source is Extract<TemplateSource, { kind: "remote-list" }> {
  return source?.kind === "remote-list";
}

/**
 * 当 {@link TemplateSource} 走 `remote` 分支时为 `true`。
 *
 * `true` for the `remote` arm of {@link TemplateSource}.
 */
export function isRemoteSource(
  source: TemplateSource | undefined
): source is Extract<TemplateSource, { kind: "remote" }> {
  return source?.kind === "remote";
}

/**
 * 模板列表是在挂载时加载，还是等待用户操作。
 *
 * Whether a template list is loaded on mount or waits for the user.
 */
export type TemplateLoadPolicy = "auto" | "manual";

/**
 * 某个来源的加载策略。
 *
 * 做成一个纯函数，是因为它是审查者不借助组件也必须能检查的那一项行为：默认是 `"manual"`，
 * 而填写模式要的正是它 —— 打印操作员自己挑模板，所以页面不能自作主张去取内容、渲染出
 * 操作员没有选择的东西。
 *
 * The load policy of a source.
 *
 * A pure function because it is the one behaviour a reviewer must be able to check
 * without a component: `"manual"` is the default, and it is what fill mode wants — a
 * print operator picks the template, so the page must not fetch content on its own and
 * render something the operator did not choose.
 */
export function templateLoadPolicy(source: TemplateSource | undefined): TemplateLoadPolicy {
  if (!isRemoteListSource(source)) return "manual";
  return source.load === "auto" ? "auto" : "manual";
}

/**
 * 当来源要求挂载时就把列表第一项渲染出来时为 `true`。
 *
 * `true` when the source asks for the first list entry to be rendered on mount.
 */
export function shouldAutoLoadTemplate(source: TemplateSource | undefined): boolean {
  return templateLoadPolicy(source) === "auto";
}

/**
 * 拼接基础 URL 与路径片段，既不重复也不丢失分隔符。
 *
 * Join a base URL and a path segment without doubling or losing the separator.
 */
export function joinUrl(base: string, segment: string): string {
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = segment.startsWith("/") ? segment.slice(1) : segment;
  return `${left}/${right}`;
}

/**
 * 列表里某一项的内容在哪里。
 *
 * 提供了 `contentUrl` 时它优先，因为后端列出 `/templates` 而内容放在
 * `/templates/{id}/content` 是最常见的情况，只有调用方知道它的形状。默认值 `${url}/${id}`
 * 记在 `typings/editor.ts` 里，也是常规 REST 集合的用法。
 *
 * Where one list entry's content lives.
 *
 * `contentUrl` wins when supplied, because a backend that lists `/templates` and serves
 * `/templates/{id}/content` is the common case and only the caller knows the shape.
 * The default — `${url}/${id}` — is documented in `typings/editor.ts` and is what a
 * conventional REST collection uses.
 */
export function resolveTemplateContentUrl(
  source: Extract<TemplateSource, { kind: "remote-list" }>,
  item: TemplateListItem
): string {
  if (source.contentUrl) return source.contentUrl(item);
  return joinUrl(source.url, item.id);
}

/**
 * 规范化后的模板列表：条目，外加随列表一起内联到达的文档。
 *
 * A normalised template list: the entries, plus any documents that arrived inline.
 */
export interface TemplateListResult {
  /** 列表条目。 / The list entries. */
  items: TemplateListItem[];
  /**
   * 自带文档的条目。
   *
   * `typings/editor.ts` 允许列表写成 `{ id, name, doc }`，因此一个返回整份模板的后端能为
   * 每次选择省下一次请求。文档放在列表*旁边*而不是列表上，因为 {@link TemplateListItem}
   * 是公开形态，给它加字段会把一处内部便利泄漏进契约。
   *
   * Entries that carried their own document.
   *
   * `typings/editor.ts` allows a list of `{ id, name, doc }`, so a backend that returns
   * whole templates saves one request per selection. The documents are kept beside the
   * list rather than on it, because {@link TemplateListItem} is the public shape and
   * adding a field to it would leak an internal convenience into the contract.
   */
  inline: ReadonlyMap<string, TemplateContent>;
}

/**
 * 把一份列表响应读成 {@link TemplateListResult}。
 *
 * 刻意宽容：后端返回 `{ data: [...] }` 而不是裸数组很常见，而一个读不懂的条目不能把整份
 * 列表清空 —— 没有 `id` 的条目被跳过，没有 `name` 的条目用它的 id 作为名字。
 *
 * Read a list response into {@link TemplateListResult}.
 *
 * Tolerant on purpose: a backend returning `{ data: [...] }` rather than a bare array is
 * common, and one unreadable entry must not blank the whole list — an entry without an
 * `id` is skipped, and an entry without a `name` is labelled with its id.
 */
export function normaliseTemplateList(payload: unknown): TemplateListResult {
  const raw = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : undefined;

  if (!raw) throw createTemplateError("invalid-list");

  const items: TemplateListItem[] = [];
  const inline = new Map<string, TemplateContent>();

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = record.id ?? record.key ?? record.templateId;
    if (typeof id !== "string" && typeof id !== "number") continue;

    const key = String(id);
    const item: TemplateListItem = { id: key, name: typeof record.name === "string" ? record.name : key };
    if (typeof record.description === "string") item.description = record.description;
    if (typeof record.updatedAt === "string") item.updatedAt = record.updatedAt;
    items.push(item);

    const doc = record.doc ?? record.content ?? record.template;
    if (doc !== undefined) inline.set(key, doc as TemplateContent);
  }

  return { items, inline };
}

/** 取一份模板并规范化它。 / Fetch one template and normalise it. */
export async function fetchTemplate(
  url: string,
  headers: Record<string, string> | undefined,
  fetchImpl: FetchLike | undefined
): Promise<ParsedTemplate> {
  if (!fetchImpl) throw createTemplateError("network-unavailable");

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json", ...headers } });
  } catch (cause) {
    throw createTemplateError("network-error", cause instanceof Error ? cause.message : String(cause));
  }
  if (!response.ok) throw createTemplateError("response-error", `HTTP ${response.status}`);

  const text = await response.text();
  return parseTemplateInput(text);
}

/** 取一份模板列表。 / Fetch a template list. */
export async function fetchTemplateList(
  url: string,
  headers: Record<string, string> | undefined,
  fetchImpl: FetchLike | undefined
): Promise<TemplateListResult> {
  if (!fetchImpl) throw createTemplateError("network-unavailable");

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json", ...headers } });
  } catch (cause) {
    throw createTemplateError("network-error", cause instanceof Error ? cause.message : String(cause));
  }
  if (!response.ok) throw createTemplateError("response-error", `HTTP ${response.status}`);

  try {
    return normaliseTemplateList(await response.json());
  } catch (cause) {
    if (isTemplateError(cause)) throw cause;
    throw createTemplateError("invalid-list", cause instanceof Error ? cause.message : String(cause));
  }
}

// ---------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------

/** 默认的 `localStorage` 键。 / The default `localStorage` key. */
export const DEFAULT_STORAGE_KEY = "snail-editor-template";

/**
 * {@link saveTemplateToTarget} 在目标本身之外需要的一切。
 *
 * Everything {@link saveTemplateToTarget} needs beyond the target itself.
 */
export interface SaveContext {
  /** 要写入的模板。 / The template to write. */
  template: TemplateDocument;
  /**
   * 文档的 HTML 形式，在 `structured === false` 时使用。
   *
   * The document as HTML, used when `structured === false`.
   */
  html: string;
  /**
   * 可注入的存储；`SEditor.vue` 传入环境自己的存储。
   *
   * Injectable storage; `SEditor.vue` passes the environment's own.
   */
  storage?: { local?: StorageLike; session?: StorageLike };
  /** 可注入的 `fetch`。 / Injectable `fetch`. */
  fetch?: FetchLike;
  /** 覆盖 {@link DEFAULT_STORAGE_KEY}。 / Overrides {@link DEFAULT_STORAGE_KEY}. */
  storageKey?: string;
}

/**
 * 针对一个 {@link TemplateSaveTarget} 执行保存。
 *
 * 任何情况下都返回 {@link SaveResult} 而不抛错，因为结果*就是*报告 —— `status`、`kind`，
 * 以及被写出的那份模板 —— 想要 rejection 的调用方会从 `SEditor.save()` 拿到一个：它在
 * `onSave` 与 `save` emit 跑完之后重新抛出 {@link SaveResult.error}。这个顺序是有意的：
 * 即便这次尝试失败了，使用方也必须听到它。
 *
 * Perform a save against a {@link TemplateSaveTarget}.
 *
 * Returns a {@link SaveResult} in every case rather than throwing, because the result *is*
 * the report — `status`, `kind`, and the template that was written — and a caller that
 * wants a rejection gets one from `SEditor.save()`, which re-raises
 * {@link SaveResult.error} after `onSave` and the `save` emit have run. That ordering is
 * deliberate: a consumer must hear about the attempt even when it failed.
 */
export async function saveTemplateToTarget(
  target: TemplateSaveTarget,
  context: SaveContext
): Promise<SaveResult> {
  if (target.kind === "local") {
    const storage = target.session === true ? context.storage?.session : context.storage?.local;
    if (!storage) {
      return {
        kind: "local",
        template: context.template,
        error: createTemplateError("storage-unavailable")
      };
    }
    try {
      storage.setItem(context.storageKey ?? target.storageKey ?? DEFAULT_STORAGE_KEY, JSON.stringify(context.template));
      return { kind: "local", template: context.template };
    } catch (cause) {
      return {
        kind: "local",
        template: context.template,
        error: createTemplateError("storage-write-failed", cause instanceof Error ? cause.message : String(cause))
      };
    }
  }

  if (!context.fetch) {
    return {
      kind: "remote",
      template: context.template,
      error: createTemplateError("network-unavailable")
    };
  }

  // `structured: false` is for a backend that only stores markup, so the body is the
  // HTML string and the content type says so — sending JSON with an `text/html` label
  // (or the reverse) is the classic way to make a proxy mangle it.
  const structured = target.structured !== false;
  const body = structured ? JSON.stringify(context.template) : context.html;
  const contentType = structured ? "application/json" : "text/html";

  try {
    const response = await context.fetch(target.url, {
      method: target.method ?? "POST",
      headers: { "Content-Type": contentType, ...target.headers },
      body
    });

    const result: SaveResult = { kind: "remote", template: context.template, status: response.status };
    if (!response.ok) result.error = createTemplateError("response-error", `HTTP ${response.status}`);
    return result;
  } catch (cause) {
    return {
      kind: "remote",
      template: context.template,
      error: createTemplateError("network-error", cause instanceof Error ? cause.message : String(cause))
    };
  }
}

/**
 * 读回一份本地保存的模板。没有模板或读不出来时返回 `undefined`。
 *
 * Read back a locally saved template. Returns `undefined` when there is none or it is unreadable.
 */
export function readStoredTemplate(
  target: Extract<TemplateSaveTarget, { kind: "local" }>,
  storage: StorageLike | undefined
): TemplateDocument | undefined {
  if (!storage) return undefined;
  const raw = storage.getItem(target.storageKey ?? DEFAULT_STORAGE_KEY);
  if (raw === null) return undefined;
  try {
    return parseTemplateInput(JSON.parse(raw) as TemplateContent).template;
  } catch {
    // A corrupted slot is treated as "no saved template" rather than as a failure: the
    // editor can still be used, and throwing here would make the component unusable
    // until the user cleared their storage by hand.
    return undefined;
  }
}
