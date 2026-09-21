/**
 * 变量模型。
 *
 * 变量是文档中的一个行内节点，代表稍后才提供的值——它把合同**模板**变成
 * **已填写的合同**。
 *
 * ## 为什么类型与配置是一件事
 *
 * 旧包既把 `type` 存为节点属性，又把类型专属配置存在另一个 `data` 属性里。没有
 * 任何机制让两者保持一致，于是一个 `boolean` 变量可以带着 `list` 的 `data`；而
 * `data` 从未被渲染或解析（`renderHTML` 返回 `{}`），因此它从来熬不过一次保存。
 * 审计发现九种旧类型里有五种正是这样坏掉的。
 *
 * 这里 {@link VariableData} 是一个**可辨识联合**，类型本身就是判别式：不存在第二个
 * 地方能让类型与载荷互相矛盾，`switch (variable.data.type)` 也能免费收窄配置。
 *
 * ## 类型集合
 *
 * `text` 是通用情形；`number` 是纯数字输入，可选格式化；`money` 是带币种、精度与
 * 可选中文大写的数字；`boolean` 写出 `trueText`/`falseText`（旧解析器存了它们却
 * 从没用过）；`date` 是日期加打印格式，包含相对的「今天」；`select` 是封闭选项
 * 列表——合同场景中需求最多的一种；`image` 是图片或手写签名；`formula` 是由其他
 * 变量算出的值，例如合计；`system` 是文档自己提供的值：页码、总页数、当前日期。
 *
 * 刻意**缺席**的：旧的 `object`（没有子字段编辑器，会渲染出 `[object Object]`）、
 * `list`（它把数组用逗号拼成字符串，也没有重复语义）与 `checkbox`（把单个布尔包装
 * 成多选）。旧的 `innerVariable` 也不是类型——从树里挑一个键是一种**输入方式**，
 * 因此它以 {@link VariableAttrs.keySource} 的形式留存下来。
 *
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

/** {@link SelectVariableData} 中的一个选项。 / A choice in a {@link SelectVariableData}. */
export interface VariableOption {
  /** 用户看到的内容。 / What the user sees. */
  label: string;

  /** 文档接收到的值。 / What the document receives. */
  value: string | number | boolean;

  /** 选择器中的可选第二行。 / Optional second line in the picker. */
  description?: string;
}

/**
 * 变量可以持有的值。刻意收窄：没有 `any`。
 *
 * A value a variable can hold. Kept narrow on purpose: no `any`.
 */
export type VariableValue = string | number | boolean | null | undefined;

/** 自由文本。 / Free text. */
export interface TextVariableData {
  type: "text";

  /**
   * 只在填写对话框中显示的提示；永远不会写入文档。
   *
   * Hint shown in the fill dialog only; never written into the document.
   */
  placeholder?: string;

  /** 软上限，由填写对话框的计数器显示。 / Soft maximum, surfaced by the fill dialog's counter. */
  maxLength?: number;
}

/** 一个数字，可选按显示格式化。 / A number, optionally formatted for display. */
export interface NumberVariableData {
  type: "number";

  /**
   * 渲染时保留的小数位。`undefined` 表示按原值渲染。
   *
   * Decimal places to render. `undefined` renders the value as supplied.
   */
  precision?: number;

  /** 用区域设置的分隔符对千位分组。 / Group thousands with the locale separator. */
  thousands?: boolean;

  /** 填写对话框强制执行的闭区间下界。 / Inclusive bounds enforced by the fill dialog. */
  min?: number;
  /** 填写对话框强制执行的闭区间上界。 / Inclusive bounds enforced by the fill dialog. */
  max?: number;
}

/** 表示金额的数字。 / A number that is money. */
export interface MoneyVariableData {
  type: "money";

  /** 小数位，默认 `2`。 / Decimal places, default `2`. */
  precision?: number;

  /** 渲染值前面的符号，例如 `"￥"`。 / Symbol prefixed to the rendered value, e.g. `"￥"`. */
  currency?: string;

  /** 千位分组，默认 `true`。 / Group thousands, default `true`. */
  thousands?: boolean;

  /**
   * 同时用中文财务大写渲染该值（壹佰贰拾叁元肆角伍分）。
   *
   * 这是一种额外的渲染，而不是另一种类型：它是**同一个**数字，而合同往往既需要阿拉伯
   * 数字也需要大写汉字。
   *
   * Also render the value in Chinese financial uppercase (壹佰贰拾叁元肆角伍分).
   *
   * A separate rendering rather than a separate type: it is the *same* number, and
   * a contract often needs both the digits and the uppercase words.
   */
  chineseUppercase?: boolean;
}

/** 以文字渲染的是/否值。 / A yes/no value rendered as words. */
export interface BooleanVariableData {
  type: "boolean";

  /** 值为 `true` 时渲染。默认 `"是"`。 / Rendered when the value is `true`. Default `"是"`. */
  trueText?: string;

