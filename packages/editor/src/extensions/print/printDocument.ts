/**
 * 打印中面向 DOM 的那一半。
 *
 * ## 流水线
 *
 * 1. 读取文档自身的页面设置，并把它变成一段 `@media print` 块；
 * 2. 把该块注入编辑器自己的 `<head>` —— 单个 `<style>` 元素，每次打印都复用，绝不用 iframe，
 *    也绝不开新窗口；
 * 3. 把编辑器自己的纸张深拷贝进一个 `<div class="s-editor-print-root">`，挂成 `<body>` 的直接
 *    孩子，并给它挂一份只属于这次打印的样式表：打印时 `<body>` 下只有它可见，所以纸上只有纸张，
 *    宿主页面的侧边栏与工具栏都印不出来（缺陷 43）；
 * 4. 等待 `document.fonts.ready` 以及容器里的每一个 `<img>`，因为在网页字体完成切换之前取得的
 *    打印快照显示的是回退字体的度量，并会让每一页发生重排（旧扩展什么都不等 —— 缺陷 35）；
 * 5. 运行 `onBeforePrint`，设置 `document.title`，让「另存为 PDF」给出一个像样的文件名，然后
 *    调用 `window.print()`；
 * 6. 在 `afterprint` 时把容器从文档里摘掉、恢复标题并运行 `onAfterPrint`。
 *
 * ## 为什么没有 `alert()`，也不拒绝打印
 *
 * 旧扩展会比较各页的纸张，`alert()` 一段中文然后直接返回、不打印。用户要的是纸，却只得到一个
 * 对话框和别的什么都没有，根本无从继续；这里文档会用第一页的纸张打印，不一致则通过
 * {@link PrintExtensionOptions.onWarning} 上报。
 *
 * The DOM-facing half of printing.
 *
 * ## The pipeline
 *
 * 1. read the document's own page setup and turn it into one `@media print` block;
 * 2. inject that block into the editor's own `<head>` as a single `<style>` element, reused on
 *    every print, never an iframe and never a new window;
 * 3. deep-clone the editor's own sheets into a `<div class="s-editor-print-root">` appended as a
 *    direct child of `<body>`, with a stylesheet that belongs to this print alone: it is the only
 *    visible `<body>` child while printing, so the paper holds the sheets and nothing of the host
 *    page — no sidebar, no toolbar (defect 43);
 * 4. wait for `document.fonts.ready` and for every `<img>` in the container, because a print
 *    snapshot taken before a web font swaps shows the fallback metrics and reflows every page (the
 *    legacy extension waited for nothing — defect 35);
 * 5. run `onBeforePrint`, set `document.title` so "Save as PDF" proposes a sensible file name, call
 *    `window.print()`;
 * 6. on `afterprint`, take the container back out of the document, restore the title and run
 *    `onAfterPrint`.
 *
 * ## Why there is no `alert()` and no refusal
 *
 * The legacy extension compared the pages' sheets, `alert()`ed a Chinese message and
 * returned without printing. A user who asked for paper and got a dialog and nothing else has
 * no way forward; here the document prints with the first page's sheet and the mismatch is
 * reported through {@link PrintExtensionOptions.onWarning}.
 */

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PAPER_SIZES } from "../../typings/paper";
import type { NamedPaperFormat, PaperFormat } from "../../typings/paper";

import { buildPrintStyles, PRINT_DEFAULT_SETUP, PRINT_STYLE_ELEMENT_ID } from "./styles";
import type { PrintStylesResult } from "./styles";
import { collectPrintPages, mountPrintRoot, resolvePrintSource } from "./printRoot";
import type { PrintExtensionOptions, PrintPageSetup, PrintWarning } from "./typing";

/**
 * 等待单张图片的毫秒数。
 *
 * 损坏的图片并非在所有引擎里都会触发 `load` *或* `error`，而一个卡住的 `data:` URL 解码器
 * 也不该能把打印对话框永远挂住。
 *
 * How long to wait for one image.
 *
 * A broken image never fires `load` *or* `error` in every engine, and a `data:` URL decoder
 * that has stalled should not be able to hang the print dialog forever.
 */
export const PRINT_IMAGE_TIMEOUT_MS = 3000;

/** 等待字体就绪的毫秒数。 / How long to wait for `document.fonts.ready`. */
export const PRINT_FONT_TIMEOUT_MS = 3000;

/**
 * 有可打印的 DOM 时为 `true`。该扩展对 SSR 安全，所以这里做了检查。
 *
 * `true` when there is a DOM to print. The extension is SSR-safe, so this is checked.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** 把未知值收窄为非 null 的对象记录。 / Narrow an unknown value to a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取纸张格式属性，接受命名尺寸或自定义的 `{ width, height }`。
 *
 * Read a paper format attribute, accepting a named size or a custom `{ width, height }`.
 */
