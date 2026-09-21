/**
 * `@media print` CSS 生成 —— 纯函数，也是打印扩展逻辑的全部。
 *
 * ## 旧扩展错在哪里
 *
 * `browserPrint.ts`（缺陷 35）：一个 `display: none` 的 iframe、**完全没有应用 CSS**、
 * 每一页都 `@page { margin: 0 }`，以及**每一页**（包括最后一页）都
 * `page-break-after: always` —— 末尾那张空白纸就是从这儿来的。它也从不设置
 * `print-color-adjust: exact`，从不等待字体或图片，并且在各页纸张不一致时 `alert()` 弹窗、
 * 拒绝打印。
 *
 * ## 设计
 *
 * 编辑器自身文档里的原生 `@media print` —— 已批准的决策 5 —— 所以打印结果就是被编辑的文档，
 * 应用的样式表、字体和图片都已就位。CSS 唯一无法表达的是*每页不同纸张*：一条 `@page` 规则
 * 作用于整个文档，所以 {@link buildPrintStyles} 按第一页的尺寸渲染，并上报不一致而不是失败
 * （见 `PrintWarning`）。
 *
 * ## 本文件依赖的两个事实
 *
 * - **`@page` 边距框仅 Chromium 131+ 支持。** MDN 浏览器兼容数据里每一个
 *   `@top-*`/`@bottom-*` 条目都是 `chrome: 131, firefox: false, safari: false`
 *   （https://developer.chrome.com/blog/print-margins、
 *   https://cdn.jsdelivr.net/gh/mdn/browser-compat-data@main/css/at-rules/page.json）
 *   因此它们是**可选开启**的：文档自己的 `pageNumber` 节点在任何地方都能打印，
 *   所以关掉 `marginBoxes` 也绝不会丢失页码。
 * - **`@page { margin: 0 }` 会抑制 Chrome 的边距框。** Chromium 依据*第一页*决定页面布局并
 *   把它应用于所有页，所以零边距既会隐藏浏览器自动的页眉/页脚，也会阻止后续页面显示边距框，
 *   即使它们有空间
 *   （https://developer.chrome.com/blog/print-margins、
 *   https://issues.chromium.org/issues/374244475）。
 *   当要求边距框且未配置边距时，{@link resolvePrintMargins} 会预留空间。
 *
 * ## 有意缺席的东西
 *
 * 没有 `position: fixed` 页脚。固定元素在 Chrome 和 Firefox 中*确实*会在每个打印页上重复，
 * 但失败模式不是页脚缺失：它们会裁掉第 2 页及以后页面上的正文内容
 * （https://lists.w3.org/Archives/Public/public-css-archive/2025Jul/0363.html）。
 * 真正的页脚要么是 `@page` 边距框（Chrome），要么是页面里的一个节点（所有浏览器）。
 *
 * `@media print` CSS generation — pure, and the whole of the print extension's logic.
 *
 * ## What the legacy extension got wrong
 *
 * `browserPrint.ts` (defect 35): a `display: none` iframe, **no application CSS at all**,
 * `@page { margin: 0 }` for every page, and `page-break-after: always` on **every** page
 * including the last — which is where the trailing blank sheet came from. It also never set
 * `print-color-adjust: exact`, never waited for fonts or images, and `alert()`ed and
 * refused to print when the pages disagreed about their sheet.
 *
 * ## The design
 *
 * Native `@media print` in the editor's own document — approved decision 5 — so the printed
 * output is the edited document, with the application's stylesheets, fonts and images
 * already in place. The one thing CSS cannot express is a *different sheet per page*: a
 * single `@page` rule applies to the whole document, so {@link buildPrintStyles} renders the
 * first page's size and reports the mismatch instead of failing
 * (see `PrintWarning`).
 *
 * ## Two facts this file depends on
 *
 * - **`@page` margin boxes are Chromium 131+ only.** Every `@top-*`/`@bottom-*` entry in
 *   MDN's browser-compat data is `chrome: 131, firefox: false, safari: false`
 *   (https://developer.chrome.com/blog/print-margins,
 *   https://cdn.jsdelivr.net/gh/mdn/browser-compat-data@main/css/at-rules/page.json). They
 *   are therefore **opt-in**: the document's own `pageNumber` nodes print everywhere, so
 *   page numbers are never lost by leaving `marginBoxes` off.
 * - **`@page { margin: 0 }` suppresses Chrome's margin boxes.** Chromium decides the page
 *   layout from the *first* page and applies it to all of them, so a zero margin both hides
 *   the browser's automatic header/footer and prevents later pages from showing a margin box
 *   even when they have room
 *   (https://developer.chrome.com/blog/print-margins, https://issues.chromium.org/issues/374244475).
 *   {@link resolvePrintMargins} reserves room when margin boxes are asked for and no margin
 *   was configured.
 *
 * ## What is deliberately absent
 *
 * There is no `position: fixed` footer. Fixed elements *are* repeated on every printed page
 * by Chrome and Firefox, but the failure mode is not a missing footer: they clip body
 * content on page 2 and later
 * (https://lists.w3.org/Archives/Public/public-css-archive/2025Jul/0363.html). A real footer
 * is either a `@page` margin box (Chrome) or a node in the page (everywhere).
 */

