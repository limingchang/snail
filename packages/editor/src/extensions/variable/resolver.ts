/**
 * 纯解析引擎。
 *
 * `resolveVariable`、`resolveDocumentVariables` 与 `validateFill` 回答编辑器关于一个变量的
 * 两个问题——「它画成什么？」与「填写数据可用吗？」——而不需要 DOM、编辑器或框架。正是这一点
 * 让设计对话框与填写对话框保持一致，也正是节点视图在每次重绘时调用的东西。
 *
 * ## 不变式
 *
 * 这里没有解析器，也没有 `setTimeout(...setContent(...))`。文档 JSON 永远是模板；值是被
 * *渲染*出来的。这里的每个函数都是全函数：格式错误的公式、缺失的键或不存在的值，都会产生
 * 一个字符串，并在需要时产生一个 `VariableIssue`——绝不会抛出会中断 ProseMirror 重绘的
 * 异常。
 *
 * The pure resolution engine.
 *
 * `resolveVariable`, `resolveDocumentVariables` and `validateFill` answer the two
 * questions the editor asks about a variable — "what does it paint?" and "is the
 * fill data usable?" — without a DOM, an editor or a framework. That is what makes
 * the design dialog and the fill dialog agree, and it is what the node view calls on
 * every repaint.
 *
 * ## The invariant
 *
 * There is no parser and no `setTimeout(...setContent(...))`. The document JSON is
 * always the template; the value is *rendered*. Every function here is total: a
 * malformed formula, a missing key or an absent value produces a string and, where
 * it matters, a `VariableIssue` — never a throw that would abort a ProseMirror
 * redraw.
 */

import type {
  FormulaVariableData,
  InnerVariableNode,
  MoneyVariableData,
  ResolvedVariable,
  SelectVariableData,
  VariableAttrs,
  VariableFillData,
  VariableIssue,
  VariableValue
} from "../../typings/variable";
import {
  applyDatePattern,
  dateTokens,
  DEFAULT_DATE_FORMAT,
  formatMoney,
  formatNumber,
  renderChineseMoney
} from "./format";
import { evaluateFormula, referencedKeys, toFormulaOperand, toPlainBoolean } from "./formula";
import type { VariableLocale } from "./typing";

/**
 * 一个变量与它的位置，正是 {@link resolveDocumentVariables} 收到的形状。
 *
 * A variable paired with its position, as {@link resolveDocumentVariables} receives it.
 */
export interface PositionedVariable {
  /** 节点位置。 / The node's position. */
  pos: number;
  /** 节点属性。 / The node's attributes. */
  attrs: VariableAttrs;
}

/**
 * 文档而不是用户提供的东西。
 *
 * What the document, rather than the user, supplies.
 */
export interface SystemContext {
  /**
   * 正在解析的页码，从 1 开始。
   *
   * The 1-based number of the page being resolved.
   */
  page: number;

  /** 文档一共有多少页。 / How many pages the document has. */
  total: number;

  /**
   * 「现在」，由外部注入。
   *
   * 注入而不是从时钟读取，是为了让解析是确定性的，也让测试能钉住一个日期；它还意味着在同一次
   * 会话里打印文档和填写文档可以共用同一个时间戳，而不是在渲染过程中互相漂移。
   *
   * "Now", injected.
   *
   * Injected rather than read from the clock so resolution is deterministic and a
   * test can pin a date; it also means printing a document and filling it in the
   * same session can share one timestamp instead of drifting apart mid-render.
   */
  now: Date;

  /**
   * 可选的问题收集处，用于没有返回通道的问题。
   *
   * 即使公式是坏的，{@link resolveVariable} 也必须返回一个 `ResolvedVariable`，所以解释被
   * 推送到这里。节点视图不传它（没有地方展示）；填写对话框传入一个数组，并逐字段渲染它。
   *
   * Optional sink for problems that have no return channel.
   *
   * {@link resolveVariable} must return a `ResolvedVariable` even for a broken
   * formula, so the explanation is pushed here. A node view omits it (nothing would
   * display it); the fill dialog passes an array and renders it per field.
   */
  errors?: VariableIssue[];

  /**
   * 同一文档里的其他变量，按键索引，带它们已解析的值。
   *
   * 单独一次 {@link resolveVariable} 调用看不到文档，但一个公式完全可以基于另一个公式计算
   * （`total = SUM(sub1, sub2)`，其中每个小计本身也是一个公式）。把这些变量传进来，一次
   * 调用就能解析整条链；*环*则是这条链重新进入一个已在解析中的键，它会在这里被检测出来，
   * 而不是让程序挂住。省略这个映射时，公式的操作数只回退到填写数据，对一个不是变量的键来说
   * 这是正确的。
   *
   * Other variables in the same document, keyed by key, with their resolved values.
   *
   * A single {@link resolveVariable} call cannot see the document, but a formula may
   * legitimately compute from another formula (`total = SUM(sub1, sub2)` where each
   * subtotal is itself a formula). Passing the others in lets one call resolve that
   * chain; a *cycle* is the case where the chain re-enters a key already being
   * resolved, and it is detected here rather than by hanging. Omit the map and a
   * formula's operands fall back to the fill data alone, which is correct for a key
   * that is not a variable.
   */
  variables?: ReadonlyMap<string, ResolvedVariable>;
}