export function readPaperFormat(value: unknown): PaperFormat | undefined {
  if (typeof value === "string") {
    // Validated against the table rather than cast: `resolvePaperSize` would silently fall
    // back to A4 for a typo, and a typo should leave the default in place *here* so the
    // mixed-sheet detection does not report a phantom difference.
    return value in PAPER_SIZES ? (value as NamedPaperFormat) : undefined;
  }

  if (isRecord(value)) {
    const { width, height } = value;
    if (typeof width === "number" && Number.isFinite(width) && typeof height === "number" && Number.isFinite(height)) {
      return {
        name: typeof value.name === "string" ? value.name : "custom",
        width,
        height
      };
    }
  }

  return undefined;
}

/**
 * 读取某一个 `page` 节点的设置。
 *
 * 属性名就是 `typings/editor.ts` 里 `TemplatePageSetup` 固定的那两个（`paperFormat`、
 * `orientation`），这是页面扩展与所有在编辑器之外渲染模板的代码之间的契约。
 *
 * Read one `page` node's setup.
 *
 * The attribute names are the ones `TemplatePageSetup` in `typings/editor.ts` fixes
 * (`paperFormat`, `orientation`), which is the contract between the page extension and
 * everything that renders a template outside the editor.
 */
export function readPageSetup(attrs: Record<string, unknown>): PrintPageSetup {
  return {
    paperFormat: readPaperFormat(attrs.paperFormat),
    orientation: attrs.orientation === "landscape" ? "landscape" : attrs.orientation === "portrait" ? "portrait" : undefined
  };
}

/**
 * 每一页的设置，按文档顺序。
 *
 * 用 `descendants` 而不是顶层 `forEach`：页面究竟是文档自己的子节点还是位于某个包裹节点内部，
 * 是页面扩展的决定，而这个决定改变时打印扩展不该被迫跟着改。
 *
 * Every page's setup, in document order.
 *
 * `descendants` rather than a top-level `forEach`: whether pages are the document's own
 * children or sit inside a wrapper is the page extension's decision, and the print extension
 * should not have to be changed if that decision changes.
 */
export function collectPageSetups(doc: ProseMirrorNode): PrintPageSetup[] {
  const setups: PrintPageSetup[] = [];

  doc.descendants((node) => {
    if (node.type.name !== "page") return true;
    setups.push(readPageSetup(node.attrs));
    // A page cannot contain another page.
    return false;
  });

  return setups;
}

/**
 * 把扩展自身的覆盖项施加到文档的页面设置上。
 *
 * `PrintOptions.paperFormat`/`orientation` 的文档说明是默认取「文档自身的页面设置」，所以显式
 * 给出的选项对每一页都生效 —— 这也正是让一篇混合文档能作为统一文档打印的原因。
 *
 * Apply the extension's own overrides to the document's page setup.
 *
 * `PrintOptions.paperFormat`/`orientation` are documented as defaulting to "the document's
 * own page setup", so an explicit option wins for every page — which is also what makes a
 * mixed document printable as a uniform one.
 */
export function withOptionOverrides(
  pages: PrintPageSetup[],
  options: PrintExtensionOptions
): PrintPageSetup[] {
  if (options.paperFormat === undefined && options.orientation === undefined) return pages;

  const list = pages.length > 0 ? pages : [PRINT_DEFAULT_SETUP];
  return list.map((page) => ({
    paperFormat: options.paperFormat ?? page.paperFormat,
    orientation: options.orientation ?? page.orientation
  }));
}

/**
 * `@page` 实际会声明的设置：第一页的。
 *
 * The setup `@page` will actually declare: the first page's.
 */
export function usedSetup(pages: PrintPageSetup[]): Required<PrintPageSetup> {
  const first = pages[0];
  return {
    paperFormat: first?.paperFormat ?? PRINT_DEFAULT_SETUP.paperFormat,
    orientation: first?.orientation ?? PRINT_DEFAULT_SETUP.orientation
  };
}

/**
 * `promise` 敲定时结算，或者过了 `ms` 毫秒结算 —— 以先到者为准。
 *
 * 定时器总会被清除，所以即便图片很快返回也不会留下挂起的超时。
 *
 * Settle when `promise` does, or after `ms` — whichever comes first.
 *
 * The timer is always cleared, so a fast image leaves no pending timeout behind.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), ms);
    const settle = (): void => {
      clearTimeout(timer);
      resolve();
    };
    void promise.then(settle, settle);
  });
}

/** 等待排版所依赖的字体。 / Wait for the fonts the layout depends on. */
export async function waitForFonts(): Promise<void> {
  const ready = document.fonts?.ready;
  if (!ready) return;
  // `document.fonts.ready` resolves once layout is complete and no further font loads are
  // needed (https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready). The timeout
  // is a guard against a font request that never settles.
  await withTimeout(ready, PRINT_FONT_TIMEOUT_MS);
}

/** 等待一张图片可被绘制。 / Wait for one image to be paintable. */
export async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    // `decode()` "resolves once the image is decoded and is safe to be appended to the DOM"
    // and rejects on a broken image (https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).
    // A rejection is not a reason to stop: there is nothing left to wait for.
    await withTimeout(image.decode().catch(() => undefined), PRINT_IMAGE_TIMEOUT_MS);
    return;
  }

  if (image.complete) return;

  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    };
    const timer = setTimeout(finish, PRINT_IMAGE_TIMEOUT_MS);
    image.addEventListener("load", finish);
    image.addEventListener("error", finish);
  });
}

