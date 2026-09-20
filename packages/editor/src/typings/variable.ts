/**
 * The variable model.
 *
 * A variable is an inline node in the document that stands for a value supplied
 * later — the mechanism that turns a contract *template* into a *filled contract*.
 *
 * ## Why the type and the configuration are one thing
 *
 * The legacy package stored `type` as a node attribute **and** the type-specific
 * configuration in a separate `data` attribute. Nothing kept the two in step, so a
 * `boolean` variable could carry a `list`'s `data`, `data` was never rendered or
 * parsed (`renderHTML` returned `{}`), and it therefore never survived a save. The
 * audit found five of the nine legacy types broken in exactly this way.
 *
 * Here {@link VariableData} is a **discriminated union** and the type *is* the
 * discriminant: there is no second place for the type to disagree with the payload,
 * and `switch (variable.data.type)` narrows the configuration for free.
 *
 * ## The type set
 *
 * | type | why it exists |
 * | --- | --- |
 * | `text` | the general case |
 * | `number` | plain numeric entry, optionally formatted |
 * | `money` | a number with a currency, precision and an optional Chinese uppercase rendering |
 * | `boolean` | writes `trueText`/`falseText`, which the legacy parser stored but never used |
 * | `date` | a date plus the format to print it in, including relative "today" |
 * | `select` | a closed choice list — the most requested contract case |
 * | `image` | a picture or a signature stroke |
 * | `formula` | a value computed from other variables, e.g. a total |
 * | `system` | a value the document supplies itself: page, total, current date |
 *
 * Deliberately **absent**: the legacy `object` (no sub-field editor, rendered
 * `[object Object]`), `list` (it stringified an array with commas and had no repeat
 * semantics) and `checkbox` (a single boolean dressed up as a multi-select). The
 * legacy `innerVariable` is not a type either — choosing a key from a tree is an
 * *input method*, so it lives on as {@link VariableAttrs.keySource}.
 */

/** A choice in a {@link SelectVariableData}. */
export interface VariableOption {
  /** What the user sees. */
  label: string;

  /** What the document receives. */
  value: string | number | boolean;

  /** Optional second line in the picker. */
  description?: string;
}

/** A value a variable can hold. Kept narrow on purpose: no `any`. */
export type VariableValue = string | number | boolean | null | undefined;

/** Free text. */
export interface TextVariableData {
  type: "text";

  /** Hint shown in the fill dialog only; never written into the document. */
  placeholder?: string;

  /** Soft maximum, surfaced by the fill dialog's counter. */
  maxLength?: number;
}

/** A number, optionally formatted for display. */
export interface NumberVariableData {
  type: "number";

  /** Decimal places to render. `undefined` renders the value as supplied. */
  precision?: number;

  /** Group thousands with the locale separator. */
  thousands?: boolean;

  /** Inclusive bounds enforced by the fill dialog. */
  min?: number;
  max?: number;
}

/** A number that is money. */
export interface MoneyVariableData {
  type: "money";

  /** Decimal places, default `2`. */
  precision?: number;

  /** Symbol prefixed to the rendered value, e.g. `"￥"`. */
  currency?: string;

  /** Group thousands, default `true`. */
  thousands?: boolean;

  /**
   * Also render the value in Chinese financial uppercase (壹佰贰拾叁元肆角伍分).
   *
   * A separate rendering rather than a separate type: it is the *same* number, and
   * a contract often needs both the digits and the uppercase words.
   */
  chineseUppercase?: boolean;
}

/** A yes/no value rendered as words. */
export interface BooleanVariableData {
  type: "boolean";

  /** Rendered when the value is `true`. Default `"是"`. */
  trueText?: string;

  /** Rendered when the value is `false`. Default `"否"`. */
  falseText?: string;
}

/** A date, with the format used when it is printed. */
export interface DateVariableData {
  type: "date";

  /**
   * Output pattern. `YYYY` `MM` `DD` `HH` `mm` `ss` are substituted; anything else
   * is literal text. Default `"YYYY年MM月DD日"`.
   */
  format?: string;

  /**
   * Treat the literal value `"today"` as the current date when filling.
   *
   * The legacy `date` type captured the current year **at design time** and stored
   * it as a plain string, so a template authored in 2024 printed 2024 forever.
   */
  resolveToday?: boolean;
}

/** A closed choice list. */
export interface SelectVariableData {
  type: "select";

  /** The choices. An empty list makes the fill dialog fall back to free text. */
  options: VariableOption[];

  /** Allow several values; the rendered value is joined with `joinWith`. */
  multiple?: boolean;

  /** Separator for {@link multiple}. Default `"、"`. */
  joinWith?: string;
}

/** A picture: an uploaded file or a drawn signature. */
export interface ImageVariableData {
  type: "image";

  /** `"upload"` (default) opens a file picker; `"signature"` opens the signature pad. */
  source?: "upload" | "signature";

