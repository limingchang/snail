/**
 * `qrcode` 节点自身的契约。
 *
 * 旧扩展只声明了三个属性（`src`、`size`、`position`），把载荷完全排除在 schema 之外，
 * 于是保存的模板会丢掉文本，位图也只能靠直接写 DOM 来改（缺陷 32 与 34）。节点渲染所
 * 依据的一切都在这里声明，且每个字段都能经 HTML 往返——见 `attributes.ts` 中的编码表。
 *
 * The `qrcode` node's own contract.
 *
 * The legacy extension declared three attributes (`src`, `size`, `position`) and left the
 * payload out of the schema entirely, so a saved template lost the text and the raster
 * could only be changed by writing to the DOM (defects 32 and 34). Everything the node
 * renders from is declared here, and every field round-trips through HTML — see the
 * encoding table in `attributes.ts`.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";

/**
 * 二维码的尺寸与位置可用的长度单位。
 *
 * The length units a QR code's size and position may be written in.
 */
export const QR_UNITS = ["mm", "px", "cm"] as const;

/** {@link QR_UNITS} 中的一种。 / One of {@link QR_UNITS}. */
export type QRUnit = (typeof QR_UNITS)[number];

/** 带单位的长度。 / A length with a unit. */
export interface QRLength {
  /** 数值部分。有限且永不为负。 / The numeric part. Finite and never negative. */
  value: number;
  /** 单位。 / The unit. */
  unit: QRUnit;
}

/**
 * 二维码的左上角，相对页面内容盒原点测量。
 *
 * The QR code's top-left corner, measured from the page's content-box origin.
 */
export interface QRPosition {
  /** 距内容盒原点的横向偏移。 / Horizontal offset from the content-box origin. */
  x: number;
  /** 距内容盒原点的纵向偏移。 / Vertical offset from the content-box origin. */
  y: number;
  /** `x` 与 `y` 共用的单位。 / The unit both `x` and `y` are given in. */
  unit: QRUnit;
}

/** `qrcode` 渲染所用的两种颜色。 / The two colours `qrcode` renders with. */
export interface QRColor {
  /** 模块颜色。 / The module colour. */
  dark: string;
  /** 背景色，同时也是静区的颜色。 / The background colour, which also becomes the quiet zone. */
  light: string;
}

/** 二维码除载荷之外携带的一切。 / Everything besides the payload that a QR code carries. */
export interface QRCodeConfig {
  /**
   * 渲染尺寸。默认 `{ value: 30, unit: "mm" }`，与旧扩展一致。
   *
   * Rendered size. Default `{ value: 30, unit: "mm" }` — the legacy default.
   */
  size: QRLength;

  /**
   * 相对页面内容盒原点的偏移。默认 `{ x: 10, y: 10, unit: "mm" }`。
   *
   * Offset from the page's content-box origin. Default `{ x: 10, y: 10, unit: "mm" }`.
   */
  position: QRPosition;

  /** 位图的墨色与纸色。 / The raster's ink and paper colours. */
  color: QRColor;

  /**
   * 静区，单位为 QR **模块**——即 `qrcode` 自己使用的单位，而不是 CSS 长度。
   *
   * 默认 `4`，是 ISO/IEC 18004 要求的宽度，因此也是需要从纸上扫描的二维码最稳妥的取值。
   * `qrcode` 自身的默认值同样是 `4`。
   *
   * The quiet zone, in QR **modules** — the unit `qrcode` itself uses, not a CSS length.
   *
   * Default `4`, the width ISO/IEC 18004 asks for and therefore the safest value for a
   * code that has to be scanned off paper. `qrcode`'s own default is also `4`.
   */
  margin: number;
}

/**
 * 节点的完整属性集：载荷加上 {@link QRCodeConfig}。
 *
 * The node's complete attribute set: the payload plus {@link QRCodeConfig}.
 */
export interface QRCodeAttrs extends QRCodeConfig {
  /**
   * 被编码的载荷。旧 schema 每次保存都会丢掉它（缺陷 34）。
   *
   * The encoded payload. The legacy schema dropped this on every save (defect 34).
   */
  text: string;

  /**
   * 生成出来的 `data:` URL。位图生成之前为空。
   *
   * The generated `data:` URL. Empty until a raster has been generated.
   */
  src: string;

  /**
   * 无障碍标签，渲染为 `<img>` 的 `alt`。
   *
   * 二维码对屏幕阅读器、以及任何无法扫描它的人都不可读，因此这个标签是指向内容的唯一描述。
   *
   * Accessible label, rendered as the `<img>`'s `alt`.
   *
   * A QR code is unreadable to a screen reader and to anyone who cannot scan it, so the
   * label is the only description of what it points at.
   */
  alt: string;
}

/**
 * 调用方可以传给命令的内容。
 *
 * 每个字段都是可选的：`updateQRCode({ position: … })` 不必重复写出载荷，而
 * `insertQRCode({ text })` 是最常见的用法。
 *
 * What a caller may pass to a command.
 *
 * Every field is optional: `updateQRCode({ position: … })` must not have to re-state the
 * payload, and `insertQRCode({ text })` is the common case.
 */
export type QRCodeInput = Partial<QRCodeAttrs>;

