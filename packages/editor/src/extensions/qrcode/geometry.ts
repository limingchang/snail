/**
 * 二维码的几何、单位与属性序列化——全部是纯函数。
 *
 * 本文件不触碰 DOM 也不触碰 Tiptap：每个函数都是「值 → 值」的变换，正因如此，扩展里真正
 * 有意思的那一半（毫米尺寸如何变成位图宽度、结构化属性如何经受一次 HTML 往返）才能在没有
 * canvas 的情况下被验证。
 *
 * ## 为什么位图不是固定尺寸
 *
 * 旧缺陷 34：生成的图片不论请求尺寸是多少都固定 200 px 宽，于是二维码一放大就变模糊——
 * 在 300 dpi 下 40 mm 的码需要约 472 px，却是从 200 px 的源印出来的。{@link toRasterPixels}
 * 改为由请求的长度和印刷分辨率推导宽度，并设下限让极小的码仍可扫描、设上限让极大的码无法
 * 产出几兆字节的 data URL。
 *
 * The QR code's geometry, units and attribute serialisation — all pure.
 *
 * Nothing in this file touches the DOM or Tiptap: every function is a value → value
 * transform, which is what lets the interesting half of the extension (how a millimetre
 * size becomes a raster width, how a structured attribute survives an HTML round-trip)
 * be verified without a canvas.
 *
 * ## Why a raster is not a fixed size
 *
 * Legacy defect 34: the generated image was always 200 px wide whatever the requested
 * size, so enlarging a code degraded it — at 300 dpi a 40 mm code needs ~472 px and was
 * being printed from a 200 px source. {@link toRasterPixels} derives the width from the
 * requested length and the print resolution instead, with a floor so a tiny code is still
 * scannable and a ceiling so a huge one cannot produce a multi-megabyte data URL.
 */

import type {
  QRCodeAttrs,
  QRCodeConfig,
  QRColor,
  QRLength,
  QRPosition,
  QRUnit
} from "./typing";
import { QR_UNITS } from "./typing";

/**
 * 生成位图时采用的分辨率，单位为每英寸点数。
 *
 * 300 dpi 是商业印刷对线条稿要求的下限，而对二维码来说源像素*就是*线条稿：太少，手机
 * 摄像头看到的模块边界就是模糊的。该值是 `px` 长度下的每英寸 CSS 像素数，也是 `mm`/`cm`
 * 下的每英寸点数，因为 CSS 像素被定义为恰好 1/96 英寸。
 *
 * Resolution a raster is generated at, in dots per inch.
 *
 * 300 dpi is the floor commercial printers ask for on line art, and for a QR code the
 * source pixels *are* the line art: too few and a phone camera sees a blurry module
 * boundary. The value is in CSS pixels per inch for a `px` length and dots per inch for
 * `mm`/`cm`, because a CSS pixel is defined as exactly 1/96 in.
 */
export const QR_PRINT_DPI = 300;

/**
 * 位图的最小边长，单位为设备像素。低于此值 v10 的码就不再可辨认。
 *
 * Smallest raster edge, in device pixels. Below this a v10 code stops resolving.
 */
export const QR_MIN_RASTER_PIXELS = 128;

/**
 * 位图的最大边长，单位为设备像素。300 dpi 的 A4 宽度约 2480 px。
 *
 * Largest raster edge, in device pixels. A 300 dpi A4-width code is ~2480 px.
 */
export const QR_MAX_RASTER_PIXELS = 2048;

/**
 * 二维码的 `z-index`。
 *
 * 水印是对页面的*渲染指令*，而二维码是页面*上*的内容，所以水印必须绘制在上层，绝不能
 * 被恰好压在它下面的二维码遮住。保持在 `../watermark/typing.ts` 中 `WATERMARK_Z_INDEX`
 * 之下。
 *
 * The QR code's `z-index`.
 *
 * The watermark is a *rendering instruction over the page* and a QR code is content on
 * it, so the watermark must paint on top and never be hidden by a code that happens to
 * sit under it. Keep this below `WATERMARK_Z_INDEX` in `../watermark/typing.ts`.
 */
export const QR_CODE_Z_INDEX = 1;

/**
 * 每英寸的 CSS 像素数：按定义，一个 CSS 像素即 1/96 英寸。
 *
 * CSS pixels per inch. A CSS pixel is 1/96 in by definition.
 */
const CSS_PIXELS_PER_INCH = 96;

/** 每英寸的毫米数。 / Millimetres per inch. */
const MM_PER_INCH = 25.4;

/** 默认渲染尺寸，与旧扩展一致。 / Default rendered size, unchanged from the legacy extension. */
export const QR_DEFAULT_SIZE: QRLength = { value: 30, unit: "mm" };

