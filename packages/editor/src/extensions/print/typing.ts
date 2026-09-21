/**
 * 打印扩展自身的契约。
 *
 * 面向使用方的选项是 `typings/editor.ts` 里的 `PrintOptions`，因为顶层组件透传的就是那个形状。
 * {@link PrintExtensionOptions} 额外增加的每一样东西都是*流水线*的旋钮 —— 隐藏哪些选择器、
 * 哪个元素是纸张 —— 而不是组件调用方会配置的东西。
 *
 * The print extension's own contract.
 *
 * The user-facing options are `PrintOptions` in `typings/editor.ts`, because the same shape
 * is what the top-level component passes through. Everything {@link PrintExtensionOptions}
 * adds is a knob of the *pipeline* — which selectors to hide, which element is the paper —
 * rather than something a caller of the component configures.
 */

import type { PrintOptions } from "../../typings/editor";
import type { Margins, Orientation, PaperFormat, PaperSize } from "../../typings/paper";

/**
 * 一页的页面设置，从某个 `page` 节点上读出。
 *
 * 两个字段都是可选的，因为文档可能写在页面扩展记录它们之前，而 {@link resolvePaperSize} 对
 * 「没有给定格式」本来就有答案（A4）。
 *
 * A page setup, as read off one `page` node.
 *
 * Both fields are optional because a document may have been written before the page
 * extension recorded them, and {@link resolvePaperSize} already has an answer for "no
 * format given" (A4).
 */
export interface PrintPageSetup {
  /** 纸张格式；未设置时回退到 `"A4"`。 / Paper format; falls back to `"A4"` when unset. */
  paperFormat?: PaperFormat;
  /**
   * 纸张方向：竖排或横排。未设置时回退到 `"portrait"`。
   *
   * Portrait or landscape. Falls back to `"portrait"` when unset.
   */
  orientation?: Orientation;
}

/**
 * 打印为何无法精确复现该文档。
 *
 * 旧扩展在页面尺寸不一致时用 `alert()` 弹窗并*拒绝打印*（缺陷 35）。拒绝是契约最糟糕的答复：
 * 用户要的是纸，却什么也没得到。本实现用第一页的纸张打印，并在这里上报这一情况，让使用方可以
 * 在纸张已经出来*之后*再显示提示。
 *
 * Why printing could not reproduce the document exactly.
 *
 * The legacy extension `alert()`ed and *refused to print* when the pages disagreed about
 * size (defect 35). Refusing is the worst possible answer for a contract: the user asked
 * for paper and got nothing. The document prints with the first page's sheet and the
 * situation is reported here so a host can show a warning *after* the paper exists.
 */
export interface PrintWarning {
  /** 机器可读的种类。目前只有一种。 / Machine-readable kind. Currently only one. */
  code: "mixed-page-setup";
  /** 使用方可以原样展示的消息。 / A message a host may show verbatim. */
  message: string;
  /** 实际使用的设置 —— 第一页的。 / The setup that was actually used — the first page's. */
  used: { paperFormat: PaperFormat; orientation: Orientation; size: PaperSize };
  /**
   * 每一页纸张与 {@link used} 不同的页，连同其解析后的尺寸。
   *
   * Every page whose sheet differs from {@link used}, with its resolved size.
   */
  differingPages: Array<{ index: number; size: PaperSize }>;
}

/**
 * 使用方可以在扩展上配置的内容。
 *
 * What a caller may configure on the extension.
 */
export interface PrintExtensionOptions extends PrintOptions {
  /**
   * 打印时额外隐藏的选择器，叠加在 `[data-print-hidden]` 之上。
   *
   * 该属性总是被隐藏，所以对使用方来说最省事的接法是把 `data-print-hidden` 放到自己的工具栏上；
   * 这个列表是给使用方无法标注的外壳准备的 —— 第三方组件、渲染进 `document.body` 里的浮层。
   *
   * Extra selectors hidden while printing, on top of `[data-print-hidden]`.
   *
   * The attribute is always hidden, so the cheapest wiring for a host is to put
   * `data-print-hidden` on its toolbar; this list exists for chrome the host cannot
   * annotate — a third-party widget, a portal rendered into `document.body`.
   *
   * @example [".s-editor-toolbar", ".el-message-box", ".v-modal"]
   */
  hiddenSelectors?: string[];

  /**
   * 匹配**一个**页面容器的选择器。
   *
   * 默认 `.s-editor-page`。给页面加 `break-after` 的规则是按页索引（`:nth-of-type(n)`）生成的，
   * 所以它必须匹配页面元素本身，且这些元素必须是同类型的兄弟节点。
   *
   * Selector matching **one** page container.
   *
   * Default `.s-editor-page`. The rule that gives a page its `break-after` is emitted per
   * page index (`:nth-of-type(n)`), so this must match the page elements themselves and
   * those elements must be siblings of the same type.
   */
  pageSelector?: string;

  /**
   * 承载打印背景的包裹元素的选择器。
   *
   * 默认 `[data-print-root], .s-editor-paper, .ProseMirror`。`print-color-adjust: exact` 必须
   * 落在*包裹元素*上：Chrome 和 Safari 即使加了 `exact` 也不会打印 `<body>` 元素自身的背景：
   * https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust
   *
   * 默认列表按优先顺序覆盖三种情况：使用方标注自身的包裹元素、主题的纸张类名，以及
   * ProseMirror 自身的元素。
   *
   * Selector of the wrapper that carries the printed background.
   *
   * Default `[data-print-root], .s-editor-paper, .ProseMirror`. `print-color-adjust: exact`
   * must sit on a *wrapper*: Chrome and Safari are documented as not printing the `<body>`
   * element's own background even with `exact`
   * (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust).
   * The default list covers a host that marks its own wrapper, the theme's paper class, and
   * ProseMirror's own element, in that order of preference.
   */
  paperSelector?: string;

  /**
   * 文档无法被精确复现时调用。见 {@link PrintWarning}。
   *
   * Called when the document could not be reproduced exactly. See {@link PrintWarning}.
   */
  onWarning?: (warning: PrintWarning) => void;

  /**
   * 打印流水线自身失败时调用 —— 样式表无法注入，或某个 promise 被拒绝。
   *
   * 这里的失败无法通过命令的返回值上报，因为工作在（同步的）命令结束之后才继续。
   *
   * Called when the print pipeline itself failed — a stylesheet that could not be injected,
   * a promise that rejected. A failure here cannot be reported through the command's return
   * value, because the work outlives the (synchronous) command.
   */
  onError: (error: unknown) => void;
}

/**
 * 重新导出，让使用方对整个契约只需一处导入。
 *
 * Re-exported so a host has one import for the whole contract.
 */
export type { Margins, Orientation, PaperFormat, PaperSize } from "../../typings/paper";