/** `qrcode` 的纠错等级。 / `qrcode`'s error-correction levels. */
export type QRErrorCorrectionLevel = "L" | "M" | "Q" | "H";

/** 生成位图所依据的输入。 / What a raster is generated from. */
export interface QRCodeGenerationOptions {
  /**
   * 物理尺寸所用的位图分辨率；见 `QR_PRINT_DPI`。
   *
   * Raster resolution for physical sizes. See `QR_PRINT_DPI`.
   */
  dpi: number;
  /** `qrcode` 的纠错等级。 / `qrcode`'s error-correction level. */
  errorCorrectionLevel: QRErrorCorrectionLevel;
}

/**
 * 调用方可以在扩展上配置的内容。
 *
 * 所有字段都有默认值，因此 `QRCode.configure({})` 就是一份完整配置。
 *
 * What a caller may configure on the extension.
 *
 * All fields have defaults, so `QRCode.configure({})` is a complete configuration.
 */
export interface QRCodeOptions {
  /** 合并进每个渲染出的 `<img>`。 / Merged into every rendered `<img>`. */
  HTMLAttributes: Record<string, unknown>;

  /**
   * `qrcode` 的纠错等级。默认 `"M"`。
   *
   * `"M"` 能恢复约 15% 的码字并让模块数保持较低，这正是纸质合同想要的：`"H"` 能承受更多
   * 物理损伤，但会生成更密的码，在同样的物理尺寸下手机摄像头要更费力。
   *
   * `qrcode`'s error-correction level. Default `"M"`.
   *
   * `"M"` recovers ~15% of the code and keeps the module count low, which is what a
   * printed contract wants: `"H"` survives more physical damage but produces a denser code
   * that a phone camera has to work harder on at the same physical size.
   */
  errorCorrectionLevel: QRErrorCorrectionLevel;

  /**
   * 位图分辨率，单位为每英寸点数，用于以 `mm`/`cm` 给出的尺寸。默认
   * `QR_PRINT_DPI`（300），商业印刷通常的下限。
   *
   * Raster resolution in dots per inch, for sizes given in `mm`/`cm`. Default
   * `QR_PRINT_DPI` (300), the usual commercial-print floor.
   */
  dpi: number;

  /**
   * 位图生成失败时调用，因此失败从不会悄无声息。
   *
   * 生成是异步的，而 Tiptap 的命令不是，所以这个失败无法通过命令的返回值上报；想要展示
   * 提示的宿主必须在这里订阅。
   *
   * Called when a raster could not be generated, so a failure is never silent.
   *
   * Generation is asynchronous and Tiptap's commands are not, so the failure cannot be
   * reported through the command's return value; a host that wants to show a message must
   * subscribe here.
   */
  onError: (error: unknown) => void;
}

/** 传给节点视图的内容。 / What the node view is handed. */
export interface QRCodeNodeViewContext {
  /**
   * 节点类型名，用作 `data-type` 属性。
   *
   * The node type's name, used for the `data-type` attribute.
   */
  name: string;

  /**
   * 构建视图时节点的属性。
   *
   * 视图自己保留一份规范化后的副本，并在 `update` 中刷新；除此之外没有别处读取该节点，
   * 因此不存在第二个会与它失步的取值入口。
   *
   * The node's attributes at the time the view was built.
   *
   * The view keeps its own normalised copy and refreshes it in `update`; nothing else
   * reads the node, so there is no second accessor to fall out of step with it.
   */
  attrs: QRCodeAttrs;
}

/**
 * `index.ts` 构建视图所对应的接口面。
 *
 * `NodeView` 唯一必填的成员是 `dom`；在这里要求其余成员，使 `nodeView.ts` 的返回值成为一个
 * 可检查的实现，而不是一袋「可能有」的方法。`update` 被收窄为视图真正使用的参数，而参数
 * 更少的函数在 `addNodeView()` 处也满足这个签名。
 *
 * The surface `index.ts` builds a view to.
 *
 * `NodeView`'s only required member is `dom`; requiring the rest here is what makes
 * `nodeView.ts`'s return value a checkable implementation rather than a bag of
 * maybe-methods. `update` is narrowed to the arguments the view actually uses, which a
 * function with fewer parameters satisfies at `addNodeView()`.
 */
export interface QRCodeNodeView extends NodeView {
  /** 视图的根元素：一个 `<img>`。 / The view's root element, an `<img>`. */
  dom: HTMLImageElement;
  /**
   * 节点变化时重绘，返回 `true` 表示本视图已处理。
   *
   * Repaint on a change; `true` means this view handled it.
   */
  update: (node: ProseMirrorNode, decorations: readonly Decoration[]) => boolean;
  /** 节点被选中时加上选中样式。 / Add the selected style when the node is selected. */
  selectNode: () => void;
  /** 取消选中时移除选中样式。 / Remove the selected style when the node is deselected. */
  deselectNode: () => void;
  /**
   * 视图自身的 DOM 变更不算文档编辑，返回 `true`。
   *
   * The view's own DOM changes are not document edits; `true`.
   */
  ignoreMutation: () => boolean;
  /** 移除本视图添加的事件监听。 / Remove the listeners this view added. */
  destroy: () => void;
}