/** 相对页面内容盒原点的默认偏移。 / Default offset from the page's content-box origin. */
export const QR_DEFAULT_POSITION: QRPosition = { x: 10, y: 10, unit: "mm" };

/** 白底黑码。 / Black on white. */
export const QR_DEFAULT_COLOR: QRColor = { dark: "#000000", light: "#ffffff" };

/**
 * 默认静区，单位为模块。见 {@link QRCodeConfig.margin}。
 *
 * Default quiet zone, in modules. See {@link QRCodeConfig.margin}.
 */
export const QR_DEFAULT_MARGIN = 4;

/**
 * 默认的无障碍标签。和产品其余部分一样，默认值是中文。
 *
 * Default accessible label. A Chinese default, like the rest of the product.
 */
export const QR_DEFAULT_ALT = "二维码";

/**
 * 默认载荷。为空：调用方必须说明这个码指向*什么*。
 *
 * The default payload. Empty: a caller must say *what* the code points at.
 */
export const QR_DEFAULT_TEXT = "";

/** `"mm" | "px" | "cm"` 返回 `true`。 / `true` for `"mm" | "px" | "cm"`. */
export function isQRUnit(value: unknown): value is QRUnit {
  return typeof value === "string" && (QR_UNITS as readonly string[]).includes(value);
}

/**
 * 有限数值返回 `true`。用于在 `NaN` 到达 JSON 属性之前把它拦下。
 *
 * `true` for a finite number. Used to reject `NaN` before it reaches a JSON attribute.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 非 null 且不是数组的对象返回 `true`。 / `true` for a non-null object that is not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 强制转换为长度。
 *
 * 负值会被钳到 `0` 而不是被拒绝，因为对位于 `x: 10` 的码调用 `moveQRCode(-100, 0)` 是
 * 合法地要求「尽量靠左」，把它重置为默认的 `10` 看上去就像移动被忽略了。非有限值或未知
 * 单位则回退到默认值，因为 `"30furlong"` 没有合理的解释。
 *
 * Coerce to a length.
 *
 * A negative value is clamped to `0` rather than rejected, because `moveQRCode(-100, 0)`
 * against a code at `x: 10` legitimately asks for "as far left as possible" and resetting
 * it to the default `10` would look like the move was ignored. A non-finite value or an
 * unknown unit falls back, because there is no sensible reading of `"30furlong"`.
 */
export function normalizeLength(input: unknown, fallback: QRLength = QR_DEFAULT_SIZE): QRLength {
  if (!isRecord(input)) return { ...fallback };
  const { value, unit } = input;
  if (!isFiniteNumber(value) || !isQRUnit(unit)) return { ...fallback };
  return { value: Math.max(0, value), unit };
}

/**
 * 强制转换为位置，两个轴都按 `0` 钳制，原因见 {@link normalizeLength}。
 *
 * Coerce to a position, clamping both axes at `0` for the reason in {@link normalizeLength}.
 */
export function normalizePosition(
  input: unknown,
  fallback: QRPosition = QR_DEFAULT_POSITION
): QRPosition {
  if (!isRecord(input)) return { ...fallback };
  const { x, y, unit } = input;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isQRUnit(unit)) return { ...fallback };
  return { x: Math.max(0, x), y: Math.max(0, y), unit };
}

/**
 * 强制转换为颜色对。空字符串不算颜色，因此回退到默认值。
 *
 * Coerce to a colour pair. An empty string is not a colour, so it falls back.
 */
export function normalizeColor(input: unknown, fallback: QRColor = QR_DEFAULT_COLOR): QRColor {
  if (!isRecord(input)) return { ...fallback };
  const { dark, light } = input;
  if (typeof dark !== "string" || dark.length === 0) return { ...fallback };
  if (typeof light !== "string" || light.length === 0) return { ...fallback };
  return { dark, light };
}

/**
 * 强制转换为以模块计的静区：整数，且永不为负。
 *
 * Coerce to a quiet zone in modules: an integer, never negative.
 */
export function normalizeMargin(input: unknown, fallback: number = QR_DEFAULT_MARGIN): number {
  if (!isFiniteNumber(input)) return fallback;
  return Math.max(0, Math.round(input));
}

/** 一次强制转换所有结构化属性。 / Coerce every structured attribute at once. */
export function normalizeConfig(input: Partial<QRCodeConfig> | undefined): QRCodeConfig {
  const source: Partial<QRCodeConfig> = input ?? {};
  return {
    size: normalizeLength(source.size),
    position: normalizePosition(source.position),
    color: normalizeColor(source.color),
    margin: normalizeMargin(source.margin)
  };
}

