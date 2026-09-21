/**
 * 段落样式值及其单位 —— 全部是纯函数。
 *
 * ## 这里修掉的 bug
 *
 * 旧的测量代码对一个计算样式做 `parseFloat(value)`（`measuror.ts:232`）：`"2em"` 变成 `2`，
 * `"12pt"` 变成 `12`，然后两者都被当作像素。2 em 的首行缩进被量成 2 px，于是分页引擎为带缩进的
 * 段落算出的每一个高度都是错的。这里绝不会从一个带单位的字符串里产出裸数字：长度被解析成
 * `{ value, unit }`，而像素换算必须被告知它相对于哪个字体。
 *
 * ## 为什么不复用 `src/editor/cssLength.ts`
 *
 * 那个模块是*工具栏面板*的助手，位于组件层。扩展必须能在从不挂载工具栏的使用方里工作
 * （各扩展是单独选择启用的），所以段落模型拥有自己的读取实现。两者只在 `px`/`pt` 换算上重叠；
 * 这里有意思的情形（`em`/`rem` 需要字号，以及不等于 `"0"` 的 `null`）是段落特有的。
 *
 * Paragraph style values and their units — all pure.
 *
 * ## The bug this closes
 *
 * The legacy measurer did `parseFloat(value)` on a computed style
 * (`measuror.ts:232`): `"2em"` became `2`, `"12pt"` became `12`, and both were then treated
 * as pixels. A first-line indent of 2 em was measured as 2 px, so every height the pagination
 * engine computed for an indented paragraph was wrong. Nothing here ever produces a bare
 * number from a string with a unit: a length is parsed into `{ value, unit }`, and a pixel
 * conversion has to be told which font it is relative to.
 *
 * ## Why not reuse `src/editor/cssLength.ts`
 *
 * That module is the *toolbar panels'* helper and lives in the component layer. An extension
 * has to work in a host that never mounts a toolbar (the extensions are individually
 * opt-in), so the paragraph model owns its own reader. The two overlap only on
 * `px`/`pt` conversion; the interesting cases here (`em`/`rem` needing a font size, and a
 * `null` that is not `"0"`) are paragraph-specific.
 */

import type {
  ParagraphStyleAttrs,
  ParagraphStyleValue,
  ParsedParagraphLength,
  PixelsContext
} from "./typing";

/**
 * 一个 CSS 点等于 1/72 英寸，而 CSS 把一英寸定义为正好 96 px。
 *
 * A CSS point is 1/72 in and CSS defines the inch as exactly 96 px.
 */
const PIXELS_PER_POINT = 96 / 72;

/**
 * 在什么都不知道时 `em`/`rem` 相对于什么。与每个浏览器的默认值一致。
 *
 * What `em`/`rem` are relative to when nothing is known. Matches every browser's default.
 */
const DEFAULT_FONT_SIZE = 16;

/**
 * 解析一个 CSS 长度。
 *
 * 裸数字按 `px` 读取，这是 CSS 的做法，也是 `src/editor/cssLength.ts` 为面板所做的。任何无法
 * 识别的内容都返回 `undefined` 而不是 `NaN`：渲染出 `NaNmm` 的工具栏比保留模型自身取值的
 * 工具栏更糟，而样式属性里的 `NaN` 会静默地让整条声明失效。
 *
 * Parse a CSS length.
 *
 * A bare number is read as `px`, which is what CSS does, and what
 * `src/editor/cssLength.ts` does for the panels. Anything unrecognised returns `undefined`
 * rather than `NaN`: a toolbar that renders `NaNmm` is worse than one that keeps the model's
 * own value, and `NaN` in a style attribute silently invalidates the whole declaration.
 */
export function parseParagraphLength(
  input: string | null | undefined
): ParsedParagraphLength | undefined {
  if (typeof input !== "string") return undefined;

  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|pt|em|rem|%)?\s*$/i.exec(input);
  if (!match) return undefined;

  const raw = match[1];
  const unit = match[2];
  if (raw === undefined) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;

  return { value, unit: (unit === undefined ? "px" : unit.toLowerCase()) as ParsedParagraphLength["unit"] };
}

/**
 * 把长度写回去，例如 `{ value: 2, unit: "em" }` → `"2em"`。
 *
 * Write a length back out, e.g. `{ value: 2, unit: "em" }` → `"2em"`.
 */
export function formatParagraphLength(length: ParsedParagraphLength): string {
  const value = Number.isFinite(length.value) ? length.value : 0;
  return `${value}${length.unit}`;
}

/**
 * 把长度换算成像素。
 *
 * `em`/`%` 使用元素自身的字号，`rem` 使用根元素的字号，两者都默认为 16 px，因为浏览器在没有
 * 设置字体时就是这么做的。手头有元素的调用方应当传入它真实的 `fontSize` —— 这就是旧代码完全
 * 跳过的那次换算。
 *
 * Convert a length to pixels.
 *
 * `em`/`%` use the element's own font size and `rem` the root's, both defaulting to 16 px
 * because that is what a browser does when no font is set. A caller that has the element in
 * hand should pass its real `fontSize` — this is the conversion the legacy code skipped
 * entirely.
 */
export function toPixels(length: ParsedParagraphLength, context: PixelsContext = {}): number {
  const fontSize = context.fontSize ?? DEFAULT_FONT_SIZE;
  const rootFontSize = context.rootFontSize ?? DEFAULT_FONT_SIZE;

  switch (length.unit) {
    case "px":
      return length.value;
    case "pt":
      return length.value * PIXELS_PER_POINT;
    case "em":
      return length.value * fontSize;
    case "rem":
      return length.value * rootFontSize;
    case "%":
      return (length.value / 100) * fontSize;
    default:
      return length.value;
  }
}