  /** 值为 `false` 时渲染。默认 `"否"`。 / Rendered when the value is `false`. Default `"否"`. */
  falseText?: string;
}

/** 日期，以及打印它时使用的格式。 / A date, with the format used when it is printed. */
export interface DateVariableData {
  type: "date";

  /**
   * 输出模式。`YYYY` `MM` `DD` `HH` `mm` `ss` 会被替换，其他内容都是字面文本。
   * 默认为 `"YYYY年MM月DD日"`。
   *
   * Output pattern. `YYYY` `MM` `DD` `HH` `mm` `ss` are substituted; anything else
   * is literal text. Default `"YYYY年MM月DD日"`.
   */
  format?: string;

  /**
   * 填写时把字面值 `"today"` 当作当前日期。
   *
   * 旧的 `date` 类型在**设计时**就捕获了当前年份并把它存成普通字符串，所以 2024 年
   * 编写的模板会永远打印 2024。
   *
   * Treat the literal value `"today"` as the current date when filling.
   *
   * The legacy `date` type captured the current year **at design time** and stored
   * it as a plain string, so a template authored in 2024 printed 2024 forever.
   */
  resolveToday?: boolean;
}

/** 封闭的选项列表。 / A closed choice list. */
export interface SelectVariableData {
  type: "select";

  /**
   * 选项。空列表会让填写对话框回退到自由文本。
   *
   * The choices. An empty list makes the fill dialog fall back to free text.
   */
  options: VariableOption[];

  /**
   * 允许多个值；渲染后的值用 `joinWith` 连接。
   *
   * Allow several values; the rendered value is joined with `joinWith`.
   */
  multiple?: boolean;

  /** {@link multiple} 的分隔符。默认 `"、"`。 / Separator for {@link multiple}. Default `"、"`. */
  joinWith?: string;
}

/** 一张图片：上传的文件或手绘的签名。 / A picture: an uploaded file or a drawn signature. */
export interface ImageVariableData {
  type: "image";

  /**
   * `"upload"`（默认）打开文件选择器；`"signature"` 打开签名板。
   *
   * `"upload"` (default) opens a file picker; `"signature"` opens the signature pad.
   */
  source?: "upload" | "signature";

  /**
   * 上传输入框的 `accept` 属性。默认 `"image/*"`。
   *
   * `accept` attribute for the upload input. Default `"image/*"`.
   */
  accept?: string;

  /** 拒绝比这更大的文件。默认 `2`。 / Refuse files larger than this. Default `2`. */
  maxSizeMb?: number;

  /**
   * 渲染宽度，例如 `"40mm"`。高度按宽高比推算。
   *
   * Rendered width, e.g. `"40mm"`. The height follows the aspect ratio.
   */
  width?: string;
}

/** 由其他变量计算出的值。 / A value computed from other variables. */
export interface FormulaVariableData {
  type: "formula";

  /**
   * 基于其他变量键的表达式——算术运算，外加 {@link FORMULA_FUNCTIONS} 中的函数
   * （`SUM`、`AVG`、`MIN`、`MAX`、`ROUND`、`IF`）。
   *
   * Expression over other variables' keys — arithmetic plus the functions in
   * {@link FORMULA_FUNCTIONS} (`SUM`, `AVG`, `MIN`, `MAX`, `ROUND`, `IF`).
   *
   * ```text
   * SUM(item1.price, item2.price) * 1.06
   * ```
   */
  expression: string;

  /** 施加到结果上的小数位。 / Decimal places applied to the result. */
  precision?: number;

  /** 前缀/后缀，例如 `"￥"`。 / Prefix/suffix, e.g. `"￥"`. */
  prefix?: string;
  /** 渲染值后面的后缀。 / The suffix rendered after the value. */
  suffix?: string;
}

/** 文档自己提供哪种值。 / Which value the document supplies on its own. */
export type SystemVariableKey =
  /** 当前页的 1 起始页码。 / The current page's 1-based number. */
  | "page"
  /** 文档共有多少页。 / How many pages the document has. */
  | "total"
  /** `"第 X 页"` 形式的标签。 / `"第 X 页"`. */
  | "pageLabel"
  /** `"第 X 页，共 Y 页"` 形式的标签。 / `"第 X 页，共 Y 页"`. */
  | "pageOfTotal"
  /** 文档被填写或打印的日期。 / The date the document was filled or printed. */
  | "date"
  /** 文档被填写或打印的时间。 / The time the document was filled or printed. */
  | "time";

/** 由文档而非用户提供的值。 / A value the document supplies rather than the user. */
export interface SystemVariableData {
  type: "system";

  /** 渲染哪个值。 / Which value to render. */
  systemKey: SystemVariableKey;

  /**
   * `date`/`time` 的输出模式；见 {@link DateVariableData.format}。
   *
   * Output pattern for `date`/`time`; see {@link DateVariableData.format}.
   */
  format?: string;
}