/** 等待 `root` 下的每一个 `<img>`。 / Wait for every `<img>` under `root`. */
export async function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map((image) => waitForImage(image)));
}

/**
 * 注入（或刷新）那唯一一份打印样式表。
 *
 * 一个带稳定 id 的元素，反复复用：打印两次的使用方，或同一页面上的两个编辑器，都无法累积
 * 样式表，而最后打印的那个编辑器就是文档打印时所用页面设置的来源。
 *
 * Inject (or refresh) the single print stylesheet.
 *
 * One element with a stable id, reused: a host that prints twice, or two editors in one page,
 * cannot accumulate stylesheets, and the last editor to print is the one whose page setup the
 * document is printed with.
 */
export function injectPrintStyles(css: string): HTMLStyleElement {
  const existing = document.getElementById(PRINT_STYLE_ELEMENT_ID);

  if (existing instanceof HTMLStyleElement) {
    existing.textContent = css;
    return existing;
  }

  const style = document.createElement("style");
  style.id = PRINT_STYLE_ELEMENT_ID;
  style.setAttribute("data-print-styles", "true");
  style.textContent = css;
  document.head.append(style);
  return style;
}

/**
 * 为一篇混合纸张的文档构造警告，取自已经构建好的样式表。
 *
 * Build the warning for a mixed document, from the stylesheet that was already built.
 */
export function mixedPageSetupWarning(
  pages: PrintPageSetup[],
  result: PrintStylesResult
): PrintWarning {
  const used = usedSetup(pages);

  const differingPages = result.pageSizes
    .map((size, index) => ({ index: index + 1, size }))
    .filter(({ size }) => size.width !== result.size.width || size.height !== result.size.height);

  return {
    code: "mixed-page-setup",
    message:
      "文档中各页的纸张大小或方向不一致，浏览器只能按第一页的纸张打印；其余页面会按同一纸张重新排版。",
    used: {
      paperFormat: used.paperFormat,
      orientation: used.orientation,
      size: result.size
    },
    differingPages
  };
}

/**
 * 打印文档。
 *
 * 普通失败绝不抛出：调用它的命令在工作完成之前就返回了，所以失败唯一能去的地方是
 * `options.onError`。
 *
 * Print the document.
 *
 * Never throws for an ordinary failure: the command that calls this returns before the work
 * is done, so the only place a failure can go is `options.onError`.
 */
export async function runPrint(editor: Editor, options: PrintExtensionOptions): Promise<void> {
  const pages = withOptionOverrides(collectPageSetups(editor.state.doc), options);

  const styles = buildPrintStyles({
    pages,
    margins: options.margins,
    marginBoxes: options.marginBoxes === true,
    pageSelector: options.pageSelector,
    paperSelector: options.paperSelector,
    hiddenSelectors: options.hiddenSelectors
  });

  injectPrintStyles(styles.css);

  if (styles.mixed) {
    // Reported, not fatal. See the module comment.
    options.onWarning?.(mixedPageSetupWarning(pages, styles));
  }

  // A clone rather than a move: the live document keeps every page exactly where ProseMirror left
  // it, which is what makes taking the container back out of the document a no-op for the editor.
  // Mounted before the waits below, because the clone — not the live editor — is what is printed,
  // so its fonts and images are the ones that have to be ready.
  const editorRoot = editor.view.dom;
  const printRoot = mountPrintRoot(
    resolvePrintSource(editorRoot),
    collectPrintPages(editorRoot, options.pageSelector)
  );

  await waitForFonts();

  // Waited for on the clone: these are the `<img>` elements that will actually be printed —
  // including an image watermark, which is a decoration inside a page and therefore travelled into
  // the clone with it — and one that has not decoded prints as an empty box.
  await waitForImages(printRoot.container);

  await options.onBeforePrint?.();

  const previousTitle = document.title;
  if (options.documentTitle !== undefined && options.documentTitle.length > 0) {
    document.title = options.documentTitle;
  }

  let settled = false;
  const finish = (): void => {
    if (settled) return;
    settled = true;
    window.removeEventListener("afterprint", finish);
    printRoot.remove();
    if (options.documentTitle !== undefined && options.documentTitle.length > 0) {
      document.title = previousTitle;
    }
    options.onAfterPrint?.();
  };

  // `afterprint` fires **whether or not the user actually printed** (react-to-print documents
  // this explicitly), and on newer Safari it can fire *before* `print()` returns — so the
  // container is removed, the title restored and `onAfterPrint` called from both the listener and
  // the `finally`, with a flag making the pair idempotent. It is also what removes the clone when
  // the user cancels the dialog. (`window.print()` is documented as blocking while the dialog is
  // open, but that is no longer reliable on newer Safari.)
  window.addEventListener("afterprint", finish, { once: true });

  try {
    window.print();
  } finally {
    finish();
  }
}