/**
 * 内置中文文案，在调用方没有覆盖它们时使用。
 *
 * The built-in Chinese strings, used when the caller did not override them.
 */
export const DEFAULT_VARIABLE_LOCALE: VariableLocale = {
  empty: "(未填写)",
  textOverflow: "已超出长度限制",
  required: "必填项未填写",
  outOfRange: "超出允许的范围",
  selectInvalid: "选项不在允许的范围内",
  imageTooLarge: "图片体积超出限制",
  imageEmpty: "图片地址为空",
  formulaSyntax: "公式语法错误",
  formulaCycle: "公式存在循环引用",
  formulaUnknown: "公式引用了不存在的变量",
  formulaInvalid: "公式计算结果无效"
};

/** 把部分文案表合并到默认值之上。 / Merge a partial locale over the defaults. */
export function createVariableLocale(overrides?: Partial<VariableLocale>): VariableLocale {
  return { ...DEFAULT_VARIABLE_LOCALE, ...overrides };
}

/**
 * 该从 `fill` 读取的值返回 `true`。`""` 与 `0` 是值，`null` 不是。
 *
 * `true` for a value that should be read from `fill`. `""` and `0` are values, `null` is not.
 */
function isPresent(value: VariableValue | undefined): value is VariableValue {
  return value !== undefined && value !== null;
}

/**
 * 填写数据什么都没提供时，变量解析出的值。
 *
 * The value a variable resolves when the fill data supplies nothing.
 */
function fallbackValue(attrs: VariableAttrs): VariableValue {
  if (isPresent(attrs.defaultValue)) return attrs.defaultValue;
  // A type-appropriate empty rather than `undefined`: `number`/`money`/`formula`
  // have a meaningful zero, and a boolean has a meaningful 否. Text has none, so it
  // gets the empty string.
  switch (attrs.data.type) {
    case "number":
    case "money":
    case "formula":
      return 0;
    case "boolean":
      return false;
    default:
      return "";
  }
}

/**
 * 把一个值读成数字。非数字输入读作 0，而不是 `NaN`。
 *
 * Read a value as a number. Non-numeric input reads as 0 rather than `NaN`.
 */
function toNumber(value: VariableValue): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * 把一个值读成 `Date`，或读成原样打印的字面量。
 *
 * 完全不是日期的值——「长期」是完全正常的合同用语——会作为它自己的文本返回，而不是空字符串：
 * 拒绝猜测是对的，但丢弃用户输入的东西就不对了。
 *
 * 参数写成 `VariableValue | Date`，尽管模型里没有 `Date` 成员：把活的表单值交出来的调用方
 * 很容易传入一个 `Date`，而 `system.now` 确实就是 `Date`，所以这种情况是被处理的，而不是用
 * 类型抹掉。
 *
 * Read a value as a `Date`, or as the literal to print unchanged.
 *
 * A value that is not a date at all — 「长期」 is a perfectly normal contract term —
 * is returned as its own text instead of an empty string: refusing to guess is right,
 * but discarding what the user typed is not.
 *
 * The parameter is `VariableValue | Date` although the model has no `Date` member: a
 * caller that hands over a live form value can easily pass one, and
 * `system.now` genuinely is a `Date`, so the case is handled rather than typed away.
 */
function toDateValue(
  value: VariableValue | Date
): { date: Date; literal?: undefined } | { date?: undefined; literal: string } {
  if (value instanceof Date) return { date: value };
  if (typeof value === "number" && Number.isFinite(value)) return { date: new Date(value) };
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return { literal: "" };
    const timestamp = Date.parse(trimmed);
    if (Number.isFinite(timestamp)) return { date: new Date(timestamp) };
    return { literal: value };
  }
  return { literal: "" };
}

/**
 * 按模板渲染日期，允许时解析字面量 `"today"`。
 *
 * Render a date using its pattern, resolving the literal `"today"` when allowed.
 */
function renderDate(
  value: VariableValue | Date,
  format: string | undefined,
  resolveToday: boolean,
  now: Date
): string {
  const resolved = value === "today" && resolveToday ? now : value;
  const result = toDateValue(resolved);
  if (result.date) return applyDatePattern(format ?? DEFAULT_DATE_FORMAT, dateTokens(result.date));
  return result.literal;
}

/**
 * 某个选项的标签。
 *
 * 值按字符串比较，因为存下来的选项要经过 JSON 往返：在 JSON 里 `1` 与 `"1"` 对表单控件来说
 * 无法区分，但必须选中同一个选项。标签是*显示*，存下来的值才是*数据*。
 *
 * The label for one choice.
 *
 * Values are compared as strings because a stored choice round-trips through JSON,
 * where `1` and `"1"` are indistinguishable to a form control but must select the
 * same option. The label is the *display*; the stored value is the *data*.
 */
