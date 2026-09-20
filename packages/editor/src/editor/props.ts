/**
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
 * What a caller may configure on the `variable` extension.
 *
 * `mode` and `values` are omitted: they are derived from the component's own `mode` and
 * `data` props, and letting a caller set them here would create a second source of truth
 * for both — which is the shape of the legacy component's problem.
 */
export interface SEditorVariableProps extends Partial<Omit<VariableOptions, "mode" | "values">> {
  /**
   * Variable types hidden from the design dialog's type picker.
   *
   * The legacy `SetVariableOptions.exlude` (sic) — spelled correctly here. A template
   * that ends up *containing* an excluded type still renders and still fills: this only
   * hides the choice, it does not make the type unreadable.
   */
  exclude?: readonly VariableType[];
}

/**
 * Configuration that only takes effect when the editor is (re)created.
 *
 * The optional extensions are registered **unless** they are named in
 * {@link disable}: a component that silently rendered no pages until a prop was set
 * would be a worse default than one that is switched off explicitly. What the flag is
 * for is a consumer that wants a plain rich-text field, or that already has its own
 * page implementation and does not want a second one.
 */
export interface SEditorExtensionOptions {
  /** Heading levels offered by `Paragraph`'s style select. Default `[1, 2, 3, 4, 5, 6]`. */
  heading?: { levels?: readonly Level[] };

  /** Table behaviour. `resizable` defaults to `true`. */
  table?: { resizable?: boolean };

  /** Register the paragraph spacing/indent attributes. Default `true`. */
  paragraphStyle?: boolean;

  /** Register the layout-table mode. Default `true`. */
  layoutMode?: boolean;

  /** Placeholder text, shown by `@tiptap/extensions`' `Placeholder`. */
  placeholder?: string;

  /** Maximum character count; `undefined` leaves `CharacterCount` unlimited. */
  characterLimit?: number;

  /**
   * Optional extensions to leave out of the schema entirely.
   *
   * Naming one here removes its node types and its commands, and the toolbar therefore
   * cannot offer it — the correspondence is intentional (defect: the legacy toolbar
   * gated on a string list alone, so a section could render with nothing behind it).
   */
  disable?: readonly ("page" | "variable" | "qrcode" | "watermark" | "print")[];
}

/** `SEditor`'s props. */
export interface SEditorProps {
  /**
   * The document, for `v-model`.
   *
   * Emitted back on every change, so a caller can either bind it (and own the content)
   * or ignore it and read `getTemplate()` when they need it. A JSON document, an HTML
   * string or a full {@link TemplateDocument} are all accepted.
   */
  modelValue?: TemplateContent;

  /** `"design"` authors the template; `"fill"` fills and prints it. Default `"design"`. */
  mode?: EditorMode;

  /**
   * The legacy mode switch.
   *
   * @deprecated Use `mode`. Kept because the legacy component documented `design` as its
   * public API; `mode` wins when both are given.
   */
  design?: boolean;

  /** The document to load. Ignored when a `template` source supplies one. */
  doc?: TemplateContent;

  /** Fill data, keyed by variable key. Read in fill mode and by the fill dialog. */
  data?: VariableFillData;

  /**
   * Which toolbar sections to show.
   *
   * A section renders only when it is named here **and** its extension is registered —
   * both halves of the gate are required, which is the fix for the legacy toolbar that
   * checked the name alone. Defaults to {@link DEFAULT_TOOLS}; an empty array hides the
   * toolbar.
   */
  tools?: readonly ToolName[];

  /** Register the page extension. Default `true`. */
  multiPage?: boolean;

  /** Where the template comes from. */
  template?: TemplateSource;

  /** Where `save()` writes. With no target, `save()` returns the template unsaved. */
  save?: TemplateSaveTarget;

  /** Page-extension options, used as the creation-time defaults. */
  page?: PageOptions;

  /** Variable-extension options. */
  variable?: SEditorVariableProps;

  /** Watermark-extension options. */
  watermark?: WatermarkOptions;

  /** Print-extension options, used as the defaults for the print command. */
  print?: PrintOptions;

  /** QR-code-extension options. */
  qrcode?: QRCodeOptions;

  /** Configuration that only applies when the editor is created. */
  extensions?: SEditorExtensionOptions;

  /** Partial overrides over the built-in Chinese strings. */
  locale?: Partial<EditorLocale>;

  /**
   * Called with the template whenever the user saves.
   *
   * Always called, whatever {@link save} is: a caller that persists through its own API
   * passes `onSave` alone, and one that uses a built-in target passes both.
   */
  onSave?: (payload: SavePayload) => void;

  /** Called on every document change. The `change` emit carries the same payload. */
  onChange?: (event: EditorChangeEvent) => void;
}

/** `SEditor`'s emits. */
export interface SEditorEmits {
  /** The document changed. See {@link SEditorProps.modelValue}. */
  "update:modelValue": [content: TemplateContent];

  /** The document changed, with the template and the HTML. */
  change: [event: EditorChangeEvent];

  /** A save finished. `SaveResult.error` is set when it failed. */
  save: [result: SaveResult];

  /** The editor exists and is ready to be driven. */
  ready: [editor: Editor];

  /** The mode was changed from inside the component (a footer action, say). */
  "update:mode": [mode: EditorMode];
}

/**
 * What every tool panel receives.
 *
 * A tool panel is a leaf: it takes the editor and a locale override and nothing else, so
 * the toolbar can render any of them from one `v-for` and a section can be added without
 * touching the toolbar's props.
 */
export interface ToolProps {
  /** The editor. `undefined` before mount, which every panel must tolerate. */
  editor?: Editor;

  /** Partial locale overrides, usually passed down from the root component. */
  locale?: Partial<EditorLocale>;
}

/** A tool panel's pane, as the toolbar renders it. */
export interface ToolSection {
  /** The section's own name. */
  name: ToolName;

  /** Localised title. */
  title: string;

  /** `true` when the section's extension is registered and `tools` names it. */
  enabled: boolean;
}
