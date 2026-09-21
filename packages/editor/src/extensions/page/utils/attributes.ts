/**
 * 属性读取器。
 *
 * Tiptap 节点的属性类型为 `Record<string, any>`，可能来自解析后的 HTML、已存储的 JSON，
 * 或写入了意外内容的调用方。这里的每个读取器都接收 `unknown` 并返回可用的值，
 * 因此任何节点视图都不必信任某个属性，页模块自身的类型里也不会泄漏 `any`。
 *
 * 纯函数：不涉及 DOM，也不涉及编辑器。
 *
 * Attribute readers.
 *
 * A Tiptap node's attributes are typed `Record<string, any>` and can arrive from parsed
 * HTML, from stored JSON, or from a consumer that wrote something unexpected. Every
 * reader here takes `unknown` and returns a usable value, so no node view has to trust an
 * attribute — and no `any` leaks into the page module's own types.
 *
 * Pure: no DOM, no editor.
 */

import { PAPER_SIZES } from "../../../typings/paper";
import type { Margins, NamedPaperFormat, Orientation, PaperFormat } from "../../../typings/paper";
import { DEFAULT_ORIENTATION, DEFAULT_PAPER_FORMAT } from "../constant/defaults";
import type { LogoPosition } from "../typing/pageLogo";
import type { TextAlign } from "../typing/headerFooter";

/** 字符串属性；其余类型返回兜底值。 / A string attribute, with a fallback for anything else. */
export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * CSS 长度属性（`"30mm"`、`"auto"`）；空字符串使用兜底值。
 *
 * A CSS length attribute (`"30mm"`, `"auto"`). Empty strings fall back.
 */
export function readCss(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/** 有限数值属性。 / A finite number attribute. */
export function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 布尔属性。 / A boolean attribute. */
export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * 纸张格式，并识别自定义的 `{ name, width, height }` 对象。
 *
 * 未知字符串不会被原样透传：`resolvePaperSize` 反正会回退到 A4，在这里处理可以让回退逻辑
 * 只有一处。（旧版解析器判断的是 `paperFormat.width in defaultPaper`——用一个数字去检查
 * 它是否属于一张名称表——于是自定义格式被静默地变成了 A4。）
 *
 * A paper format, honouring a custom `{ name, width, height }` object.
 *
 * An unknown string is *not* passed through: `resolvePaperSize` would fall back to A4
 * anyway, and doing it here keeps the fallback in one place. (The legacy resolver tested
 * `paperFormat.width in defaultPaper` — a number checked for membership in a table of
 * names — so a custom format silently became A4.)
 */
export function readPaperFormat(value: unknown): PaperFormat {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(PAPER_SIZES, value)) {
    return value as NamedPaperFormat;
  }
  if (value && typeof value === "object") {
    const candidate = value as { name?: unknown; width?: unknown; height?: unknown };
    if (typeof candidate.width === "number" && typeof candidate.height === "number") {
      return {
        name: typeof candidate.name === "string" ? candidate.name : "custom",
        width: candidate.width,
        height: candidate.height
      };
    }
  }
  return DEFAULT_PAPER_FORMAT;
}

/**
 * 页面方向；除 `"landscape"` 外一律为纵向。
 *
 * An orientation; anything that is not `"landscape"` is portrait.
 */
export function readOrientation(value: unknown): Orientation {
  return value === "landscape" ? "landscape" : DEFAULT_ORIENTATION;
}

/**
 * 按作者书写的页边距：CSS 简写字符串，或各边 CSS 长度组成的对象。
 *
 * 返回 `undefined` 表示「使用默认值」，由 `resolveMargins` 应用。
 *
 * Margins as authored: a CSS shorthand string, or a per-side object of CSS lengths.
 *
 * `undefined` means "use the defaults", which `resolveMargins` applies.
 */
export function readMargins(value: unknown): Margins | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.top === "string" &&
      typeof candidate.right === "string" &&
      typeof candidate.bottom === "string" &&
      typeof candidate.left === "string"
    ) {
      return {
        top: candidate.top,
        right: candidate.right,
        bottom: candidate.bottom,
        left: candidate.left
      };
    }
  }
  return undefined;
}

/** 文本对齐方式。 / A text alignment. */
export function readTextAlign(value: unknown, fallback: TextAlign): TextAlign {
  return isTextAlign(value) ? value : fallback;
}

/** {@link TextAlign} 的类型守卫。 / Type guard for {@link TextAlign}. */
export function isTextAlign(value: unknown): value is TextAlign {
  return value === "left" || value === "center" || value === "right" || value === "justify";
}

/** Logo 锚点；未知值一律靠左。 / A logo anchor; anything unknown is anchored left. */
export function readLogoPosition(value: unknown): LogoPosition {
  return value === "right" || value === "center" ? value : "left";
}
