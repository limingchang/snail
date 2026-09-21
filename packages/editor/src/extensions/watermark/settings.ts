/**
 * 水印设置以及它们产出的 CSS/SVG——全部是纯函数。
 *
 * ## 为什么水印是真实内容而不是背景
 *
 * MDN 明确说明：浏览器在打印时「可能选择省略所有背景图片」，而且「用户代理提供给用户、让他们
 * 控制颜色与图片使用的任何选项，优先级都高于 `print-color-adjust` 的值——换言之，
 * `print-color-adjust` 能起什么作用并没有任何保证」
 * （https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust）。
 * 因此以 CSS `background-image` 实现的水印，只要用户没有勾选 Chrome 的「背景图形」，就会从
 * 打印出来的合同上悄悄消失。本模块产出的每一条声明都挂在一个真实元素上——旋转的文本、一个
 * `<img>`、或一个行内 `<svg>`——因为*内容*无论如何都会打印出来。
 *
 * ## 为什么角度是变换
 *
 * 诱人的捷径是 `repeating-linear-gradient(45deg, …)`，但渐变的角旋转的是*渐变线*，而不是
 * 任何字形——渐变是没有固有尺寸、也完全没有文本的 `<image>` 值（见下方英文段落中的 MDN 链接）。
 * 这里的角度是对水印真正的 `rotate()`（对瓦片则是 SVG 的 `rotate(a cx cy)`），这是唯一能把
 * 字母本身倾斜的办法。
 *
 * Watermark settings and the CSS/SVG they produce — all pure.
 *
 * ## Why the mark is real content and not a background
 *
 * MDN is explicit that a browser "might opt to leave out all background images" when
 * printing and that "any options the user agent offers the user to allow them to control
 * the use of color and images will take priority over the value of `print-color-adjust`
 * — in other words, there isn't any guarantee that `print-color-adjust` will do anything"
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust).
 * A watermark applied as a CSS `background-image` therefore silently disappears from a
 * printed contract whenever the user has not ticked Chrome's "Background graphics". Every
 * declaration this module produces is attached to a real element — rotated text, an
 * `<img>`, or an inline `<svg>` — because *content* prints regardless of that checkbox.
 *
 * ## Why the angle is a transform
 *
 * The tempting shortcut is `repeating-linear-gradient(45deg, …)`, but a gradient's angle
 * rotates the *gradient line*, not any glyphs — gradients are `<image>` values with no
 * intrinsic dimensions and no text at all
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/gradient/repeating-linear-gradient).
 * The angle here is a real `rotate()` on the mark (and an SVG `rotate(a cx cy)` for a
 * tile), which is the only way to tilt the letters themselves.
 */

import type { WatermarkOptions } from "../../typings/editor";
import { WATERMARK_Z_INDEX } from "./typing";
import type { WatermarkSettings } from "./typing";

/** 覆盖层元素的类名。 / The overlay element's class. */
export const WATERMARK_CLASS = "s-editor-watermark";

/** 单个居中水印的类名。 / The single centred mark's class. */
export const WATERMARK_MARK_CLASS = "s-editor-watermark__mark";

/** 一个瓦片的类名，用于平铺水印。 / One tile's class, for a tiled watermark. */
export const WATERMARK_TILE_CLASS = "s-editor-watermark__tile";

/**
 * 默认倾角，单位为度。在 CSS 中负值是逆时针，也就是经典的水印样子。
 *
 * Default tilt, in degrees. Negative is anti-clockwise in CSS, i.e. the classic watermark.
 */
export const WATERMARK_DEFAULT_ANGLE = -30;

/**
 * 默认不透明度。取值很低，因为合同隔着自身的水印也必须可读。
 *
 * Default opacity. Low, because a contract must stay readable through its own watermark.
 */
export const WATERMARK_DEFAULT_OPACITY = 0.12;

/** 默认文字大小。 / Default text size. */
export const WATERMARK_DEFAULT_FONT_SIZE = "48px";

/** 默认文字颜色。 / Default text colour. */
export const WATERMARK_DEFAULT_COLOR = "#000000";

