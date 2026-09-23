/**
 * 打印克隆：把编辑器自己的纸张搬进一个只为打印而存在的容器。
 *
 * ## 为什么不能直接打印实时文档
 *
 * 打印对话框渲染的是**整个文档**。宿主应用的侧边栏、工具栏、对话框都是 `<body>` 的孩子，所以它们
 * 会跟着纸张一起印出来 —— 这正是缺陷 43：点「打印」印出来的是整个 Web 页面。
 *
 * ## 做法
 *
 * 把编辑器自己的 `.s-editor-page` 深拷贝进一个 `<div class="s-editor-print-root">`，再把它挂成
 * `<body>` 的直接孩子。{@link buildPrintRootStyles} 让该容器在屏幕上不可见，而在打印时成为
 * `<body>` 下唯一可见的孩子 —— 于是纸上有什么与宿主页面长什么样无关。容器里装的是**同一份文档**
 * 里的拷贝，不是新文档，所以应用的样式表、字体和图片都还在（旧版 iframe 的失败模式）。
 *
 * ## 为什么容器和它的样式表同生共死
 *
 * 隐藏其余 `<body>` 孩子的规则如果留在文档里，之后一次直接按 Ctrl+P（它不走这条流水线，因此没有
 * 容器）就会把整页都藏起来，印出一张白纸。因此那段规则挂在**为这次打印而建**的一个 `<style>`
 * 里，和容器一起摘掉；{@link mountPrintRoot} 就是这一对的所有者。
 *
 * 其余函数各自只做一件事，纯逻辑与 DOM 逻辑因此可以分开测试。
 *
 * Printing by clone: the editor's own sheets are moved into a container that exists only to be
 * printed.
 *
 * ## Why the live document cannot simply be printed
 *
 * The print dialog renders the **whole document**. The host application's sidebar, toolbars and
 * dialogs are children of `<body>`, so they print alongside the sheets — which is exactly defect
 * 43: clicking 打印 put the entire web page on paper.
 *
 * ## The approach
 *
 * The editor's own `.s-editor-page` elements are deep-cloned into a
 * `<div class="s-editor-print-root">`, which is appended as a direct child of `<body>`.
 * {@link buildPrintRootStyles} keeps that container invisible on screen and makes it the only
 * visible `<body>` child in print — so what reaches the paper no longer depends on what the host
 * page looks like. The container holds copies taken from the *same* document, not a new one, so the
 * application's stylesheets, fonts and images are still in effect (the legacy iframe's failure
 * mode).
 *
 * ## Why the container and its stylesheet live and die together
 *
 * A rule that hides every other `<body>` child would, if left behind in the document, turn a later
 * bare Ctrl+P — which does not run this pipeline and therefore has no container — into a blank
 * sheet. The rule is therefore carried by a `<style>` built **for this print**, and removed with
 * the container; {@link mountPrintRoot} owns that pair.
 *
 * The other functions each do one thing, so the pure logic and the DOM logic are testable apart.
 */

import { buildPrintRootStyles, PRINT_PAGE_SELECTOR, PRINT_ROOT_CLASS } from "./styles";

/**
 * 承载主题的那个元素的选择器。
 *
 * 主题把 `--se-*`、它覆盖的 `--el-*`，以及使用方可能加在编辑器根上的类都放在
 * `.s-editor-scope` 上，纸张在它内部；克隆出去的纸张只有落回同一个作用域才会保留样式。
 *
 * Selector of the element that carries the theme.
 *
 * The theme puts `--se-*`, the `--el-*` tokens it overrides, and any class a host added to the
 * editor root on `.s-editor-scope`, with the sheets inside it; a cloned sheet keeps its styling
 * only if it lands back inside that scope.
 */
const PRINT_SOURCE_SELECTOR = ".s-editor-scope";

/**
 * 容器那次打印专属的样式表的标记属性 —— 便于在开发者工具里认出它。
 *
 * The attribute that marks the stylesheet belonging to one print — so it can be recognised in a
 * developer tools session.
 */
const PRINT_ROOT_STYLE_ATTRIBUTE = "data-print-root-styles";