function findOptionLabel(data: SelectVariableData, value: VariableValue): string | undefined {
  const wanted = String(value);
  return data.options.find((option) => String(option.value) === wanted)?.label;
}

/**
 * 渲染一个 `select`，在设置了 {@link SelectVariableData.multiple} 时把标签连接起来。
 *
 * Render a `select`, joining the labels when {@link SelectVariableData.multiple} is set.
 */
function renderSelect(data: SelectVariableData, value: VariableValue): string {
  const separator = data.joinWith ?? "、";

  // An array arrives when a multiple-select control serialises its selection; the
  // model's `VariableValue` is deliberately scalar, so the array is read defensively.
  const values = Array.isArray(value) ? (value as VariableValue[]) : [value];
  const labels: string[] = [];

  for (const item of values) {
    if (!isPresent(item)) continue;
    const label = findOptionLabel(data, item);
    // An unmatched value still prints: a saved contract must not lose text just
    // because the option list changed after it was filled. `validateFill` reports it.
    labels.push(label ?? String(item));
  }

  return labels.join(separator);
}

/**
 * 渲染 `money`，可选地渲染成中文大写。
 *
 * Render `money`, optionally in Chinese financial uppercase.
 */
function renderMoney(data: MoneyVariableData, value: VariableValue): string {
  const amount = toNumber(value);

  if (data.chineseUppercase === true) {
    // `renderChineseMoney` does its own rounding to 分, through the same locale
    // formatter the digits use, so the two renderings agree on an awkward value like
    // `1.005` (￥1.01 next to 壹元零壹分). Pre-rounding here with `toFixed` would *undo*
    // that: `toFixed` rounds half down on that value and the words would say 壹元整.
    // Only a *narrower* configured precision is applied first, since it changes the
    // amount the words are about.
    const rounded = data.precision === undefined || data.precision >= 2
      ? amount
      : Number(amount.toFixed(Math.max(0, Math.trunc(data.precision))));
    const chinese = renderChineseMoney(rounded);
    return data.currency ? `${data.currency}${chinese}` : chinese;
  }

  return `${data.currency ?? ""}${formatMoney(amount, data)}`;
}

/**
 * 渲染 `text`，在 `maxLength` 处截断并标出截断。
 *
 * Render `text`, cutting at `maxLength` and marking the cut.
 */
