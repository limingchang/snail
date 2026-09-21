/**
 * 水印扩展自身的契约。
 *
 * 使用方配置的*设置*是 `typings/editor.ts` 中的 `WatermarkOptions`，因为顶层组件持久化进
 * `TemplateDocument` 的正是同一个形状——声明两份必然走偏。这里该放的是只有扩展自己才知道的
 * 东西：它渲染所用的、已完全解析的设置，它的存储，以及二维码必须低于的那个 `z-index`。
 *
 * The watermark extension's own contract.
 *
 * The *settings* a consumer configures are `WatermarkOptions` in `typings/editor.ts`,
 * because the same shape is what the top-level component persists into the
 * `TemplateDocument` — two declarations of it would drift. What belongs here is what only
 * the extension knows: the fully-resolved settings it renders from, its storage, and the
 * `z-index` that the QR code has to stay below.
 */

import type { WatermarkOptions } from "../../typings/editor";

/**
 * 水印的 `z-index`。
 *
 * 水印是对页面的渲染*指令*，而二维码是页面*上*的内容，因此水印必须绘制在上层。
 * `../qrcode/geometry.ts` 中的 `QR_CODE_Z_INDEX` 是 `1`；测试里会让两者互相断言，因此这个
 * 顺序不会腐烂。
 *
 * The watermark's `z-index`.
 *
 * A watermark is a rendering *instruction over the page*, while a QR code is content *on*
 * it, so the watermark must paint on top. `QR_CODE_Z_INDEX` in
 * `../qrcode/geometry.ts` is `1`; the two are asserted against each other in the tests so
 * the ordering cannot rot.
 */
export const WATERMARK_Z_INDEX = 10;

/**
 * 每个字段都已解析的 {@link WatermarkOptions}。
 *
 * 插件从它渲染，而从不从裸选项渲染，因此默认值只存在于一处，配置了一半的水印也不可能在
 * 行内样式里产出 `undefined`。
 *
 * {@link WatermarkOptions} with every field resolved.
 *
 * The plugin renders from this, never from the raw options, so the defaults exist in one
 * place and a partially-configured watermark cannot produce `undefined` in an inline
 * style.
 */
export interface WatermarkSettings {
  /** `false` 时完全不渲染。 / `false` renders nothing at all. */
  enabled: boolean;
  /** 水印的文本。图片水印时为空。 / The mark's text. Empty for an image watermark. */
  text: string;
  /**
   * 图片水印的 `<img>` 地址。两者都设置时优先于 {@link text}。
   *
   * An `<img>` source for an image watermark. Wins over {@link text} when both are set.
   */
  imageSrc: string;
  /**
   * 角度，直接交给 CSS `rotate()`/SVG `rotate()`。默认 `-30`。
   *
   * Degrees, handed straight to CSS `rotate()`/SVG `rotate()`. Default `-30`.
   */
  angle: number;
  /** `0…1`。默认 `0.12`。 / `0…1`. Default `0.12`. */
  opacity: number;
  /** 以灰色绘制水印。默认 `false`。 / Render the mark in grey. Default `false`. */
  greyscale: boolean;
  /**
   * 在整个页面上重复该水印，而不是只绘制一个居中的水印。
   *
   * Repeat the mark across the sheet instead of drawing one centred mark.
   */
  tiled: boolean;
  /**
   * 文本水印的字号，用 CSS 长度表示。默认 `"48px"`。
   *
   * Font size for a text mark, as a CSS length. Default `"48px"`.
   */
  fontSize: string;
  /** 文本水印的颜色。默认 `"#000000"`。 / Colour for a text mark. Default `"#000000"`. */
  color: string;
}

/**
 * 扩展在运行时保存的内容。
 *
 * 设置放在 `editor.storage.watermark.settings`，因此宿主不必知道装饰是如何构建的就能读取
 * 它们；而*文档*从不携带它们：水印是一条渲染指令，所以它属于模板的页面设置，而不属于内容。
 *
 * What the extension keeps at runtime.
 *
 * The settings live in `editor.storage.watermark.settings` so a host can read them
 * without knowing how the decoration is built, and the *document* never carries them: a
 * watermark is a rendering instruction, so it belongs in the template's page setup rather
 * than in its content.
 */
export interface WatermarkStorage {
  /**
   * 当前设置，与扩展的选项保持同步。
   *
   * The current settings, kept in step with the extension's options.
   */
  settings: WatermarkSettings;
}

/**
 * 调用方可以配置的内容。
 *
 * 与 {@link WatermarkOptions} 完全相同；之所以在这里再命名一次，是为了让扩展自身的签名读
 * 起来与其他扩展一致，也为将来某个只属于扩展的开关留一个去处。
 *
 * What a caller may configure.
 *
 * Identical to {@link WatermarkOptions}; named here so the extension's own signature reads
 * the same as the other extensions' and so a future extension-only knob has a home.
 */
export type WatermarkExtensionOptions = WatermarkOptions;