import { DEFAULT_MARGINS, resolveMargins, resolvePaperSize } from "../../typings/paper";
import type { Margins, PaperSize, ResolvedMargins } from "../../typings/paper";
import type { PrintPageSetup } from "./typing";

/** 唯一被注入的样式表的 `id`。 / The `id` of the single injected stylesheet. */
export const PRINT_STYLE_ELEMENT_ID = "s-editor-print-style";

/** 一个页面容器的默认选择器。 / Default selector for one page container. */
export const PRINT_PAGE_SELECTOR = ".s-editor-page";

/**
 * 承载打印背景的包裹元素的默认选择器。
 *
 * 三个候选，按优先级排列：使用方设置的属性、主题自己的纸张类名，以及 ProseMirror 自己的
 * 元素 —— 它总是存在，而且是页面容器的直接父节点。
 *
 * Default selector for the wrapper that owns the printed background.
 *
 * Three candidates, in order of preference: an attribute the host sets, the theme's own
 * paper class, and ProseMirror's own element — which is always present and is the direct
 * parent of the page containers.
 */
export const PRINT_PAPER_SELECTOR = "[data-print-root], .s-editor-paper, .ProseMirror";

/** 让任意元素不参与打印的属性。 / The attribute that hides any element from printing. */
export const PRINT_HIDDEN_ATTRIBUTE = "data-print-hidden";

/** 上述属性的选择器形式。 / The selector form of {@link PRINT_HIDDEN_ATTRIBUTE}. */
export const PRINT_HIDDEN_SELECTOR = `[${PRINT_HIDDEN_ATTRIBUTE}]`;

/**
 * 为边距框预留的空间，用于开启边距框但未设置边距的情形。
 *
 * Chrome 自带的页眉/页脚约占 10 mm；16 mm 足以容纳二者中的任一个，又不会让正文块显得拥挤。
 *
 * The room reserved for a margin box, when margin boxes are enabled and no margin is set.
 *
 * Chrome's own automatic header/footer lives in ~10 mm; 16 mm holds either without crowding
 * the text block.
 */
export const PRINT_MARGIN_BOX_RESERVE = "16mm";

/**
 * 没有边距的纸张。页面容器已经自带文档自身的边距。
 *
 * A sheet with no margin. The page containers carry the document's own margins already.
 */
export const PRINT_ZERO_MARGINS: ResolvedMargins = {
  top: "0",
  right: "0",
  bottom: "0",
  left: "0"
};

/**
 * 完全没有页面设置的文档按此打印。
 *
 * What a document with no page setup at all is printed as.
 */
export const PRINT_DEFAULT_SETUP: Required<PrintPageSetup> = {
  paperFormat: "A4",
  orientation: "portrait"
};

/** 传给 {@link buildPrintStyles} 的内容。 / What {@link buildPrintStyles} is given. */
export interface PrintStylesInput {
  /**
   * 每个页面容器一份设置，按文档顺序。裸文档为空。
   *
   * One setup per page container, in document order. Empty for a bare document.
   */
  pages: PrintPageSetup[];

  /**
   * `@page` 边距。
   *
   * 省略表示 `0` —— 页面容器已经以 padding 形式施加了文档的边距，在这里再加一次会让边距翻倍。
   * 零边距不适用的那一种情形见 {@link resolvePrintMargins}。
   *
   * The `@page` margin.
   *
   * Omitted means `0` — the page containers already apply the document's margins as padding,
   * and adding them again here would double the margin. See
   * {@link resolvePrintMargins} for the one case where a zero margin is not used.
   */
  margins?: Margins;

  /**
   * 输出带 `counter(page)` / `counter(pages)` 的 `@page` 边距框。默认 `false`。
   *
   * Emit `@page` margin boxes with `counter(page)` / `counter(pages)`. Default `false`.
   */
  marginBoxes?: boolean;

  /**
   * 匹配一个页面容器的选择器。默认 {@link PRINT_PAGE_SELECTOR}。
   *
   * Selector matching one page container. Default {@link PRINT_PAGE_SELECTOR}.
   */
  pageSelector?: string;

