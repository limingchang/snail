/**
 * `qrcode` 节点的属性及其 HTML 编码方式。
 *
 * ## 编码方式
 *
 * 编码表见下。四个结构化属性共用一个 `data-*` 属性，这正是每个属性的 `renderHTML` 都返回
 * `{}` 的原因：Tiptap 会把每个属性的贡献合并进同一个对象，四个写入方会互相覆盖。节点自己
 * 的 `renderHTML`（在 `index.ts` 中）从 `node.attrs` 一次性写出这个 blob，而下面每个属性的
 * `parseHTML` 再从它里面读回自己的字段。
 *
 * 这是对旧缺陷 34 的修复：旧节点只声明了 `src`、`size` 与 `position`，完全不渲染 `data-*`，
 * 于是每次保存都会丢掉 `text`。
 *
 * The `qrcode` node's attributes and their HTML encoding.
 *
 * ## The encoding
 *
 * | attribute | HTML | why |
 * | --- | --- | --- |
 * | `text` | `data-qrcode-text` | the payload is a plain string, and a consumer (or a `grep`) should be able to read it without a JSON parse |
 * | `alt` | `alt` | it is already the accessible attribute, so it needs no second spelling |
 * | `src` | `src` | so an exported document still *shows* the code with no JavaScript |
 * | `size`, `position`, `color`, `margin` | `data-qrcode-config`, JSON | they are only ever written and read together, and one blob cannot disagree with itself about which fields exist |
 * | — | `data-type="qrcode"` | the marker `parseHTML` matches on |
 *
 * The four structured attributes share one `data-*` attribute, which is why each of their
 * per-attribute `renderHTML` returns `{}`: Tiptap merges every attribute's contribution
 * into a single object, so four writers would overwrite each other. The node's own
 * `renderHTML` in `index.ts` writes the blob once from `node.attrs`, and each attribute's
 * `parseHTML` below reads its own field back out of it.
 *
 * This is the fix for legacy defect 34: the legacy node declared only `src`, `size` and
 * `position`, rendered no `data-*` at all, and dropped `text` on every save.
 */

import {
  decodeQRCodeConfig,
  encodeQRCodeConfig,
  normalizeAttrs,
  QR_DEFAULT_ALT,
  QR_DEFAULT_COLOR,
  QR_DEFAULT_MARGIN,
  QR_DEFAULT_POSITION,
  QR_DEFAULT_SIZE,
  QR_DEFAULT_TEXT
} from "./geometry";
import type { QRCodeAttrs, QRCodeConfig, QRColor, QRLength, QRPosition } from "./typing";

/** `parseHTML` 用来匹配的标记属性。 / The marker attribute `parseHTML` matches on. */
export const QR_CODE_TYPE_ATTRIBUTE = "data-type";

/**
 * {@link QR_CODE_TYPE_ATTRIBUTE} 必须持有的值。
 *
 * The value {@link QR_CODE_TYPE_ATTRIBUTE} must hold.
 */
export const QR_CODE_TYPE_VALUE = "qrcode";

/**
 * 载荷，作为一个普通属性，因此不做 JSON 解析也能读懂。
 *
 * The payload, as a plain attribute so it is readable without a JSON parse.
 */
export const QR_CODE_TEXT_ATTRIBUTE = "data-qrcode-text";

/** 结构化属性，合并为一个 JSON blob。 / The structured attributes, as one JSON blob. */
export const QR_CODE_CONFIG_ATTRIBUTE = "data-qrcode-config";

/** 无障碍标签。 / The accessible label. */
export const QR_CODE_ALT_ATTRIBUTE = "alt";

/** 生成出来的位图。 / The generated raster. */
export const QR_CODE_SRC_ATTRIBUTE = "src";

/** 从元素上读取 JSON blob。 / Read the JSON blob off an element. */
function readConfig(element: HTMLElement): Partial<QRCodeConfig> {
  return decodeQRCodeConfig(element.getAttribute(QR_CODE_CONFIG_ATTRIBUTE));
}

/** 把未知的属性值收窄为字符串。 / Narrow an unknown attribute value to a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 属性集，由节点自己的 `renderHTML` 写入、由其 `parseHTML` 读取。
 *
 * The attribute set, written by the node's `renderHTML` and read by its `parseHTML`.
 */