function renderText(value: VariableValue, maxLength: number | undefined): string {
  const text = isPresent(value) ? String(value) : "";
  if (maxLength === undefined || maxLength <= 0) return text;
  if (text.length <= maxLength) return text;
  // The ellipsis *replaces* the last character rather than extending the string, so
  // `maxLength` stays a hard bound on what the document paints. `validateFill`
  // raises the warning; appending would silently exceed the author's limit.
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** 把 `boolean` 渲染成它的词。 / Render `boolean` as its words. */
function renderBoolean(
  data: { trueText?: string; falseText?: string },
  value: VariableValue
): string {
  return toPlainBoolean(value) ? data.trueText ?? "是" : data.falseText ?? "否";
}

/**
 * 渲染 `system`，它完全忽略 `fill`。
 *
 * Render `system`, which ignores `fill` entirely.
 */
function renderSystem(systemKey: string, format: string | undefined, system: SystemContext): string {
  switch (systemKey) {
    case "page":
      return String(system.page);
    case "total":
      return String(system.total);
    case "pageLabel":
      return `第 ${system.page} 页`;
    case "pageOfTotal":
      return `第 ${system.page} 页，共 ${system.total} 页`;
    case "date":
      return applyDatePattern(format ?? DEFAULT_DATE_FORMAT, dateTokens(system.now));
    case "time":
      return applyDatePattern(format ?? "HH:mm:ss", dateTokens(system.now));
    default:
      // An unknown key can only come from a document saved by another version. An
      // empty string keeps the sentence readable instead of printing the key name.
      return "";
  }
}

/**
 * 在值已确定的前提下渲染一个变量。
 *
 * Render one variable given an already-decided value.
 */
function renderValue(attrs: VariableAttrs, value: VariableValue, system: SystemContext): string {
  switch (attrs.data.type) {
    case "text":
      return renderText(value, attrs.data.maxLength);
    case "number":
      return formatNumber(toNumber(value), attrs.data.precision, attrs.data.thousands);
    case "money":
      return renderMoney(attrs.data, value);
    case "boolean":
      return renderBoolean(attrs.data, value);
    case "date":
      return renderDate(value, attrs.data.format, attrs.data.resolveToday === true, system.now);
    case "select":
      return renderSelect(attrs.data, value);
    case "image":
      // The "display" of an image is its source; the node view turns it into an
      // `<img>`. Keeping it a string is what lets `resolveVariable` stay pure.
      return isPresent(value) ? String(value) : "";
    case "formula":
      // A formula is evaluated by `DocumentResolver.resolveFormula` before this is
      // reached; the branch exists so the switch stays exhaustive.
      return "";
    case "system":
      return renderSystem(attrs.data.systemKey, attrs.data.format, system);
  }
}

/**
 * 渲染公式的数值结果，带上它的精度、前缀与后缀。
 *
 * Render a formula's numeric result with its precision, prefix and suffix.
 */
function formatFormulaResult(data: FormulaVariableData, value: VariableValue): string {
  const amount = toNumber(value);
  const digits = data.precision === undefined ? undefined : Math.max(0, Math.trunc(data.precision));
  const rounded = digits === undefined ? amount : Number(amount.toFixed(digits));
  // No thousands grouping by default: a formula result is usually a computed figure
  // that already carries its own unit through `prefix`/`suffix`.
  return `${data.prefix ?? ""}${formatNumber(rounded, digits, false)}${data.suffix ?? ""}`;
}

/**
 * 把一次公式失败变成对话框展示的消息。
 *
 * Turn a formula failure into the message a dialog shows.
 */
function describeFormulaError(code: "syntax" | "cycle" | "unknown" | "invalid", detail: string): string {
  switch (code) {
    case "syntax":
      return `${DEFAULT_VARIABLE_LOCALE.formulaSyntax}：${detail}`;
    case "cycle":
      return DEFAULT_VARIABLE_LOCALE.formulaCycle;
    case "unknown":
      return `${DEFAULT_VARIABLE_LOCALE.formulaUnknown}：${detail}`;
    case "invalid":
      return `${DEFAULT_VARIABLE_LOCALE.formulaInvalid}：${detail}`;
  }
}

/**
 * 整份文档的解析，两个公开入口都复用它。
 *
 * 用类而不是闭包，因为备忘表、环栈与操作数映射必须在递归的公式查找之间共享，而把五个参数
 * 一路传过每层递归会掩盖它们是同一份状态这一事实。
 *
 * The resolution of a whole document, reused by both public entry points.
 *
 * A class rather than a closure because the memo, the cycle stack and the operand
 * map have to be shared across the recursive formula lookups, and passing five
 * parameters through every recursion hides that they are one piece of state.
 */
class DocumentResolver {
  private readonly byKey = new Map<string, VariableAttrs>();

  /**
   * 已解析的原始值，这样被另外两个公式共用的公式只求值一次。
   *
   * Resolved raw values, so a formula shared by two others is evaluated once.
   */
  private readonly memo = new Map<string, VariableValue>();

  /**
   * 当前解析路径上的键。重入就是环。
   *
   * Keys on the current resolution path. A re-entry is a cycle.
   */
  private readonly visiting = new Set<string>();

  /**
   * 本轮无法求值的键。与 `visiting` 分开保存，这样一次被放弃的尝试不会被重试。
   *
   * Keys this pass could not evaluate. Kept apart from `visiting` so an abandoned attempt
   * is not retried.
   */
  private readonly failed = new Set<string>();

  /**
   * 已经报告过的环键，这样一份坏模板不会淹没对话框。
   *
   * Cycle keys already reported, so one bad template does not flood the dialog.
   */
  private readonly reported = new Set<string>();

  /**
   * 要读取的填写数据。
   *
   * 声明为字段并在构造函数里赋值，而不是写成构造函数参数属性：它们不是可擦除语法，只做类型
   * 剥离的 TypeScript 加载器（Node 自带的那个）会直接拒绝整个模块。
   *
   * The fill data to read.
   *
   * Declared as fields and assigned in the constructor rather than as constructor
   * parameter properties: those are not erasable syntax, so a strip-only TypeScript
   * loader (Node's own) rejects the module outright.
   */
  private readonly fill: VariableFillData;

  /**
   * 页码与注入的时钟。
   *
   * Page numbers and the injected clock.
   */
  private readonly system: SystemContext;

  constructor(variables: readonly PositionedVariable[], fill: VariableFillData, system: SystemContext) {
    this.fill = fill;
    this.system = system;

    for (const variable of variables) {
      // Last definition of a key wins, matching the fill data's own
      // "later overrides earlier" behaviour. Duplicate keys are legal.
      this.byKey.set(variable.attrs.key, variable.attrs);
    }

    // Seed from `system.variables` so a caller that has already resolved part of the
    // document (the fill dialog resolves as the user types) does not pay twice.
    if (system.variables) {
      for (const [key, resolved] of system.variables) this.memo.set(key, resolved.value);
    }
  }

  /**
   * 按传入顺序解析每一个变量。
   *
   * Resolve every variable, in the order supplied.
   */
  resolveAll(variables: readonly PositionedVariable[]): ResolvedVariable[] {
    return variables.map((variable) => this.resolveOne(variable.attrs));
  }

  /**
   * 解析一个变量，无论它是否属于本实例构建时所依据的那份文档。
   *
   * Resolve one variable, whether or not it is part of the document this instance was built from.
   */
  resolveOne(attrs: VariableAttrs): ResolvedVariable {
    const type = attrs.data.type;

    if (type === "formula") {
      // An unevaluable formula renders as `0`: a contract with a broken formula must
      // still open, and the issue explaining it has already been reported.
      const value = this.resolveFormula(attrs, attrs) ?? 0;
      return { key: attrs.key, value, display: formatFormulaResult(attrs.data, value), type };
    }

    if (type === "system") {
      const value = this.systemValue(attrs);
      return { key: attrs.key, value, display: renderValue(attrs, value, this.system), type };
    }

    const filled = this.fill[attrs.key];
    const value = isPresent(filled) ? filled : fallbackValue(attrs);
    return { key: attrs.key, value, display: renderValue(attrs, value, this.system), type };
  }

  /**
   * `system` 变量所代表的原始值。
   *
   * The raw value a `system` variable stands for.
   */
  private systemValue(attrs: VariableAttrs): VariableValue {
    if (attrs.data.type !== "system") return fallbackValue(attrs);
    switch (attrs.data.systemKey) {
      case "page":
        return this.system.page;
      case "total":
        return this.system.total;
      case "date":
      case "time":
        // The ISO string is the raw material; the pattern is applied by `renderValue`.
        return this.system.now.toISOString();
      default:
        return "";
    }
  }

  /**
   * 对一个公式求值，并顺着它的引用走进其他公式。
   *
   * ## 为什么一个环必须让整条链失败，而不只是闭合它的那一环
   *
   * `a = b + 1`、`b = a + 1` 无解，所以给其中任何一个返回数字都是虚构。早期版本在重入的键上
   * 停下递归并让 `0` 回流上去，结果是往合同里打印了 `b = 1` 与 `a = 2`——两个毫无意义的
   * 数字。现在重入的那个公式被标记为失败，失败向外传播，于是环上的*每一个*公式都解析为
   * `0`，并只报告一条问题。
   *
   * Evaluate a formula, following its references into other formulas.
   *
   * ## Why a cycle must fail the whole chain, not just the link that closed it
   *
   * `a = b + 1`, `b = a + 1` has no solution, so returning a number for either is
   * fiction. An earlier version stopped the recursion at the re-entered key and let
   * `0` flow back up, which produced `b = 1` and `a = 2` — two figures with no meaning
   * printed into a contract. Instead the formula that re-enters is marked failed, and
   * the failure propagates outwards so *every* formula on the cycle resolves to `0`
   * with one reported issue.
   *
   * @param attrs 公式变量 /
   *   - the formula variable.
   * @param rootAttrs 问题归属到的变量，这样嵌套的失败会报告到用户能看见的那个公式上，而不是
   *   报告到某个操作数上 /
   *   - the variable the issue is attributed to, so a nested failure is
   *   reported against the formula the user can see rather than against an operand.
   * @returns 该值；这个公式无法求值时是 `undefined`。调用方在公开 API 的边缘把 `undefined`
   *   变成 `0` /
   *   the value, or `undefined` when this formula could not be evaluated. The
   *   caller turns `undefined` into `0` at the edge of the public API.
   */
  private resolveFormula(attrs: VariableAttrs, rootAttrs: VariableAttrs): VariableValue | undefined {
    if (attrs.data.type !== "formula") return fallbackValue(attrs);
    const key = attrs.key;

    if (this.memo.has(key)) return this.memo.get(key);

    if (this.failed.has(key)) {
      // Already known to be unevaluable in this pass. Re-reporting would flood the
      // dialog; returning `undefined` propagates the failure to whoever asked.
      return undefined;
    }

    if (this.visiting.has(key)) {
      // This key is the one that closed the loop.
      this.failed.add(key);
      this.report(rootAttrs, `${DEFAULT_VARIABLE_LOCALE.formulaCycle}：${key}`);
      return undefined;
    }

    this.visiting.add(key);
    let result: ReturnType<typeof evaluateFormula>;
    try {
      result = evaluateFormula(attrs.data, (referenced) => this.operand(referenced, rootAttrs));
    } finally {
      this.visiting.delete(key);
    }

    if (!result.ok) {
      this.failed.add(key);
      this.report(rootAttrs, describeFormulaError(result.error.code, result.error.message));
      return undefined;
    }

    this.memo.set(key, result.value);
    return result.value;
  }

  /**
   * 公式读取的某个键的数值。
   *
   * 优先级：填写数据 → 另一个变量的公式（递归解析）→ 变量的默认值。填写数据排在最前，因为
   * 那才是用户输入的东西；变量的*默认值*是比计算它的公式更差的答案。
   *
   * `undefined` 表示「没有任何可用的东西提供这个键」，求值器会把它变成一个让整个公式失败的
   * 错误，而不是静默的零。
   *
   * The numeric value of one key read by a formula.
   *
   * Precedence: the fill data → another variable's formula (resolved recursively) →
   * a variable's default. The fill data comes first because it is what the user typed;
   * a variable's *default* is a poorer answer than the formula that computes it.
   *
   * `undefined` means "nothing usable supplies this key", which the evaluator turns
   * into an error that fails the whole formula rather than a silent zero.
   */
  private operand(referenced: string, rootAttrs: VariableAttrs): number | undefined {
    // Already resolved in this pass — either because another formula needed it first, or
    // because the caller seeded it through `system.variables` (`resolveVariable` cannot
    // see the document, so that map is how a lone call learns about its siblings).
    // Checking here, before anything else, is what makes the seed authoritative.
    // `has` rather than a value check: a formula that legitimately computes to 0, or a
    // seeded `null`, must not fall through to the fill data.
    if (this.memo.has(referenced)) return toFormulaOperand(this.memo.get(referenced));

    const target = this.byKey.get(referenced);

    if (target && target.data.type === "formula") {
      // A formula operand is only meaningful if the formula could actually be
      // evaluated; `undefined` here is what carries a cycle outwards.
      const nested = this.resolveFormula(target, rootAttrs);
      return nested === undefined ? undefined : toFormulaOperand(nested);
    }

    const filled = this.fill[referenced];
    if (isPresent(filled)) return toFormulaOperand(filled);

    if (target && isPresent(target.defaultValue)) return toFormulaOperand(target.defaultValue);

    return undefined;
  }

  /**
   * 每个「根键 + 消息」组合只推入一条问题。
   *
   * Push one issue per root key + message pair.
   */
  private report(attrs: VariableAttrs, message: string): void {
    const token = `${attrs.key}:${message}`;
    if (this.reported.has(token)) return;
    this.reported.add(token);
    this.system.errors?.push({ key: attrs.key, message, severity: "error" });
  }
}

/**
 * 解析一个变量。
 *
 * 值的优先级是 `fill[key]` → `attrs.defaultValue` → 类型对应的空值。`system` 变量两者都不看，
 * 而是读 {@link SystemContext}；`formula` 变量则针对其他变量与填写数据对它的表达式求值。
 *
 * Resolve one variable.
 *
 * Value precedence is `fill[key]` → `attrs.defaultValue` → a type-appropriate empty.
 * A `system` variable ignores both and reads {@link SystemContext}; a `formula`
 * variable evaluates its expression against the other variables and the fill data.
 *
 * @param attrs 节点的属性，与存储时完全一致 /
 *   - the node's attributes, exactly as stored.
 * @param fill 按变量键索引的填写数据 /
 *   - fill data keyed by variable key.
 * @param system 页码、「现在」，以及可选的其它变量与错误收集处 /
 *   - page numbers, "now", and optionally the other variables and an
 *   error sink.
 * @returns 解析出的值。从不抛错：坏公式会得到 `0`、空的 `display`，并在提供了
 *   `system.errors` 时得到一条解释它的问题 /
 *   the resolved value. Never throws: a broken formula yields a `0` value, an
 *   empty `display` and — when `system.errors` is supplied — one issue explaining it.
 */
export function resolveVariable(
  attrs: VariableAttrs,
  fill: VariableFillData,
  system: SystemContext
): ResolvedVariable {
  // A one-variable document: `resolveOne` needs no sibling to satisfy the formula
  // path, and `system.variables` still lets a caller hand in the rest.
  const resolver = new DocumentResolver([{ pos: 0, attrs }], fill, system);
  return resolver.resolveOne(attrs);
}

/**
 * 解析文档里的每一个变量，按文档顺序。
 *
 * 这一份列表是一起解析的，而不是逐个解析，因为一个公式可能基于另一个变量的公式来计算
 * （两个小计的 `SUM`）。解析在调用内部按键做备忘，遇到环时会以 `0` 加一条问题停下，而不是
 * 无限递归——损坏的模板仍然能打开。
 *
 * Resolve every variable in a document, in document order.
 *
 * The list is resolved together, not one at a time, because a formula may compute
 * from another variable's formula (`SUM` of two subtotals). Resolution is memoised
 * per key inside the call and a cycle stops with `0` plus one issue instead of
 * recursing forever — a corrupt template still opens.
 *
 * @param variables 每一个 `variable` 节点及其位置，按文档顺序 /
 *   - every `variable` node, with its position, in document order.
 * @param fill 按变量键索引的填写数据 /
 *   - fill data keyed by variable key.
 * @param system 页码与「现在」；传入 `errors` 可以收集公式问题 /
 *   - page numbers and "now"; pass `errors` to collect formula problems.
 * @returns 每个输入对应一个 {@link ResolvedVariable}，**顺序相同**，这样调用方可以把它们
 *   重新对应到位置上 /
 *   one {@link ResolvedVariable} per input, **in the same order**, so a
 *   caller can zip them back onto positions.
 */
export function resolveDocumentVariables(
  variables: PositionedVariable[],
  fill: VariableFillData,
  system: SystemContext
): ResolvedVariable[] {
  return new DocumentResolver(variables, fill, system).resolveAll(variables);
}

/**
 * 报告会阻止填写提交的问题。
 *
 * `severity: "error"` 会阻止提交（必填值缺失、数字超出范围、选项不在候选里、公式无法求值）；
 * `severity: "warning"` 不会（文本超出软性的 `maxLength`）。对话框按 {@link VariableIssue.key}
 * 归组，并逐字段展示。
 *
 * 与各个解析函数一样，它从不抛错：带坏公式的模板产生的是问题而不是异常，因为一个打不开模板的
 * 对话框也没法修好它。
 *
 * Report what would stop a fill from being submitted.
 *
 * `severity: "error"` blocks (a required value is missing, a number is out of range,
 * a selection is not among the options, a formula cannot be evaluated);
 * `severity: "warning"` does not (text past its soft `maxLength`). A dialog groups
 * these by {@link VariableIssue.key} and paints them per field.
 *
 * Like the resolvers, this never throws: a template with a malformed formula
 * produces an issue, not an exception, because a dialog that cannot open a template
 * cannot fix it either.
 *
 * @param variables 每一个 `variable` 节点及其位置 /
 *   - every `variable` node, with its position.
 * @param fill 用户到目前为止输入的值 /
 *   - the values the user has entered so far.
 * @returns 按文档顺序排列的问题，按键与消息去重 /
 *   issues in document order, deduplicated per key and message.
 */
export function validateFill(variables: PositionedVariable[], fill: VariableFillData): VariableIssue[] {
  const issues: VariableIssue[] = [];
  const seen = new Set<string>();
  const byKey = new Map<string, VariableAttrs>();

  const push = (key: string, message: string, severity: VariableIssue["severity"]): void => {
    const dedupe = `${severity}:${key}:${message}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    issues.push({ key, message, severity });
  };

  for (const variable of variables) {
    const attrs = variable.attrs;
    const key = attrs.key;

    // Deduplicate by key: the same variable may appear many times in a contract
    // (`{甲方}` in the body and again in the signature block), and the user should be
    // told once, not once per occurrence.
    if (byKey.has(key)) continue;
    byKey.set(key, attrs);

    const filled = fill[key];
    const hasValue = isPresent(filled);
    const hasDefault = isPresent(attrs.defaultValue);
    const value = hasValue ? filled : attrs.defaultValue;

    // `system` supplies its own value and a `formula` derives one, so neither is
    // "missing". A `boolean` has a meaningful default (否), which is why it is not
    // required either — matching the legacy dialog, which let a boolean be inserted
    // with no default and rendered it as 否.
    const requiresValue =
      attrs.data.type === "text" ||
      attrs.data.type === "number" ||
      attrs.data.type === "money" ||
      attrs.data.type === "date" ||
      attrs.data.type === "select" ||
      attrs.data.type === "image";

    if (requiresValue && !hasValue && !hasDefault) {
      push(key, DEFAULT_VARIABLE_LOCALE.required, "error");
      // Report the absence and stop: every check below would be reporting a
      // consequence of the same missing value.
      continue;
    }

    switch (attrs.data.type) {
      case "text": {
        const raw = isPresent(value) ? String(value) : "";
        const limit = attrs.data.maxLength;
        if (limit !== undefined && limit > 0 && raw.length > limit) {
          // A warning, not an error: `display` truncates, so the document is still
          // renderable — the author just needs to know not all of it will show.
          push(key, DEFAULT_VARIABLE_LOCALE.textOverflow, "warning");
        }
        break;
      }

      case "number": {
        const number = toNumber(value);
        const { min, max } = attrs.data;
        if (min !== undefined && number < min) {
          push(key, `${DEFAULT_VARIABLE_LOCALE.outOfRange}（≥ ${min}）`, "error");
        }
        if (max !== undefined && number > max) {
          push(key, `${DEFAULT_VARIABLE_LOCALE.outOfRange}（≤ ${max}）`, "error");
        }
        break;
      }

      case "money": {
        // Money has no author-declared bounds, so the only failure is a value that is
        // not a number at all. It is checked on the raw value rather than on the
        // converted one, since `toNumber` reports an unparseable string as 0.
        const raw: unknown = value;
        if (typeof raw === "string" && raw.trim() !== "" && !Number.isFinite(Number(raw))) {
          push(key, DEFAULT_VARIABLE_LOCALE.outOfRange, "error");
        }
        break;
      }

      case "boolean":
        break;

      case "date": {
        // A non-date literal is allowed on purpose (「长期」): only a value that is
        // absent is a problem, and the required check above already covers it.
        break;
      }

      case "select": {
        const data = attrs.data;
        // An empty list makes the fill dialog fall back to free text, so nothing can
        // be "not in the options".
        if (data.options.length === 0) break;
        const values = Array.isArray(value) ? (value as VariableValue[]) : [value];
        for (const item of values) {
          if (!isPresent(item)) continue;
          if (findOptionLabel(data, item) === undefined) {
            push(key, DEFAULT_VARIABLE_LOCALE.selectInvalid, "error");
            break;
          }
        }
        break;
      }

      case "image": {
        const source = isPresent(value) ? String(value) : "";
        if (source === "") {
          push(key, DEFAULT_VARIABLE_LOCALE.imageEmpty, "error");
          break;
        }
        const maxBytes = (attrs.data.maxSizeMb ?? 2) * 1024 * 1024;
        if (estimateDataUrlBytes(source) > maxBytes) {
          push(key, DEFAULT_VARIABLE_LOCALE.imageTooLarge, "error");
        }
        break;
      }

      case "formula": {
        // A formula has no single value to check before the other fields are filled,
        // so what is checked is structural: the expression parses, every name it
        // reads exists, and the reference graph is acyclic. All three are answerable
        // from the template alone, which is what lets the dialog warn before the
        // user has typed anything.
        for (const issue of validateFormula(attrs, byKey, fill)) {
          push(key, issue.message, issue.severity);
        }
        break;
      }

      case "system":
        break;
    }
  }

  return issues;
}

/**
 * data URL 载荷的字节长度，无需解码它。
 *
 * `data:` URL 是 base64 或百分号编码的文本，所以它的载荷最多是长度的四分之三。这已经足够
 * 精确，可以在解码之前就拒绝一张 40 MB 的照片；而且这也是在没有 DOM 的情况下唯一可用的度量
 * （`atob` 是浏览器全局变量，而本模块刻意不依赖任何浏览器环境）。
 *
 * The byte length of a data URL's payload, without decoding it.
 *
 * A `data:` URL is base64 or percent-encoded text, so its payload is at most three
 * quarters of its length. That is exact enough to reject a 40 MB photo before it is
 * decoded, and it is the only measurement available without a DOM (`atob` is a
 * browser global, and this module deliberately has none).
 */
function estimateDataUrlBytes(source: string): number {
  if (!source.startsWith("data:")) return 0;
  const comma = source.indexOf(",");
  if (comma < 0) return 0;
  const payload = source.length - comma - 1;
  return source.includes(";base64,") ? Math.floor((payload * 3) / 4) : payload;
}

/**
 * 一个公式所有可能无法求值的方式，而不真正求值它。
 *
 * 在引用图上做深度优先遍历：`done` 标记已完成的键，`onStack` 标记正在探索的路径——这正是
 * 「已经验证过」与「我们此刻正在它里面」的区别，而环恰恰就是后者。
 *
 * Every way a formula can fail to evaluate, without evaluating it.
 *
 * Depth-first over the reference graph: `done` marks finished keys, `onStack` marks
 * the path being explored — the difference between "already verified" and "we are
 * inside it right now", which is exactly what a cycle is.
 */
function validateFormula(
  attrs: VariableAttrs,
  byKey: ReadonlyMap<string, VariableAttrs>,
  fill: VariableFillData
): VariableIssue[] {
  if (attrs.data.type !== "formula") return [];
  const found: VariableIssue[] = [];

  const parse = evaluateFormula(attrs.data, () => 0);
  if (!parse.ok && parse.error.code === "syntax") {
    // Report the parse failure against the formula's own key: `evaluateFormula`
    // cannot know what it is called.
    found.push({
      key: attrs.key,
      message: describeFormulaError(parse.error.code, parse.error.message),
      severity: "error"
    });
    return found;
  }

  const done = new Set<string>();
  const onStack = new Set<string>();

  const visit = (key: string): void => {
    if (done.has(key)) return;
    if (onStack.has(key)) {
      found.push({ key: attrs.key, message: `${DEFAULT_VARIABLE_LOCALE.formulaCycle}：${key}`, severity: "error" });
      return;
    }

    const current = byKey.get(key);
    if (!current || current.data.type !== "formula") return;

    onStack.add(key);
    for (const referenced of referencedKeys(current.data.expression)) {
      const target = byKey.get(referenced);
      if (!target) {
        // Not a variable in this document: acceptable when the fill data will supply
        // it (the legacy `innerVariable` case), a problem when it will not.
        if (!isPresent(fill[referenced])) {
          found.push({
            key: attrs.key,
            message: `${DEFAULT_VARIABLE_LOCALE.formulaUnknown}：${referenced}`,
            severity: "error"
          });
        }
        continue;
      }
      visit(referenced);
    }
    onStack.delete(key);
    done.add(key);
  };

  visit(attrs.key);
  return found;
}

/**
 * 每个公式的依赖键，这样模板编辑器可以在填写之前给出警告。
 *
 * The dependency keys of every formula, so a template editor can warn before filling.
 */
export function formulaDependencies(variables: readonly PositionedVariable[]): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  for (const variable of variables) {
    if (variable.attrs.data.type !== "formula") continue;
    dependencies.set(variable.attrs.key, referencedKeys(variable.attrs.data.expression));
  }
  return dependencies;
}

/**
 * 把 `innerVariable` 树摊平成 `key → node`，供按路径查找的对话框使用。
 *
 * Flatten an `innerVariable` tree into `key → node`, for a dialog that looks a path up.
 */
export function flattenInnerVariables(nodes: readonly InnerVariableNode[]): Map<string, InnerVariableNode> {
  const flat = new Map<string, InnerVariableNode>();
  const walk = (list: readonly InnerVariableNode[]): void => {
    for (const node of list) {
      flat.set(node.key, node);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return flat;
}
