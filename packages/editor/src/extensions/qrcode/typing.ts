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

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";

// Type-only, so nothing is imported at run time and there is no cycle to worry about: the
// design/fill mode is the editor's, and the variable extension is where it is defined.
import type { VariableMode } from "../variable/store";

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
 * 二维码的左上角，相对**页面**（纸张）左上角测量。
 *
 * 是页面原点，不是正文盒原点：正文盒从页边距开始，因此按正文盒测量的 `10mm, 10mm` 实际落在
 * 「页边距 + 10mm」处，页边距一改它就跟着漂。面板里的「位置」说的就是纸上的位置。
 *
 * The QR code's top-left corner, measured from the **page's** (sheet's) top-left corner.
 *
 * The page origin, not the body box: the body box starts at the page margin, so `10mm, 10mm` measured
 * from it landed at "margin + 10mm" and drifted whenever the margin changed. What the panel's
 * 「位置」 means is a spot on the paper.
 */
export interface QRPosition {
  /** 距页面原点的横向偏移。 / Horizontal offset from the page origin. */
  x: number;
  /** 距页面原点的纵向偏移。 / Vertical offset from the page origin. */
  y: number;
  /** `x` 与 `y` 共用的单位。 / The unit both `x` and `y` are given in. */
  unit: QRUnit;
}

/**
 * 二维码被放在哪一页。
 *
 * `"first"` 与 `"last"` 是*相对*的：页数变化时它们跟着变，所以一份「印章盖在最后一页」的合同
 * 在追加一页之后仍然盖在最后一页。数字是绝对的 1 起页码，用于「就在第 3 页」这种要求。
 *
 * `null` 表示「没有指定过」，此时二维码就留在它自然所在的那一页。用 `null` 而不是把
 * `"first"` 当默认值，是因为一个从未被设置过的属性必须能与「用户明确选择了第一页」区分开：
 * 前者应当显示它实际所在的那一页，后者才应当把码移到第一页。
 *
 * Which page a QR code is placed on.
 *
 * `"first"` and `"last"` are *relative*: they follow the page count, so a contract whose stamp is
 * "on the last page" still is after a page is appended. A number is an absolute 1-based page,
 * for "page 3 exactly".
 *
 * `null` means "never specified", and the code then stays on the page it naturally sits on.
 * `null` rather than defaulting to `"first"` because an attribute that was never set has to be
 * distinguishable from "the user chose the first page": the former must report the page the code
 * is actually on, while only the latter moves it.
 */
export type QRPageAnchor = "first" | "last" | number | null;

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
   * 相对页面左上角的偏移。默认 `{ x: 10, y: 10, unit: "mm" }`。
   *
   * Offset from the page's top-left corner. Default `{ x: 10, y: 10, unit: "mm" }`.
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

  /**
   * 二维码所在的那一页。默认 `null`，即「不指定」，见 {@link QRPageAnchor}。
   *
   * The page the code is placed on. Defaults to `null`, i.e. "unspecified" — see
   * {@link QRPageAnchor}.
   */
  page: QRPageAnchor;
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

  /**
   * 设计模式下二维码被点击时调用，参数是它的文档位置。
   *
   * 与变量扩展的 `onRequestEdit` 同一个思路：扩展不知道对话框怎么写，只把请求交出去，宿主
   * 决定要不要开、开成什么样。填写模式下从不调用。
   *
   * Called when the code is clicked in design mode, with its document position.
   *
   * The same idea as the variable extension's `onRequestEdit`: the extension does not know how a
   * dialog is spelled, it only hands the request over and the host decides whether and how to
   * open one. Never called in fill mode.
   */
  onRequestEdit?: (pos: number) => void;
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

  /**
   * 承载这个节点的编辑器。选中节点时要用到它的 view 与 state。
   *
   * The editor hosting this node. Its view and state are what selecting the node needs.
   */
  editor?: Editor;

  /**
   * 节点的当前文档位置，实时解析。
   *
   * The node's current document position, resolved live.
   */
  getPos?: () => number | undefined;

  /**
   * 当前模式，实时读取。设计模式下这个码可以调整，填写模式下它只是内容。
   *
   * The current mode, read live. In design mode the code is adjustable; in fill mode it is
   * content and nothing else.
   */
  getMode?: () => VariableMode;

  /**
   * 设计模式下二维码被点击时调用，参数是它的文档位置。
   *
   * 与变量完全相同的通道：视图不拥有对话框，宿主拥有。填写模式下从不调用——那时这个码
   * 不是可以调整的东西。
   *
   * Called when the code is clicked in design mode, with its document position.
   *
   * The same channel the variable uses: the view does not own a dialog, the host does. Never
   * called in fill mode, where the code is not something to adjust.
   */
  onRequestEdit?: (pos: number) => void;
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