  /**
   * 承载打印背景的包裹元素的选择器。
   *
   * Selector of the wrapper carrying the printed background.
   */
  paperSelector?: string;

  /**
   * 打印时额外隐藏的选择器。总是包含 `[data-print-hidden]`。
   *
   * Extra selectors hidden while printing. `[data-print-hidden]` is always included.
   */
  hiddenSelectors?: string[];
}

/** {@link buildPrintStyles} 产出的内容。 / What {@link buildPrintStyles} produced. */
export interface PrintStylesResult {
  /**
   * 完整的 `@media print { … }` 块，可直接作为 `<style>` 的文本。
   *
   * The complete `@media print { … }` block, ready to be the text of a `<style>`.
   */
  css: string;
  /**
   * `@page` 里实际声明的纸张 —— 第一页的。
   *
   * The sheet actually declared in `@page` — the first page's.
   */
  size: PaperSize;
  /** 实际声明的 `@page` 边距。 / The `@page` margin actually declared. */
  margins: ResolvedMargins;
  /**
   * 至少有一页的纸张与第一页不同时为 `true`。
   *
   * `true` when at least one page's sheet differs from the first page's.
   */
  mixed: boolean;
  /**
   * 每一页解析后的纸张，按文档顺序 —— 用于诊断。
   *
   * Every page's resolved sheet, in document order — for diagnostics.
   */
  pageSizes: PaperSize[];
}

/**
 * 对 `"0"`、`"0mm"`、`"0px"` 等为 `true` —— 不占任何空间的长度。
 *
 * `true` for `"0"`, `"0mm"`, `"0px"`, … — a length that reserves nothing.
 */
export function isZeroLength(value: string): boolean {
  return /^\s*[+-]?0+(\.0+)?\s*(mm|cm|in|pt|px|em|rem|%)?\s*$/i.test(value);
}

/**
 * 解析 `@page` 边距。
 *
 * 已配置的边距会被原样采用。否则边距为零 —— *除非*要求了边距框，此时零边距会抑制它们
 * （见模块注释），于是改为在上下预留空间。即便在这种情况下左右仍保持为零：边距框是居中的，
 * 而加宽左右边距会为了一个页码让整个文档重排。
 *
 * Resolve the `@page` margin.
 *
 * A configured margin is honoured exactly. Otherwise the margin is zero — *unless* margin
 * boxes were asked for, in which case a zero margin would suppress them (see the module
 * comment) and top/bottom room is reserved instead. Left and right stay zero even then: the
 * margin boxes are centred, and widening the side margins would reflow the whole document
 * for a page number.
 */
export function resolvePrintMargins(
  configured: Margins | undefined,
  marginBoxes: boolean
): ResolvedMargins {
  const resolved = configured === undefined ? { ...PRINT_ZERO_MARGINS } : resolveMargins(configured);
  if (!marginBoxes) return resolved;

  const reservesNothing = isZeroLength(resolved.top) && isZeroLength(resolved.bottom);
  if (!reservesNothing) return resolved;

  return {
    ...resolved,
    top: PRINT_MARGIN_BOX_RESERVE,
    bottom: PRINT_MARGIN_BOX_RESERVE
  };
}

/**
 * 把四条边写成 CSS 的 top/right/bottom/left 简写。
 *
 * 四条边一致时折叠为单个值，所以常见情形读作 `margin: 0` 和 `margin: 20mm`，而不是同一个
 * 长度重复四遍。
 *
 * Write four sides as CSS's top/right/bottom/left shorthand.
 *
 * Collapsed to a single value when all four agree, so the common cases read as `margin: 0`
 * and `margin: 20mm` rather than as four repetitions of the same length.
 */
export function formatMargins(margins: ResolvedMargins): string {
  const { top, right, bottom, left } = margins;
  if (top === right && right === bottom && bottom === left) return top;
  return `${top} ${right} ${bottom} ${left}`;
}

/** 两个边距框，以及支持它们的引擎。 / The two margin boxes, and the engines that support them. */
function marginBoxRules(): string {
  // Chromium 131+ draws these with real page counters; Firefox and Safari do not implement
  // margin boxes at all, so they simply ignore the block. That asymmetry is why this is
  // opt-in and why the base mechanism is the document's own `pageNumber` nodes.
  return [
    "    @top-center {",
    "      content: counter(page);",
    "    }",
    "    @bottom-center {",
    '      content: "第 " counter(page) " 页 / 共 " counter(pages) " 页";',
    "    }"
  ].join("\n");
}

/**
 * 每一页一条 `break-after` 规则，这样最后一页无法强制产生末尾的空白纸。
 *
 * One `break-after` rule per page, so the last page cannot force a trailing blank sheet.
 */