/**
 * 承载主题的那个元素。
 *
 * 取编辑器元素最近的 {@link PRINT_SOURCE_SELECTOR} 祖先；没有祖先时（宿主直接使用扩展、没走
 * `SEditor` 组件）就是编辑器元素自己。
 *
 * The element that carries the theme.
 *
 * The editor element's nearest {@link PRINT_SOURCE_SELECTOR} ancestor, or the editor element
 * itself when there is none (a host that wires the extension without the `SEditor` component).
 */
export function resolvePrintSource(editorRoot: HTMLElement): HTMLElement {
  return editorRoot.closest<HTMLElement>(PRINT_SOURCE_SELECTOR) ?? editorRoot;
}

/**
 * 要打印的纸张，按文档顺序。
 *
 * 只在编辑器**自己的**子树里查找，绝不 `document.querySelector`：宿主页面上另一个编辑器的纸张，
 * 或一份离屏预览的纸张，都不属于这次打印。
 *
 * 一个页面容器都没有的文档（宿主没有注册页面扩展）退回编辑器自己的内容根 —— 打印出空白纸比
 * 打印出内容更糟。
 *
 * The sheets to print, in document order.
 *
 * Searched inside the editor's **own** subtree, never with `document.querySelector`: another
 * editor's sheets, or an off-screen preview's, are not part of this print.
 *
 * A document with no page container at all (a host that did not register the page extension) falls
 * back to the editor's own content root — a blank sheet is worse than content.
 */
export function collectPrintPages(
  editorRoot: HTMLElement,
  pageSelector: string = PRINT_PAGE_SELECTOR
): HTMLElement[] {
  const pages = Array.from(editorRoot.querySelectorAll<HTMLElement>(pageSelector));
  return pages.length > 0 ? pages : [editorRoot];
}

/**
 * 建立打印容器：源元素的类名，加上每一页的深拷贝。
 *
 * `cloneNode(true)` 原样带走行内 `style`（纸张尺寸与页边距的自定义属性都在那里），而类名拷贝让
 * 主题的作用域、以及使用方加在编辑器根上的类一起过去；包里的样式表是全局的，所以类选择器在克隆里
 * 照样命中。
 *
 * Build the print container: the source element's classes plus a deep clone of every sheet.
 *
 * `cloneNode(true)` carries the inline `style` verbatim (the sheet's size and its margin custom
 * properties live there), and copying the class list brings the theme's scope — and any class a
 * host put on the editor root — along with it; the package's stylesheet is global, so class
 * selectors keep matching inside the clone.
 */
export function createPrintRoot(source: HTMLElement, pages: readonly HTMLElement[]): HTMLElement {
  const container = document.createElement("div");
  container.classList.add(PRINT_ROOT_CLASS);

  source.classList.forEach((name) => container.classList.add(name));
  pages.forEach((page) => container.append(page.cloneNode(true)));

  return container;
}

/**
 * 一次打印的容器与它的样式表。
 *
 * The container of one print, and the stylesheet that belongs to it.
 */
export interface MountedPrintRoot {
  /** 容器本身，`<body>` 的直接孩子。 / The container itself, a direct child of `<body>`. */
  container: HTMLElement;

  /**
   * 把容器和它的样式表一起摘掉。可重复调用。
   *
   * Remove the container and its stylesheet together. Idempotent.
   */
  remove: () => void;
}

/**
 * 建立容器与它的样式表，并把两者挂进文档。
 *
 * 样式表先挂：藏在它里面的屏幕规则必须比容器先到位，容器才不可能在用户眼前闪一下。容器挂成
 * `<body>` 的直接孩子，{@link buildPrintRootStyles} 里那条
 * `body > *:not(.s-editor-print-root)` 才能成立。
 *
 * Build the container and its stylesheet, and put both into the document.
 *
 * The stylesheet goes first: the screen rule that hides the container lives in it, and the
 * container must not flash in front of the user for a single frame. The container is a direct
 * child of `<body>`, which is what makes the `body > *:not(.s-editor-print-root)` rule in
 * {@link buildPrintRootStyles} apply.
 */
export function mountPrintRoot(
  source: HTMLElement,
  pages: readonly HTMLElement[]
): MountedPrintRoot {
  const container = createPrintRoot(source, pages);

  const style = document.createElement("style");
  style.setAttribute(PRINT_ROOT_STYLE_ATTRIBUTE, "true");
  style.textContent = buildPrintRootStyles();

  document.head.append(style);
  document.body?.append(container);

  return {
    container,
    remove: () => {
      container.remove();
      style.remove();
    }
  };
}