/**
 * `greyscale` 水印绘制所用的灰色。
 *
 * 是一种*浅色纯灰*，而不是 5% 不透明度的黑色：不透明度与混合模式是打印驱动里最不可预测的
 * 东西，而纯灰两者都不需要。（这是工程判断，不是有文档记载的浏览器行为。）
 *
 * The grey a `greyscale` mark is drawn in.
 *
 * A *light solid* grey rather than a black at 5% opacity: opacity and blend modes are the
 * least predictable things in a print driver, and a solid grey needs neither. (This is
 * engineering judgement, not a documented browser behaviour.)
 */
export const WATERMARK_GREY = "#9aa0a6";

/** 平铺水印横向的瓦片数。 / Tiles across the sheet, for a tiled watermark. */
export const WATERMARK_TILE_COLUMNS = 3;

/** 平铺水印纵向的瓦片行数。 / Tile rows down the sheet, for a tiled watermark. */
export const WATERMARK_TILE_ROWS = 6;

/**
 * 图片水印的瓦片 viewBox：一个固定的横向盒子，图片被适配进其中。
 *
 * Tile viewBox for an image watermark: a fixed landscape box the image is fitted into.
 */
export const WATERMARK_IMAGE_TILE_VIEW_BOX = "0 0 100 60";

/**
 * 四舍五入到两位小数，即整个 0.01 用户单位。
 *
 * Round to two decimals, which is a whole 0.01 user unit.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 把一份部分配置解析为完整设置。
 *
 * 每个值都会被校验：`angle` 为 `NaN` 会产出 `rotate(NaNdeg)`，从而悄悄让整条声明失效、水印
 * 不再旋转——正是旧缺陷换了一身装扮。
 *
 * Resolve a partial configuration into complete settings.
 *
 * Every value is validated: an `angle` of `NaN` would produce `rotate(NaNdeg)`, which
 * silently invalidates the whole declaration and leaves the mark un-rotated — the exact
 * legacy failure in a different costume.
 */
export function resolveWatermarkSettings(options: WatermarkOptions | undefined): WatermarkSettings {
  const source: WatermarkOptions = options ?? {};

  const opacity = source.opacity;
  const angle = source.angle;

  return {
    enabled: source.enabled === true,
    text: typeof source.text === "string" ? source.text : "",
    imageSrc: typeof source.imageSrc === "string" ? source.imageSrc : "",
    angle: typeof angle === "number" && Number.isFinite(angle) ? angle : WATERMARK_DEFAULT_ANGLE,
    opacity:
      typeof opacity === "number" && Number.isFinite(opacity)
        ? Math.min(1, Math.max(0, opacity))
        : WATERMARK_DEFAULT_OPACITY,
    greyscale: source.greyscale === true,
    tiled: source.tiled === true,
    fontSize:
      typeof source.fontSize === "string" && source.fontSize.length > 0
        ? source.fontSize
        : WATERMARK_DEFAULT_FONT_SIZE,
    color:
      typeof source.color === "string" && source.color.length > 0
        ? source.color
        : WATERMARK_DEFAULT_COLOR
  };
}

/** 两份设置渲染结果完全一致时返回 `true`。 / `true` when two settings would render identically. */
export function watermarkSettingsEqual(a: WatermarkSettings, b: WatermarkSettings): boolean {
  return (
    a.enabled === b.enabled &&
    a.text === b.text &&
    a.imageSrc === b.imageSrc &&
    a.angle === b.angle &&
    a.opacity === b.opacity &&
    a.greyscale === b.greyscale &&
    a.tiled === b.tiled &&
    a.fontSize === b.fontSize &&
    a.color === b.color
  );
}

/**
 * 有东西可画时返回 `true`。
 *
 * 只看 `enabled` 不够：一个已启用、却既没有文本也没有图片的水印仍然会在每一页上叠加一层不可
 * 见的覆盖层。
 *
 * `true` when there is something to draw.
 *
 * `enabled` alone is not enough: an enabled watermark with neither text nor an image would
 * still add an invisible overlay over every page.
 */