/**
 * 强制转换整个属性集。
 *
 * 用于进入节点的一切——命令参数、解析出的元素、`update()` 载荷——因此节点视图不必自我
 * 防御，畸形属性也永远到不了渲染器。
 *
 * Coerce a whole attribute set.
 *
 * Used on everything that enters the node — a command argument, a parsed element, an
 * `update()` payload — so the node view never has to defend itself and a malformed
 * attribute can never reach the renderer.
 */
export function normalizeAttrs(input: Partial<QRCodeAttrs> | undefined): QRCodeAttrs {
  const source: Partial<QRCodeAttrs> = input ?? {};
  const config = normalizeConfig(source);
  return {
    ...config,
    text: typeof source.text === "string" ? source.text : QR_DEFAULT_TEXT,
    src: typeof source.src === "string" ? source.src : "",
    alt: typeof source.alt === "string" && source.alt.length > 0 ? source.alt : QR_DEFAULT_ALT
  };
}

/**
 * 两个属性集渲染结果完全一致时返回 `true`。
 *
 * 命令用它来回答「有没有变化？」而不派发事务——因而不为空操作增加一步撤销记录。
 *
 * `true` when two attribute sets would render identically.
 *
 * The commands use this to answer "did anything change?" without dispatching a
 * transaction — and therefore without adding an undo step — for a no-op.
 */
export function sameQRCodeAttrs(a: QRCodeAttrs, b: QRCodeAttrs): boolean {
  return (
    a.text === b.text &&
    a.src === b.src &&
    a.alt === b.alt &&
    a.margin === b.margin &&
    a.color.dark === b.color.dark &&
    a.color.light === b.color.light &&
    sameLength(a.size, b.size) &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.position.unit === b.position.unit
  );
}

/**
 * {@link sameQRCodeAttrs} 的长度部分；因为命令只需要这一半，所以单独导出。
 *
 * {@link sameQRCodeAttrs}'s length half, exported because the command needs only this.
 */
export function sameLength(a: QRLength, b: QRLength): boolean {
  return a.value === b.value && a.unit === b.unit;
}

/**
 * 按 CSS 想要的形式写出长度，例如 `{ value: 30, unit: "mm" }` → `"30mm"`。
 *
 * Write a length the way CSS wants it, e.g. `{ value: 30, unit: "mm" }` → `"30mm"`.
 */
export function lengthToCss(length: QRLength): string {
  return `${length.value}${length.unit}`;
}

/**
 * 以 CSS 像素表示的长度。
 *
 * `mm`/`cm` 使用 CSS 对英寸的定义（96 px），这*不是*印刷分辨率：这里是屏幕上的尺寸，
 * 而 {@link toRasterPixels} 才是纸上的尺寸。
 *
 * A length in CSS pixels.
 *
 * `mm`/`cm` use the CSS definition of the inch (96 px), which is *not* the print
 * resolution: this is the on-screen size, and {@link toRasterPixels} is the paper size.
 */
export function toCssPixels(length: QRLength): number {
  switch (length.unit) {
    case "px":
      return length.value;
    case "mm":
      return (length.value / MM_PER_INCH) * CSS_PIXELS_PER_INCH;
    case "cm":
      return ((length.value * 10) / MM_PER_INCH) * CSS_PIXELS_PER_INCH;
    default:
      return length.value;
  }
}

/**
 * 为某个渲染尺寸生成位图时应采用的宽度。
 *
 * 上下限在取整之后应用，因此结果总是落在 `[QR_MIN_RASTER_PIXELS, QR_MAX_RASTER_PIXELS]`
 * 内且总是整数——`qrcode` 会欣然接受 `354.33` 然后自己取整，那样测试就失去意义了。
 *
 * The raster width to generate for a rendered size.
 *
 * The floor and ceiling are applied after rounding, so the result is always inside
 * `[QR_MIN_RASTER_PIXELS, QR_MAX_RASTER_PIXELS]` and always an integer — `qrcode` would
 * happily accept `354.33` and then round it itself, which makes the tests meaningless.
 */
export function toRasterPixels(size: QRLength, dpi: number = QR_PRINT_DPI): number {
  const inches = toCssPixels(size) / CSS_PIXELS_PER_INCH;
  const requested = inches * (isFiniteNumber(dpi) && dpi > 0 ? dpi : QR_PRINT_DPI);
  return Math.min(QR_MAX_RASTER_PIXELS, Math.max(QR_MIN_RASTER_PIXELS, Math.round(requested)));
}

/**
 * 节点渲染所依据的行内样式，以声明表的形式给出。
 *
 * 一个函数同时服务扩展的两半——`renderHTML` 把它拼进 `style` 属性，节点视图把同一批声明
 * 写到活动元素上——所以导出的 HTML 与编辑器不可能走偏。旧工具栏直接写 DOM 造成的正是这种
 * 走偏：文档说一个尺寸，屏幕显示另一个（缺陷 32）。
 *
 * The inline styles the node renders from, as a declaration map.
 *
 * One function serves both halves of the extension — `renderHTML` joins it into a `style`
 * attribute and the node view writes the same declarations onto the live element — so the
 * exported HTML and the editor cannot drift apart. That drift is exactly what the legacy
 * toolbar's direct DOM write caused: the document said one size and the screen showed
 * another (defect 32).
 */