function pageBreakRules(pageSelector: string, pageCount: number): string[] {
  const rules: string[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const isLast = index === pageCount - 1;
    // The last page's rule is emitted explicitly as `auto` rather than omitted: the theme or
    // a host stylesheet may well say `.s-editor-page { break-after: page }`, and only a more
    // specific rule (`:nth-of-type(n)` beats a class) can take it back. `break-after` and
    // `page-break-after` are aliases of one property, so this also neutralises a legacy
    // `page-break-after: always`.
    rules.push(
      [
        `  ${pageSelector}:nth-of-type(${index + 1}) {`,
        `    break-after: ${isLast ? "auto" : "page"};`,
        "  }"
      ].join("\n")
    );
  }

  return rules;
}

/**
 * 构建打印样式表。
 *
 * 纯函数：没有 DOM、没有编辑器、没有副作用 —— 这正是让那些有意思的情形（单页、多页、
 * 最后一页、自定义边距、边距框开与关）能在普通 Node 环境里测试的原因。
 *
 * Build the print stylesheet.
 *
 * Pure: no DOM, no editor, no side effects — which is what makes the interesting cases
 * (a single page, several pages, the last page, custom margins, margin boxes on and off)
 * testable in a plain Node environment.
 */
export function buildPrintStyles(input: PrintStylesInput): PrintStylesResult {
  const setups = input.pages.length > 0 ? input.pages : [PRINT_DEFAULT_SETUP];
  const first = setups[0] ?? PRINT_DEFAULT_SETUP;

  const size = resolvePaperSize(
    first.paperFormat ?? PRINT_DEFAULT_SETUP.paperFormat,
    first.orientation ?? PRINT_DEFAULT_SETUP.orientation
  );

  const pageSizes = setups.map((setup) =>
    resolvePaperSize(
      setup.paperFormat ?? PRINT_DEFAULT_SETUP.paperFormat,
      setup.orientation ?? PRINT_DEFAULT_SETUP.orientation
    )
  );

  const mixed = pageSizes.some(
    (candidate) => candidate.width !== size.width || candidate.height !== size.height
  );

  const marginBoxes = input.marginBoxes === true;
  const margins = resolvePrintMargins(input.margins, marginBoxes);
  const pageSelector = input.pageSelector ?? PRINT_PAGE_SELECTOR;
  const paperSelector = input.paperSelector ?? PRINT_PAPER_SELECTOR;

  // `[data-print-hidden]` first, so the attribute is always hidden even when a host passes
  // an empty list; deduplicated, so a host that also lists the attribute does not produce a
  // repeated selector.
  const hiddenSelectors = Array.from(
    new Set([PRINT_HIDDEN_SELECTOR, ...(input.hiddenSelectors ?? [])].filter((entry) => entry.length > 0))
  );

  const pageRules = [
    "  @page {",
    `    size: ${size.width}mm ${size.height}mm;`,
    `    margin: ${formatMargins(margins)};`,
    ...(marginBoxes ? [marginBoxRules()] : []),
    "  }"
  ].join("\n");

  const blocks: string[] = [
    pageRules,
    // The print dialog must not add a scrollbar's worth of body margin to the first sheet.
    ["  html,", "  body {", "    margin: 0 !important;", "    padding: 0 !important;", "  }"].join(
      "\n"
    ),
    // On a *wrapper*, never on `body`: Chrome and Safari are documented as not printing the
    // body element's own background even with `exact`. Note this is a hint only — the user's
    // own print options win — which is why the watermark is real content as well.
    [
      `  ${paperSelector} {`,
      "    print-color-adjust: exact;",
      "    -webkit-print-color-adjust: exact;",
      "  }"
    ].join("\n"),
    ...pageBreakRules(pageSelector, setups.length),
    // Furniture is drawn at 80 % on screen (it is secondary to the body); a print is the document
    // itself, so the header and footer always print at full strength regardless of whether the
    // user happened to have a band open when they pressed print.
    [
      "  .s-editor-page-header,",
      "  .s-editor-page-footer {",
      "    opacity: 1 !important;",
      "  }"
    ].join("\n"),
    // The "double-click to edit" hint is an affordance, never content.
    ["  .s-editor-page-region::after {", "    content: none !important;", "  }"].join("\n"),
    [`  ${hiddenSelectors.join(", ")} {`, "    display: none !important;", "  }"].join("\n")
  ];

  return {
    css: ["@media print {", ...blocks, "}", ""].join("\n"),
    size,
    margins,
    mixed,
    pageSizes
  };
}

/**
 * 默认边距，重新导出以便使用方把它们作为「普通」预设提供。
 *
 * The default margins, re-exported so a host can offer them as the "normal" preset.
 */
export { DEFAULT_MARGINS };