export function isWatermarkVisible(settings: WatermarkSettings): boolean {
  if (!settings.enabled) return false;
  return settings.imageSrc.length > 0 || settings.text.length > 0;
}

/**
 * 覆盖层自身的声明。
 *
 * `inset: 0` 让覆盖层恰好等于页面盒，因此这个元素需要页面容器是一个已定位的祖先
 * （`position: relative`）——那由主题负责，也是本特性唯一一条跨扩展的要求。
 *
 * `pointer-events: none` 让水印不会吞掉编辑用的点击；`overflow: hidden` 在这里是刻意的
 * （与二维码不同），因为比页面还大的水印应当在*页面处*被裁掉，正如它在纸上的样子。
 *
 * The overlay's own declarations.
 *
 * `inset: 0` makes the overlay exactly the page box, so this element needs the page
 * container to be a positioned ancestor (`position: relative`) — the theme owns that, and
 * it is the one cross-extension requirement of this feature.
 *
 * `pointer-events: none` is what keeps a watermark from swallowing an editing click;
 * `overflow: hidden` is deliberate here (unlike the QR code) because a mark larger than
 * the sheet should be clipped *at the sheet*, exactly as it will be on paper.
 */
export function watermarkContainerDeclarations(
  settings: WatermarkSettings
): Record<string, string> {
  const declarations: Record<string, string> = {
    position: "absolute",
    inset: "0",
    "z-index": String(WATERMARK_Z_INDEX),
    "pointer-events": "none",
    "user-select": "none",
    overflow: "hidden",
    // Belt and braces only. It stops a browser desaturating whatever it *does* paint, but
    // it cannot make a background print — which is why nothing here is a background.
    "print-color-adjust": "exact",
    "-webkit-print-color-adjust": "exact"
  };

  if (settings.tiled) {
    declarations.display = "grid";
    declarations["grid-template-columns"] = `repeat(${WATERMARK_TILE_COLUMNS}, 1fr)`;
    declarations["grid-template-rows"] = `repeat(${WATERMARK_TILE_ROWS}, 1fr)`;
  }

  return declarations;
}

/**
 * 单个居中水印的声明。
 *
 * `translate(-50%, -50%) rotate(θ)`：先平移（于是元素居中于页面），而旋转因为
 * `transform-origin: center` 是绕元素自身中心进行的。若先旋转再平移，水印会被甩出页面。
 *
 * The single centred mark's declarations.
 *
 * `translate(-50%, -50%) rotate(θ)`: the translate happens first (so the element is centred
 * on the sheet) and the rotation is about the element's own centre because of
 * `transform-origin: center`. Rotating first and translating second would swing the mark
 * off the page.
 */
export function watermarkMarkDeclarations(settings: WatermarkSettings): Record<string, string> {
  const declarations: Record<string, string> = {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: `translate(-50%, -50%) rotate(${settings.angle}deg)`,
    "transform-origin": "center",
    opacity: String(settings.opacity)
  };

  if (settings.imageSrc.length > 0) {
    declarations["max-width"] = "80%";
    declarations["max-height"] = "80%";
    declarations["object-fit"] = "contain";
    if (settings.greyscale) declarations.filter = "grayscale(1)";
    return declarations;
  }

  declarations.color = settings.greyscale ? WATERMARK_GREY : settings.color;
  declarations["font-size"] = settings.fontSize;
  declarations["font-weight"] = "700";
  declarations["line-height"] = "1";
  declarations["white-space"] = "nowrap";
  return declarations;
}

/**
 * SVG 瓦片所用的、以用户单位表示的字号。
 *
 * `font-size` 是 CSS 长度，而 SVG 属性需要的是瓦片自身坐标系里的数字。只有 `px` 和裸数字会被
 * 采纳，其余一律用默认值：瓦片是*重复*的装饰，具体尺寸远不如文本能装得下重要，而悄悄渲染成
 * `NaN` 会更糟。
 *
 * The font size in user units for an SVG tile.
 *
 * `font-size` is a CSS length, and SVG attributes need a number in the tile's own
 * coordinate system. Only `px` and a bare number are honoured, with the default for
 * anything else: a tile is a *repeating* decoration where the exact size matters far less
 * than the text fitting, and silently rendering at `NaN` would be worse.
 */
