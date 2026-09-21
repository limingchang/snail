/**
 * 位图生成——二维码里唯一依赖 DOM 的部分，被收在一个函数后面。
 *
 * 这里有两件事是刻意的：
 *
 * 1. **导入是惰性的。** `qrcode` 的浏览器构建通过 `<canvas>` 绘制，因此在模块作用域就触碰
 *    它会让整个编辑器在导入时就绑死在 DOM 上——这对 SSR 是致命的，对许多从不插入二维码的
 *    编辑器也是白白的体积。模块在第一次生成时加载并缓存，加载失败时会清掉缓存，因此一次
 *    瞬时失败不会变成永久失败。
 * 2. **不假设库的形态。** `qrcode` 是带 `browser` 字段的 CommonJS 包；取决于打包工具与
 *    interop 设置，`toDataURL` 可能是具名导出，也可能是默认导出上的属性。两种都接受，因为
 *    弄错这一点只会在使用方的构建里表现为运行时失败。
 *
 * Raster generation — the only DOM-dependent part of the QR code, kept behind one
 * function.
 *
 * Two things are deliberate here:
 *
 * 1. **The import is lazy.** `qrcode`'s browser build draws through a `<canvas>`, so
 *    touching it at module scope would make the whole editor DOM-bound at import time —
 *    fatal for SSR and page weight for the many editors that never insert a code. The
 *    module is loaded on the first generation and cached, and the cache is cleared when
 *    the load fails so a transient failure is not permanent.
 * 2. **The library's shape is not assumed.** `qrcode` is CommonJS with a `browser` field;
 *    depending on the bundler and the interop setting, `toDataURL` is either a named
 *    export or a property of the default export. Both are accepted, because getting this
 *    wrong is a runtime failure that only appears in a consumer's build.
 */

import { QR_PRINT_DPI, toRasterPixels } from "./geometry";
import type { QRCodeAttrs, QRCodeGenerationOptions } from "./typing";

/** 本扩展用到的 `qrcode` 选项子集。 / The subset of `qrcode`'s options this extension uses. */
interface ToDataURLOptions {
  /** 位图边长，单位为设备像素。 / Raster edge, in device pixels. */
  width: number;
  /** 静区，单位为模块。 / Quiet zone, in modules. */
  margin: number;
  /** 纠错等级。 / Error-correction level. */
  errorCorrectionLevel: "L" | "M" | "Q" | "H";
  /** 模块色与背景色。 / Module and background colours. */
  color: { dark: string; light: string };
}

/**
 * `qrcode` 的 `toDataURL`，其结果是 `data:image/png;base64,…` 形式的 URL。
 *
 * `qrcode`'s `toDataURL`, which resolves to a `data:image/png;base64,…` URL.
 */
export type ToDataURL = (text: string, options?: ToDataURLOptions) => Promise<string>;

/**
 * 缓存下来的模块 promise。失败时清空；从不持有强引用。
 *
 * The cached module promise. Cleared on failure; never holds a strong reference.
 */
let loader: Promise<ToDataURL> | undefined;

/**
 * 从打包工具产出的任意模块形态中取出 `toDataURL`。
 *
 * Pull `toDataURL` out of whichever module shape the bundler produced.
 */
function resolveToDataURL(module: unknown): ToDataURL {
  const candidate = module as { toDataURL?: unknown; default?: { toDataURL?: unknown } };
  const fn = candidate.toDataURL ?? candidate.default?.toDataURL;
  if (typeof fn !== "function") {
    throw new Error("[snail] the `qrcode` package exposes no `toDataURL`");
  }
  return fn as ToDataURL;
}

/**
 * 加载 `qrcode` 的 `toDataURL`，每个会话一次。
 *
 * Load `qrcode`'s `toDataURL`, once per session.
 *
 * @returns 该函数的 promise。加载被拒绝时会忘掉自己，因此网络抖动（某个惰性拆分的 chunk
 *   拉取失败）之后重试可以成功 /
 *   a promise for the function. A rejected load forgets itself, so a retry after a
 *   network hiccup (a lazily-split chunk that failed to fetch) can succeed.
 */
export function loadToDataURL(): Promise<ToDataURL> {
  loader ??= import("qrcode")
    .then(resolveToDataURL)
    .catch((error: unknown) => {
      loader = undefined;
      throw error;
    });
  return loader;
}

/**
 * 一次生成所需的选项，取自扩展的配置。
 *
 * 与 `QRCodeOptions` 是不同的形状，因为生成不该关心 `HTMLAttributes` 或错误接收端。
 *
 * The options a generation needs, taken from the extension's configuration.
 *
 * A separate shape from `QRCodeOptions` because generation must not care about
 * `HTMLAttributes` or the error sink.
 */
export function generationOptions(options: {
  dpi?: number;
  errorCorrectionLevel?: QRCodeGenerationOptions["errorCorrectionLevel"];
}): QRCodeGenerationOptions {
  return {
    dpi: options.dpi ?? QR_PRINT_DPI,
    errorCorrectionLevel: options.errorCorrectionLevel ?? "M"
  };
}

/**
 * 为某个属性集生成位图。
 *
 * Generate the raster for an attribute set.
 *
 * @param attrs 节点的属性。只有 `text`、`size`、`margin` 与 `color` 有意义 /
 *   the node's attributes. Only `text`, `size`, `margin` and `color` matter.
 * @param options 分辨率与纠错 / resolution and error correction.
 * @returns 存入 `src` 的 `data:` URL / the `data:` URL to store in `src`.
 * @throws 载荷为空（没有东西可编码）或 canvas 不可用（服务端渲染，调用方本就
 *   不该请求）时抛出 /
 *   when the payload is blank (there is nothing to encode) or the canvas is
 *   unavailable (a server-side render, where the caller should not have asked).
 */
export async function generateQRCodeDataURL(
  attrs: QRCodeAttrs,
  options: QRCodeGenerationOptions
): Promise<string> {
  // Trimmed only for the emptiness test: the stored payload and the encoded payload must
  // be the same string, so a payload with meaningful surrounding whitespace survives.
  if (attrs.text.trim().length === 0) {
    throw new Error("[snail] a QR code needs a non-empty payload");
  }

  const toDataURL = await loadToDataURL();

  return toDataURL(attrs.text, {
    width: toRasterPixels(attrs.size, options.dpi),
    margin: attrs.margin,
    errorCorrectionLevel: options.errorCorrectionLevel,
    color: { dark: attrs.color.dark, light: attrs.color.light }
  });
}