export function qrCodeAttributes() {
  return {
    /** 载荷。 / The payload. */
    text: {
      default: QR_DEFAULT_TEXT,
      parseHTML: (element: HTMLElement): string =>
        element.getAttribute(QR_CODE_TEXT_ATTRIBUTE) ?? QR_DEFAULT_TEXT,
      renderHTML: (attributes: Record<string, unknown>) => ({
        [QR_CODE_TEXT_ATTRIBUTE]: asString(attributes.text)
      })
    },

    /** 生成出来的位图。 / The generated raster. */
    src: {
      default: "",
      // Read from `src` rather than a `data-*` twin: a document exported from the editor
      // carries a real `<img src="data:…">`, and a paste of that HTML must keep working.
      parseHTML: (element: HTMLElement): string =>
        element.getAttribute(QR_CODE_SRC_ATTRIBUTE) ?? "",
      renderHTML: (attributes: Record<string, unknown>) => ({
        [QR_CODE_SRC_ATTRIBUTE]: asString(attributes.src)
      })
    },

    /** 无障碍标签。 / The accessible label. */
    alt: {
      default: QR_DEFAULT_ALT,
      // An absent `alt` means "no label was given", so the default applies.
      parseHTML: (element: HTMLElement): string | undefined =>
        element.getAttribute(QR_CODE_ALT_ATTRIBUTE) ?? undefined,
      renderHTML: (attributes: Record<string, unknown>) => ({
        [QR_CODE_ALT_ATTRIBUTE]: asString(attributes.alt)
      })
    },

    /** 渲染尺寸。默认值取自旧扩展。 / Rendered size. The default is the legacy extension's. */
    size: {
      default: { ...QR_DEFAULT_SIZE } satisfies QRLength,
      parseHTML: (element: HTMLElement): QRLength | undefined => readConfig(element).size,
      // Written once, by the node's own `renderHTML`. See the module comment.
      renderHTML: () => ({})
    },

    /** 相对页面内容盒原点的偏移。 / Offset from the page's content-box origin. */
    position: {
      default: { ...QR_DEFAULT_POSITION } satisfies QRPosition,
      parseHTML: (element: HTMLElement): QRPosition | undefined => readConfig(element).position,
      renderHTML: () => ({})
    },

    /** 位图的两种颜色。 / The raster's two colours. */
    color: {
      default: { ...QR_DEFAULT_COLOR } satisfies QRColor,
      parseHTML: (element: HTMLElement): QRColor | undefined => readConfig(element).color,
      renderHTML: () => ({})
    },

    /** 静区，单位为模块。 / The quiet zone, in modules. */
    margin: {
      default: QR_DEFAULT_MARGIN,
      parseHTML: (element: HTMLElement): number | undefined => readConfig(element).margin,
      renderHTML: () => ({})
    }
  };
}

/**
 * 按 ProseMirror 解析器的方式从元素上读取每一个属性。
 *
 * 往返的读取半边，导出是为了让测试不必启动一个真实编辑器就能驱动它：`getAttribute` 是这些
 * 读取器用到的唯一 DOM 方法。逐个属性写出来，而不是遍历 `qrCodeAttributes()`，因为结果是
 * 有类型的 `Partial<QRCodeAttrs>`，而接口没有索引签名可供赋值。
 *
 * Read every attribute off an element, the way ProseMirror's parser will.
 *
 * The reader half of the round-trip, exported so the tests can drive it without a live
 * editor: `getAttribute` is the only DOM method any of the readers use. Written out per
 * attribute rather than looped over `qrCodeAttributes()`, because the result is a typed
 * `Partial<QRCodeAttrs>` and an interface has no index signature to assign through.
 */
export function parseQRCodeAttributes(element: HTMLElement): Partial<QRCodeAttrs> {
  const config = readConfig(element);
  const parsed: Partial<QRCodeAttrs> = {};

  const text = element.getAttribute(QR_CODE_TEXT_ATTRIBUTE);
  if (text !== null) parsed.text = text;

  const src = element.getAttribute(QR_CODE_SRC_ATTRIBUTE);
  if (src !== null) parsed.src = src;

  const alt = element.getAttribute(QR_CODE_ALT_ATTRIBUTE);
  if (alt !== null) parsed.alt = alt;

  if (config.size !== undefined) parsed.size = config.size;
  if (config.position !== undefined) parsed.position = config.position;
  if (config.color !== undefined) parsed.color = config.color;
  if (config.margin !== undefined) parsed.margin = config.margin;

  return parsed;
}

/**
 * 把属性补丁应用到一组基础属性上，并对结果做规范化。
 *
 * 这次合并*就是* `updateQRCode` 的语义，所以它放在这里，以便脱离编辑器被测试。
 *
 * Apply an attribute patch to a base set, normalising the result.
 *
 * This merge *is* `updateQRCode`'s semantics, so it lives here where it can be tested
 * without an editor.
 */
export function mergeQRCodeAttrs(
  base: Partial<QRCodeAttrs>,
  patch: Partial<QRCodeAttrs>
): QRCodeAttrs {
  return normalizeAttrs({ ...base, ...patch });
}

/**
 * 把四个结构化属性写成那一个 JSON blob。
 *
 * Write the four structured attributes as the single JSON blob.
 */
export function renderQRCodeConfig(attrs: QRCodeAttrs): Record<string, string> {
  return { [QR_CODE_CONFIG_ATTRIBUTE]: encodeQRCodeConfig(attrs) };
}