/**
 * 变量可能的一切形态。
 *
 * `type` 字段是判别式，所以只看 `variable.type` 就能知道存在哪些配置字段。
 *
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

/**
 * 所有变量类型，按选择器列出它们的顺序。
 *
 * Every variable type, in the order the picker lists them.
 */
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

/** {@link VARIABLE_TYPES} 中的一个。 / One of {@link VARIABLE_TYPES}. */
export type VariableType = (typeof VARIABLE_TYPES)[number];

/**
 * 变量的属性，即存储在 `variable` 节点上的内容。
 *
 * A variable's attributes, as stored on the `variable` node.
 */
export interface VariableAttrs {
  /** 显示在文档中，也显示在变量列表里。 / Shown in the document and in the variable list. */
  label: string;

  /**
   * 查找填写数据所用的键——嵌套数据使用点分路径（`company.name`）。
   *
   * The key the fill data is looked up by — a dotted path for nested data
   * (`company.name`).
   */
  key: string;

  /**
   * 可选备注，显示在变量列表中，也作为填写字段的帮助文本。
   *
   * Optional note shown in the variable list and as the fill field's help text.
   */
  desc?: string;

  /** 填写数据没有提供值时使用的值。 / Value used when the fill data does not supply one. */
  defaultValue?: VariableValue;

  /**
   * 类型及其配置。以 `type` 作为判别式。
   *
   * The type and its configuration. Discriminated on `type`.
   */
  data: VariableData;

  /**
   * {@link key} 是如何选定的。
   *
   * `"manual"`（默认）表示用户自己输入了路径。`"inner"` 表示它来自调用方的
   * `innerVariable` 树，也就是旧包称为 `innerVariable` **类型**的东西。它属于输入
   * 方式而非值形状，因此不该放进 {@link VariableData}。
   *
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
 * {@link FormulaVariableData.expression} 可以调用的函数。
 *
 * 这是一张固定的表，而不是 `eval` 或 `new Function`：表达式来自存储的模板数据，把它
 * 当 JavaScript 求值就等于「打开模板 = 运行模板」。解析器只接受数字、`+ - * / ( )`、
 * 逗号、变量键以及这些名字。
 *
 * The functions a {@link FormulaVariableData.expression} may call.
 *
 * A fixed table rather than `eval` or `new Function`: the expression comes from
 * stored template data, so evaluating it as JavaScript would make opening a template
 * equivalent to running it. The parser accepts only numbers, `+ - * / ( )`, commas,
 * variable keys and these names.
 */
export const FORMULA_FUNCTIONS = ["SUM", "AVG", "MIN", "MAX", "ROUND", "IF", "ABS"] as const;

/** {@link FORMULA_FUNCTIONS} 中的一个。 / One of {@link FORMULA_FUNCTIONS}. */
export type FormulaFunction = (typeof FORMULA_FUNCTIONS)[number];

/**
 * 解析之后变量的值。
 *
 * `display` 是文档绘制出来的内容；`value` 是原始素材，保留它，使用者就能把填写数据
 * 与文档一起保存，而不必重新解析渲染出的文本。
 *
 * A variable's value after resolution.
 *
 * `display` is what the document paints; `value` is the raw material, kept so a
 * consumer can save the filled data alongside the document without re-parsing the
 * rendered text.
 */
export interface ResolvedVariable {
  /** 变量的键。 / The variable's key. */
  key: string;

  /**
   * 应用默认值与系统值之后的原始值。
   *
   * The raw value, after defaults and system values were applied.
   */
  value: VariableValue;

  /**
   * 渲染出的文本（`image` 变量则为图片地址）。
   *
   * The rendered text (or image source, for an `image` variable).
   */
  display: string;

  /** 解析出的类型，用于诊断。 / The type it was resolved as, for diagnostics. */
  type: VariableType;
}

/**
 * 填写数据，以变量键为键。多余的键会被忽略。
 *
 * Fill data, keyed by variable key. Extra keys are ignored.
 */
export type VariableFillData = Record<string, VariableValue>;

/**
 * 调用方提供的 `innerVariable` 树中的一个节点。
 *
 * A node in the caller-supplied `innerVariable` tree.
 */
export interface InnerVariableNode {
  /** 显示名。 / The label shown. */
  label: string;
  /** 填写数据中使用的键。 / The key used in the fill data. */
  key: string;
  /** 子节点。 / The child nodes. */
  children?: InnerVariableNode[];
}

/**
 * 一种填写失败，对话框可以把它渲染在出错的字段上。
 *
 * A fill failure that the dialog can render against the offending field.
 */
export interface VariableIssue {
  /** 变量的键。 / The variable's key. */
  key: string;
  /**
   * 人类可读，且已由调用方的区域设置本地化。
   *
   * Human-readable, already localised by the caller's locale.
   */
  message: string;
  /**
   * `"error"` 会阻止提交；`"warning"` 不会。
   *
   * `"error"` blocks submission; `"warning"` does not.
   */
  severity: "error" | "warning";
}