/**
 * 把计算样式的值读成像素。
 *
 * 供刚调用过 `getComputedStyle(element).textIndent` 且需要一个数字的工具栏面板使用：单位会被
 * 尊重，字体上下文由调用方提供。任何无法解析的内容（`"auto"`、`"normal"`、`calc()`）返回
 * `undefined`，这样面板可以回退到模型，而不是写入 `NaNpx`。
 *
 * Read a computed style value into pixels.
 *
 * For a toolbar panel that has just called `getComputedStyle(element).textIndent` and needs a
 * number: the unit is honoured, and the caller supplies the font context. Returns `undefined`
 * for anything unparseable (`"auto"`, `"normal"`, a `calc()`), so the panel can fall back to
 * the model instead of writing `NaNpx`.
 */
export function readComputedLengthPixels(
  computed: string | null | undefined,
  context: PixelsContext = {}
): number | undefined {
  const parsed = parseParagraphLength(computed);
  return parsed === undefined ? undefined : toPixels(parsed, context);
}

/**
 * 规范化一个样式值。
 *
 * - `null` 保持为 `null`（那个*移除*样式的值）；
 * - 空字符串或只有空白的字符串变成 `null`，因为清空输入框的 UI 意思是「没有缩进」，而不是
 *   「缩进一个空值」；
 * - 任何既不是字符串也不是 `null` 的东西变成 `undefined`，即「根本不是一个值」，命令把它当作
 *   「不要动这个属性」。
 *
 * Normalise one style value.
 *
 * - `null` stays `null` (the value that *removes* a style);
 * - an empty or whitespace-only string becomes `null`, because a UI that cleared its input
 *   means "no indent", not "an indent of nothing";
 * - anything that is not a string or `null` is `undefined`, i.e. "not a value at all", which
 *   the command treats as "leave this attribute alone".
 */
export function normalizeParagraphStyleValue(value: unknown): ParagraphStyleValue | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * 值表示「没有样式」时为 `true` —— 即 `null` 或空字符串。
 *
 * `true` when a value means "no style" — either `null` or the empty string.
 */
export function isEmptyParagraphStyleValue(value: unknown): boolean {
  return normalizeParagraphStyleValue(value) === null;
}
/**
 * `patch` 中真正会改变 `current` 的那个子集。
 *
 * 什么都不会改变时为 `undefined`。「什么都没变就返回 `false`」的全部含义就在这里 —— 旧命令会
 * 记录一条消息并返回 `false`，使用方既看不到也无法据以行动（还让该命令在链式调用里毫无用处）。
 *
 * The subset of `patch` that would actually change `current`.
 *
 * `undefined` when nothing would change. That is the whole of "return `false` when nothing
 * changed" — the legacy command logged a message and returned `false`, which a host could
 * neither see nor act on (and which made the command useless in a chain).
 */
export function changedParagraphStyleAttrs(
  current: ParagraphStyleAttrs,
  patch: ParagraphStyleAttrs
): ParagraphStyleAttrs | undefined {
  const changed: ParagraphStyleAttrs = {};
  let any = false;

  const names = ["textIndent", "paragraphStart", "paragraphEnd"] as const;
  for (const name of names) {
    if (!(name in patch)) continue;

    const next = normalizeParagraphStyleValue(patch[name]);
    if (next === undefined) continue;

    const existing = normalizeParagraphStyleValue(current[name]) ?? null;
    if (existing === next) continue;

    changed[name] = next;
    any = true;
  }

  return any ? changed : undefined;
}

/**
 * 一组属性渲染出的 CSS 声明。
 *
 * 只写出已设置的值。旧实现里 `textIndent` 的默认值 `"0"` 意味着这个映射从不为空，于是文档里的
 * 每个段落都携带 `text-indent: 0;` —— HTML 里的噪音、每次保存都产生 diff，以及给工具栏一个
 * 「用户设置过它」的假信号。
 *
 * The CSS declarations an attribute set renders to.
 *
 * Only set values are written. The legacy `textIndent` default of `"0"` meant this map was
 * never empty, so every paragraph in every document carried `text-indent: 0;` — noise in the
 * HTML, a diff on every save, and a false "the user set this" signal for the toolbar.
 */
export function paragraphStyleDeclarations(attrs: ParagraphStyleAttrs): Record<string, string> {
  const declarations: Record<string, string> = {};

  const textIndent = normalizeParagraphStyleValue(attrs.textIndent);
  if (textIndent !== null && textIndent !== undefined) declarations["text-indent"] = textIndent;

  const paragraphStart = normalizeParagraphStyleValue(attrs.paragraphStart);
  if (paragraphStart !== null && paragraphStart !== undefined) {
    declarations["margin-block-start"] = paragraphStart;
  }

  const paragraphEnd = normalizeParagraphStyleValue(attrs.paragraphEnd);
  if (paragraphEnd !== null && paragraphEnd !== undefined) {
    declarations["margin-block-end"] = paragraphEnd;
  }

  return declarations;
}

/**
 * 一组属性对应的 `style` 属性值，没有内容时为 `undefined`。
 *
 * The `style` attribute value for an attribute set, or `undefined` when there is nothing.
 */
export function paragraphStyleString(attrs: ParagraphStyleAttrs): string | undefined {
  const entries = Object.entries(paragraphStyleDeclarations(attrs));
  if (entries.length === 0) return undefined;
  return `${entries.map(([property, value]) => `${property}: ${value}`).join("; ")};`;
}
