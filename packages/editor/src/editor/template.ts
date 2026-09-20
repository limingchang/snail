/**
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

/** Every way the template layer can fail. Mapped to a sentence by `editor/locale.ts`. */
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
 * An error carrying a stable {@link TemplateErrorCode}.
 *
 * A code rather than a message: this module is pure and has no locale, so it must not
 * decide what language the user reads. `SEditor.vue` maps the code through
 * {@link describeTemplateError}.
 */
export interface TemplateError extends Error {
  readonly code: TemplateErrorCode;
}

/** Build a {@link TemplateError}. `message` is developer-facing, never shown. */
export function createTemplateError(code: TemplateErrorCode, message?: string): TemplateError {
  const error = new Error(message ?? code) as Error & { code: TemplateErrorCode };
  error.code = code;
  return error;
}

/** `true` when a thrown value is a {@link TemplateError}. */
export function isTemplateError(value: unknown): value is TemplateError {
  return (
    value instanceof Error && typeof (value as { code?: unknown }).code === "string"
  );
}

/** The {@link TemplateErrorCode} of a thrown value, for a caller that renders it. */
export function templateErrorCode(value: unknown): TemplateErrorCode {
  return isTemplateError(value) ? value.code : "invalid-template";
}

// ---------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------

/**
 * The attribute-name prefix that marks a value as volatile.
 *
 * A leading underscore is the convention the page extension uses for bookkeeping
 * attributes such as `_updateTimestamp`, and it is a *convention* rather than a list so
 * a new transient attribute is stripped without this module having to learn its name.
 */
const VOLATILE_ATTRIBUTE_PREFIX = "_";

/** `true` for an attribute that must never reach a stored template. */
export function isVolatileAttribute(name: string): boolean {
  return name.startsWith(VOLATILE_ATTRIBUTE_PREFIX);
}

/**
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

/** Depth-first search for the first node of a type. */
function findNode(doc: JSONContent, type: string): JSONContent | undefined {
  if (doc.type === type) return doc;
  if (!doc.content) return undefined;
  for (const child of doc.content) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return undefined;
}

/** Depth-first walk over every node. */
function walk(doc: JSONContent, visit: (node: JSONContent) => void): void {
  visit(doc);
  if (!doc.content) return;
  for (const child of doc.content) walk(child, visit);
}

/** The page-setup fallback, mirroring the page extension's own defaults. */
export const DEFAULT_PAGE_SETUP: TemplatePageSetup = {
  paperFormat: "A4",
  orientation: "portrait",
  margins: { ...DEFAULT_MARGINS }
};

/**
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

/** Count the `page` nodes in a document. */
export function countPages(doc: JSONContent): number {
  let total = 0;
  walk(doc, (node) => {
    if (node.type === "page") total += 1;
  });
  return total;
}

/**
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

/** Record the watermark settings in the stored shape, dropping a disabled mark. */
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

/** Everything `SEditor.vue` knows when the user asks for a template. */
export interface TemplateBuildInput {
  /** The live document, as returned by `editor.getJSON()`. */
  doc: JSONContent;
  /** Page setup; omit to read it from the document. */
  page?: TemplatePageSetup;
  /** Variable summaries; omit to derive them from the document. */
  variables?: TemplateVariableSummary[];
  /** Watermark settings. */
  watermark?: TemplateWatermark;
  /** Free-form metadata. */
  meta?: Record<string, unknown>;
}

/**
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

/** `true` when a value is a {@link TemplateDocument} rather than a bare document. */
export function isTemplateDocument(value: unknown): value is TemplateDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { doc?: unknown; version?: unknown };
  return typeof candidate.doc === "object" && candidate.doc !== null;
}

/** `true` when a value looks like a ProseMirror JSON document. */
function isJsonDocument(value: unknown): value is JSONContent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** What {@link parseTemplateInput} produces. */
export interface ParsedTemplate {
  /** The stored shape, always at the current version. */
  template: TemplateDocument;
  /** What to hand the editor: a JSON document, or an HTML string. */
  content: TemplateContent;
  /** `true` when the input was a template of an older version. */
  migrated: boolean;
}

/**
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

/** The structural subset of `fetch` this module needs. Injectable, therefore testable. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/** `localStorage`/`sessionStorage`, structurally. Injectable, therefore testable. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `true` for the `remote-list` arm of {@link TemplateSource}. */
export function isRemoteListSource(
  source: TemplateSource | undefined
): source is Extract<TemplateSource, { kind: "remote-list" }> {
  return source?.kind === "remote-list";
}

/** `true` for the `remote` arm of {@link TemplateSource}. */
export function isRemoteSource(
  source: TemplateSource | undefined
): source is Extract<TemplateSource, { kind: "remote" }> {
  return source?.kind === "remote";
}

/** Whether a template list is loaded on mount or waits for the user. */
export type TemplateLoadPolicy = "auto" | "manual";

/**
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

/** `true` when the source asks for the first list entry to be rendered on mount. */
export function shouldAutoLoadTemplate(source: TemplateSource | undefined): boolean {
  return templateLoadPolicy(source) === "auto";
}

/** Join a base URL and a path segment without doubling or losing the separator. */
export function joinUrl(base: string, segment: string): string {
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right = segment.startsWith("/") ? segment.slice(1) : segment;
  return `${left}/${right}`;
}

/**
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

/** A normalised template list: the entries, plus any documents that arrived inline. */
export interface TemplateListResult {
  items: TemplateListItem[];
  /**
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

/** Fetch one template and normalise it. */
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

/** Fetch a template list. */
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

/** The default `localStorage` key. */
export const DEFAULT_STORAGE_KEY = "snail-editor-template";

/** Everything {@link saveTemplateToTarget} needs beyond the target itself. */
export interface SaveContext {
  /** The template to write. */
  template: TemplateDocument;
  /** The document as HTML, used when `structured === false`. */
  html: string;
  /** Injectable storage; `SEditor.vue` passes the environment's own. */
  storage?: { local?: StorageLike; session?: StorageLike };
  /** Injectable `fetch`. */
  fetch?: FetchLike;
  /** Overrides {@link DEFAULT_STORAGE_KEY}. */
  storageKey?: string;
}

/**
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

/** Read back a locally saved template. Returns `undefined` when there is none or it is unreadable. */
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