  /** `accept` attribute for the upload input. Default `"image/*"`. */
  accept?: string;

  /** Refuse files larger than this. Default `2`. */
  maxSizeMb?: number;

  /** Rendered width, e.g. `"40mm"`. The height follows the aspect ratio. */
  width?: string;
}

/** A value computed from other variables. */
export interface FormulaVariableData {
  type: "formula";

  /**
   * Expression over other variables' keys — arithmetic plus the functions in
   * {@link FORMULA_FUNCTIONS} (`SUM`, `AVG`, `MIN`, `MAX`, `ROUND`, `IF`).
   *
   * ```text
   * SUM(item1.price, item2.price) * 1.06
   * ```
   */
  expression: string;

  /** Decimal places applied to the result. */
  precision?: number;

  /** Prefix/suffix, e.g. `"￥"`. */
  prefix?: string;
  suffix?: string;
}

/** Which value the document supplies on its own. */
export type SystemVariableKey =
  /** The current page's 1-based number. */
  | "page"
  /** How many pages the document has. */
  | "total"
  /** `"第 X 页"`. */
  | "pageLabel"
  /** `"第 X 页，共 Y 页"`. */
  | "pageOfTotal"
  /** The date the document was filled or printed. */
  | "date"
  /** The time the document was filled or printed. */
  | "time";

/** A value the document supplies rather than the user. */
export interface SystemVariableData {
  type: "system";

  /** Which value to render. */
  systemKey: SystemVariableKey;

  /** Output pattern for `date`/`time`; see {@link DateVariableData.format}. */
  format?: string;
}

/**
 * Everything a variable can be.
 *
 * The `type` field is the discriminant, so `variable.type` alone tells you which
 * configuration fields exist.
 */
export type VariableData =
  | TextVariableData
  | NumberVariableData
  | MoneyVariableData
  | BooleanVariableData
  | DateVariableData
  | SelectVariableData
  | ImageVariableData
  | FormulaVariableData
  | SystemVariableData;

/** Every variable type, in the order the picker lists them. */
export const VARIABLE_TYPES = [
  "text",
  "number",
  "money",
  "boolean",
  "date",
  "select",
  "image",
  "formula",
  "system"
] as const;

/** One of {@link VARIABLE_TYPES}. */
export type VariableType = (typeof VARIABLE_TYPES)[number];

/** A variable's attributes, as stored on the `variable` node. */
export interface VariableAttrs {
  /** Shown in the document and in the variable list. */
  label: string;

  /**
   * The key the fill data is looked up by — a dotted path for nested data
   * (`company.name`).
   */
  key: string;

  /** Optional note shown in the variable list and as the fill field's help text. */
  desc?: string;

  /** Value used when the fill data does not supply one. */
  defaultValue?: VariableValue;

  /** The type and its configuration. Discriminated on `type`. */
  data: VariableData;

  /**
   * How {@link key} was chosen.
   *
   * `"manual"` (default) means the user typed a path. `"inner"` means it came from
   * the caller's `innerVariable` tree, which is what the legacy package called the
   * `innerVariable` *type*. It is an input method, not a value shape, so it does not
   * belong in {@link VariableData}.
   */
  keySource?: "manual" | "inner";
}

/**
 * The functions a {@link FormulaVariableData.expression} may call.
 *
 * A fixed table rather than `eval` or `new Function`: the expression comes from
 * stored template data, so evaluating it as JavaScript would make opening a template
 * equivalent to running it. The parser accepts only numbers, `+ - * / ( )`, commas,
 * variable keys and these names.
 */
export const FORMULA_FUNCTIONS = ["SUM", "AVG", "MIN", "MAX", "ROUND", "IF", "ABS"] as const;

/** One of {@link FORMULA_FUNCTIONS}. */
export type FormulaFunction = (typeof FORMULA_FUNCTIONS)[number];

/**
 * A variable's value after resolution.
 *
 * `display` is what the document paints; `value` is the raw material, kept so a
 * consumer can save the filled data alongside the document without re-parsing the
 * rendered text.
 */
export interface ResolvedVariable {
  /** The variable's key. */
  key: string;

  /** The raw value, after defaults and system values were applied. */
  value: VariableValue;

  /** The rendered text (or image source, for an `image` variable). */
  display: string;

  /** The type it was resolved as, for diagnostics. */
  type: VariableType;
}

/** Fill data, keyed by variable key. Extra keys are ignored. */
export type VariableFillData = Record<string, VariableValue>;

/** A node in the caller-supplied `innerVariable` tree. */
export interface InnerVariableNode {
  label: string;
  key: string;
  children?: InnerVariableNode[];
}

/** A fill failure that the dialog can render against the offending field. */
export interface VariableIssue {
  /** The variable's key. */
  key: string;
  /** Human-readable, already localised by the caller's locale. */
  message: string;
  /** `"error"` blocks submission; `"warning"` does not. */
  severity: "error" | "warning";
}
