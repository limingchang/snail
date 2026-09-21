/**
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

/** Which of the two modes the editor is in. */
export type EditorMode = "design" | "fill";

/** A template body: a ProseMirror JSON document, or an HTML/serialised string. */
export type TemplateContent = JSONContent | string;

/** The version written into {@link TemplateDocument}. */
export const TEMPLATE_VERSION = 1;

/** One entry of a remote template list. */
export interface TemplateListItem {
  /** Stable identifier used to fetch the content. */
  id: string;

  /** Shown in the picker. */
  name: string;

  /** Optional second line. */
  description?: string;

  /** Optional ISO timestamp, shown as-is. */
  updatedAt?: string;
}

/** The variables a template declares, without walking the document. */
export interface TemplateVariableSummary {
  key: string;
  label: string;
  type: VariableType;
  /** `true` when the variable has no value and no default. */
  required?: boolean;
}

/** Page setup recorded alongside the document. */
export interface TemplatePageSetup {
  paperFormat: PaperFormat;
  orientation: Orientation;
  margins: Margins;
  pageCount?: number;
}

/** Watermark settings recorded alongside the document. */
export interface TemplateWatermark {
  enabled: boolean;
  text?: string;
  imageSrc?: string;
  angle?: number;
  opacity?: number;
  greyscale?: boolean;
  tiled?: boolean;
}

/**
 * What gets stored as a template.
 *
 * Deliberately not just the ProseMirror document: a reader that only wants to render
 * or validate a template — a server-side check, an email preview, a template list —
 * should not have to walk a ProseMirror tree to find out which variables it needs.
 */
export interface TemplateDocument {
  /** {@link TEMPLATE_VERSION} at the time of writing. */
  version: number;

  /** The document itself. */
  doc: JSONContent;

  /** Every variable the template declares. */
  variables?: TemplateVariableSummary[];

  /** Page setup, so a reader can render the sheet without the editor. */
  page?: TemplatePageSetup;

  /** Watermark settings, so a reader can render them without the editor. */
  watermark?: TemplateWatermark;

  /** Free-form metadata the author wants to travel with the template. */
  meta?: Record<string, unknown>;
}

/** Where the editor gets its template from. */
export type TemplateSource =
  /** A template supplied inline — the simplest case. */
  | { kind: "local"; content?: TemplateContent }
  /** One template fetched from a URL. */
  | { kind: "remote"; url: string; headers?: Record<string, string> }
  /**
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
      /** Returns `TemplateListItem[]`, or an array of `{ id, name, doc }`. */
      url: string;
      headers?: Record<string, string>;
      /** Where one entry's content lives; defaults to `${url}/${id}`. */
      contentUrl?: (item: TemplateListItem) => string;
      /** Default `"manual"`. */
      load?: "auto" | "manual";
    };

/** Where the editor saves to. */
export type TemplateSaveTarget =
  /**
   * `localStorage` (or `sessionStorage` when `session` is set). No network, which is
   * what a single-user authoring session wants.
   */
  | { kind: "local"; storageKey?: string; session?: boolean }
  /**
   * POST the template to a backend.
   *
   * `structured: true` (the default) sends a {@link TemplateDocument}; `false` sends
   * the serialised HTML string instead, for a backend that only stores markup.
   */
  | {
      kind: "remote";
      url: string;
      method?: "POST" | "PUT";
      headers?: Record<string, string>;
      structured?: boolean;
    };

/** What `save()` produced. */
export interface SaveResult {
  /** `"local"` or `"remote"`, mirroring the target. */
  kind: "local" | "remote";
  /** The serialised template, always returned so a caller can do its own thing. */
  template: TemplateDocument;
  /** Present for a remote save. */
  status?: number;
  /** Set when the save failed; the thrown error is also re-raised. */
  error?: unknown;
}

/** Payload handed to {@link SEditorProps.onSave}. */
export interface SavePayload {
  template: TemplateDocument;
  /** `true` for a design-mode save. */
  design: boolean;
}

/** Everything the editor emits. */
export interface EditorChangeEvent {
  template: TemplateDocument;
  /** The document as HTML, for a consumer that stores markup. */
  html: string;
}

/**
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
 * The toolbar sections shown when `tools` is not given.
 *
 * `table` is in the default set: a table is the first thing a template author reaches for,
 * and a section that only appears when somebody knows to name it is a section nobody finds.
 */
export const DEFAULT_TOOLS: readonly ToolName[] = [
  "font",
  "paragraph",
  "insert",
  "table",
  "page"
];

/** Options for the watermark extension, re-exported for the prop type. */
export interface WatermarkOptions {
  enabled?: boolean;
  text?: string;
  imageSrc?: string;
  /** Degrees anti-clockwise. Default `-30`. */
  angle?: number;
  /** `0…1`. Default `0.12`. */
  opacity?: number;
  /** Render in grey rather than in the brand colour. */
  greyscale?: boolean;
  /** Repeat the mark across the sheet instead of one centred mark. */
  tiled?: boolean;
  /** Font size for a text watermark. Default `"48px"`. */
  fontSize?: string;
  color?: string;
}

/** Options for the print extension. */
export interface PrintOptions {
  /** `@page` size; defaults to the document's own page setup. */
  paperFormat?: PaperFormat;
  orientation?: Orientation;
  margins?: Margins;
  /**
   * Let the browser render its own running header/footer with page numbers.
   *
   * Uses `@page` margin boxes, which Chromium 131+ supports and Firefox/Safari do
   * not; where they are unsupported the document's own `pageNumber` nodes still
   * print, so page numbers are never lost.
   */
  marginBoxes?: boolean;
  /** File name suggested when the browser offers "Save as PDF". */
  documentTitle?: string;
  /** Called just before printing, after fonts and images have settled. */
  onBeforePrint?: () => void | Promise<void>;
  /** Called after the print dialog closes. */
  onAfterPrint?: () => void;
}

/** Reference a caller can hold to drive the editor. */
export interface SEditorExposed {
  /** The Tiptap editor, or `undefined` before mount. */
  readonly editor: unknown;

  /** The document as ProseMirror JSON. */
  getJSON(): JSONContent;

  /** The document as HTML. */
  getHTML(): string;

  /** The full stored artefact, including page setup, variables and watermark. */
  getTemplate(): TemplateDocument;

  /** Replace the document. Accepts JSON, HTML, or a full template. */
  setTemplate(content: TemplateContent | TemplateDocument): void;

  /** Fill the variables without changing the template. */
  fill(values: VariableFillData): void;

  /** Open the fill dialog. */
  openFillDialog(): void;

  /** Print the document. */
  print(): void;

  /** Save using the configured target. */
  save(): Promise<SaveResult>;

  /** Request the template list, if the source is a remote list. */
  loadTemplateList(): Promise<TemplateListItem[]>;

  /** Fetch and render one entry of the template list. */
  selectTemplate(id: string): Promise<void>;

  /** Move focus into the document. */
  focus(): void;
}