export function watermarkFontSizePx(settings: WatermarkSettings): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(settings.fontSize);
  if (!match) return Number.parseFloat(WATERMARK_DEFAULT_FONT_SIZE);
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) && value > 0 ? value : Number.parseFloat(WATERMARK_DEFAULT_FONT_SIZE);
}

/**
 * 估算某个字符串在给定字号下的宽度。
 *
 * 是估算而不是测量：它只决定瓦片的 `viewBox`，而瓦片反正会被缩放到自己的网格单元里，因此几个
 * 百分点的误差改变不了什么。CJK 表意文字是全角（1 em），而拉丁字母在水印所用的无衬线字体里
 * 平均约 0.58 em。
 *
 * Estimate how wide a string is at a given font size.
 *
 * An estimate, not a measurement: it only decides the tile's `viewBox`, and the tile is
 * scaled to its grid cell anyway, so a few percent of error changes nothing. CJK
 * ideographs are full-width (1 em) and Latin letters average roughly 0.58 em in the sans
 * faces a watermark uses.
 */
export function estimateTextWidth(text: string, fontSizePx: number): number {
  const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
  let units = 0;
  // `for…of` walks code points, so an astral character counts once rather than twice.
  for (const character of text) units += CJK.test(character) ? 1 : 0.58;
  return Math.max(fontSizePx, units * fontSizePx);
}

/** 一个瓦片的 `<svg>` 属性。 / One tile's `<svg>` attributes. */
export function watermarkTileSvgAttributes(settings: WatermarkSettings): Record<string, string> {
  if (settings.imageSrc.length > 0) {
    return {
      class: WATERMARK_TILE_CLASS,
      viewBox: WATERMARK_IMAGE_TILE_VIEW_BOX,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false"
    };
  }

  const width = estimateTextWidth(settings.text, watermarkFontSizePx(settings));
  // 0.6 of the text width is enough for the rotated bounding box (which is
  // `0.866 × 0.5` of the text box at 30°) plus a little air, and a shorter box means the
  // text is drawn larger inside its cell.
  const height = width * 0.6;
  return {
    class: WATERMARK_TILE_CLASS,
    viewBox: `0 0 ${round2(width)} ${round2(height)}`,
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
    focusable: "false"
  };
}

/** 平铺文本水印的 `<text>` 子元素。 / The `<text>` child of a tiled text watermark. */
export function watermarkTileTextAttributes(settings: WatermarkSettings): Record<string, string> {
  const fontSize = watermarkFontSizePx(settings);
  const width = estimateTextWidth(settings.text, fontSize);
  const height = width * 0.6;
  const centerX = round2(width / 2);
  const centerY = round2(height / 2);

  return {
    x: String(centerX),
    y: String(centerY),
    "text-anchor": "middle",
    "dominant-baseline": "central",
    // A real glyph rotation about the text's own centre — see the module comment for why
    // a gradient is not an option.
    transform: `rotate(${settings.angle} ${centerX} ${centerY})`,
    "font-size": String(fontSize),
    "font-weight": "700",
    fill: settings.greyscale ? WATERMARK_GREY : settings.color,
    "fill-opacity": String(settings.opacity)
  };
}

/** 平铺图片水印的 `<image>` 子元素。 / The `<image>` child of a tiled image watermark. */
export function watermarkTileImageAttributes(settings: WatermarkSettings): Record<string, string> {
  const attributes: Record<string, string> = {
    href: settings.imageSrc,
    x: "15%",
    y: "15%",
    width: "70%",
    height: "70%",
    preserveAspectRatio: "xMidYMid meet",
    // `rotate(angle cx cy)` about the middle of the fixed 100×60 image tile viewBox.
    transform: `rotate(${settings.angle} 50 30)`
  };
  if (settings.greyscale) attributes.filter = "grayscale(1)";
  return attributes;
}