export function qrCodeStyle(attrs: QRCodeAttrs): Record<string, string> {
  return {
    position: "absolute",
    left: lengthToCss({ value: attrs.position.x, unit: attrs.position.unit }),
    top: lengthToCss({ value: attrs.position.y, unit: attrs.position.unit }),
    width: lengthToCss(attrs.size),
    height: lengthToCss(attrs.size),
    "z-index": String(QR_CODE_Z_INDEX),
    // A QR code is positioned *inside* the page, and the page clips its own overflow. The
    // node must not add a second clipping box of its own: the legacy combination of
    // `position: absolute` and a clipping ancestor is what hid the code entirely.
    overflow: "visible",
    display: "block"
  };
}

/** 把声明表拼成一个 `style` 属性值。 / Join a declaration map into a `style` attribute value. */
export function styleString(declarations: Record<string, string>): string {
  return Object.entries(declarations)
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

/**
 * 把结构化属性编码成一个 JSON blob。
 *
 * 完整的编码见 `attributes.ts` 中的表格。用一个 blob 而不是四个 HTML 属性，是因为
 * `size`、`position` 与 `color` 永远只会一起写入、一起读取，而单个读取方不可能在「存在
 * 哪些字段」上自相矛盾。
 *
 * Encode the structured attributes as one JSON blob.
 *
 * See the table in `attributes.ts` for the whole encoding. One blob rather than four HTML
 * attributes because `size`, `position` and `color` are only ever written and read
 * together, and a single reader cannot disagree with itself about which fields exist.
 */
export function encodeQRCodeConfig(config: QRCodeConfig): string {
  return JSON.stringify({
    size: config.size,
    position: config.position,
    color: config.color,
    margin: config.margin
  });
}

/**
 * 防御性地解码 {@link encodeQRCodeConfig} 的输出。
 *
 * 每个字段都单独校验，无效字段干脆*不出现在*结果里，从而让调用方对该字段的默认值生效。
 * 手工编辑过的模板、或由未来版本写出的模板，都必须能被打开：不能因为一个属性畸形就打开
 * 不了一份合同。
 *
 * Decode {@link encodeQRCodeConfig}'s output, defensively.
 *
 * Every field is validated on its own and an invalid field is simply *absent* from the
 * result, so the caller's default for that field applies. A template edited by hand, or
 * written by a future version, must be openable: opening a contract may not fail because
 * one attribute is malformed.
 */
export function decodeQRCodeConfig(raw: string | null | undefined): Partial<QRCodeConfig> {
  if (raw === null || raw === undefined || raw === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!isRecord(parsed)) return {};

  const config: Partial<QRCodeConfig> = {};

  const size = parsed.size;
  if (isRecord(size) && isFiniteNumber(size.value) && isQRUnit(size.unit)) {
    config.size = { value: Math.max(0, size.value), unit: size.unit };
  }

  const position = parsed.position;
  if (isRecord(position) && isFiniteNumber(position.x) && isFiniteNumber(position.y) && isQRUnit(position.unit)) {
    config.position = {
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      unit: position.unit
    };
  }

  const color = parsed.color;
  if (
    isRecord(color) &&
    typeof color.dark === "string" &&
    color.dark.length > 0 &&
    typeof color.light === "string" &&
    color.light.length > 0
  ) {
    config.color = { dark: color.dark, light: color.light };
  }

  if (isFiniteNumber(parsed.margin)) config.margin = Math.max(0, Math.round(parsed.margin));

  return config;
}

/**
 * 会改变位图的那些命令参数。
 *
 * `updateQRCode` 用它来在同步写属性与异步重新生成再写之间做选择：只有载荷、渲染尺寸和
 * 两种颜色（以及属于位图一部分的静区）会影响像素。移动二维码绝不能付出一次 canvas 的
 * 代价。
 *
 * The command arguments that would change the raster.
 *
 * `updateQRCode` uses this to decide between a synchronous attribute write and an
 * asynchronous regenerate-and-write: only the payload, the rendered size and the two
 * colours (and the quiet zone, which is part of the bitmap) affect the pixels. Moving a
 * code must never cost a canvas.
 */
export function rasterInputsChanged(before: QRCodeAttrs, after: QRCodeAttrs): boolean {
  return (
    before.text !== after.text ||
    !sameLength(before.size, after.size) ||
    before.color.dark !== after.color.dark ||
    before.color.light !== after.color.light ||
    before.margin !== after.margin
  );
}
