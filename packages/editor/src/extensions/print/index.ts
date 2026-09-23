/**
 * `print` 扩展 —— 打印编辑器自己的纸张，别的一概不印。
 *
 * 没有 iframe、没有 `window.open`、没有依赖（已批准的决策 5）。旧的 `browserPrint.ts` 造了一个
 * `display: none` 的 iframe 并把页面副本写进去，那是一个*新文档*：应用的样式表不在那里，
 * `<link media="screen">` 规则被丢弃，字体和图片必须从头再等一遍，剩下的由用户的「背景图形」
 * 与「页眉和页脚」复选框决定。这里拷贝的是**同一份文档**里的纸张，所以样式表、字体和图片都已
 * 就位，上述失败模式一个都不成立。
 *
 * 只在实时文档上打补丁还不够：打印对话框渲染整个文档，宿主的侧边栏、工具栏会跟着一起印出来
 * （缺陷 43）。所以纸张被搬进一个只为打印而存在的容器，它成了打印时 `<body>` 下唯一可见的孩子
 * —— 见 `printRoot.ts` 与 `buildPrintRootStyles()`。
 *
 * ## 两条命令
 *
 * - `printDocument()` —— 真正的名字。
 * - `print()` —— 顶层组件对外 API（`SEditorExposed.print`）调用的别名，
 *   这样组件不必知道是哪个扩展实现了打印。
 *
 * 两者都在流水线被*接受*后立刻返回 `true`：字体和图片必须等待，所以工作无法在一个
 * 同步命令内完成。需要知道它何时完成（或失败）的使用方改用 `onAfterPrint`/`onError`。
 *
 * ## 一处有意保留的注意事项
 *
 * 直接按浏览器 Ctrl+P 不会走这条流水线，那样打印出来的文档只会拿到主题里静态的
 * `@media print` 规则，而拿不到生成的 `@page` 块。使用方应把自身的打印快捷键/菜单路由到
 * `editor.commands.printDocument()`。（理论上扩展可以用全局 `beforeprint` 监听器自我武装，
 * 但监听器是按窗口的，同一个页面上有两个编辑器时赢的会是错误的那个 —— 静默地、
 * 且只是偶尔发生，这比一条有文档说明的限制更糟。）
 *
 * The `print` extension — it prints the editor's own sheets and nothing else.
 *
 * No iframe, no `window.open`, no dependency (approved decision 5). The legacy
 * `browserPrint.ts` built a `display: none` iframe and wrote a copy of the pages into it,
 * which is a *new document*: the application's stylesheets are not there, `<link
 * media="screen">` rules are dropped, fonts and images have to be waited for all over again,
 * and the user's "Background graphics" and "Headers and footers" checkboxes decide the rest.
 * The copy here is taken from the **same document**, so the stylesheets, fonts and images are
 * already in effect and not one of those failure modes applies.
 *
 * Patching the live document alone is not enough either: the print dialog renders the whole
 * document, so the host's sidebar and toolbars print with it (defect 43). The sheets are therefore
 * moved into a container that exists only to be printed, and it becomes the only visible `<body>`
 * child while printing — see `printRoot.ts` and `buildPrintRootStyles()`.
 *
 * ## The two commands
 *
 * - `printDocument()` — the real name.
 * - `print()` — the alias the top-level component's exposed API
 *   (`SEditorExposed.print`) calls, so the component does not have to know which extension
 *   implements printing.
 *
 * Both return `true` as soon as the pipeline has been *accepted*: fonts and images have to be
 * awaited, so the work cannot finish inside a synchronous command. A host that needs to know
 * when it completed (or failed) uses `onAfterPrint`/`onError`.
 *
 * ## One caveat, deliberately left in
 *
 * A bare browser Ctrl+P does not run this pipeline, so a document printed that way gets the
 * theme's static `@media print` rules and not the generated `@page` block. A host should
 * route its own print shortcut/menu to `editor.commands.printDocument()`. (Arguably the
 * extension could arm itself from a global `beforeprint` listener, but a listener is
 * per-window, so with two editors on one page the wrong editor's sheet would win — silently
 * and only sometimes, which is worse than a documented limitation.)
 */

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";

import { isBrowser, runPrint } from "./printDocument";
import type { PrintExtensionOptions } from "./typing";

/**
 * 重新导出契约与纯函数助手，让使用方只需一处导入。
 *
 * Re-export the contract and the pure helpers, so a host has one import.
 */
export type {
  PrintExtensionOptions,
  PrintPageSetup,
  PrintWarning
} from "./typing";
export type { PrintOptions } from "../../typings/editor";
export {
  buildPrintRootStyles,
  buildPrintStyles,
  formatMargins,
  isZeroLength,
  PRINT_DEFAULT_SETUP,
  PRINT_HIDDEN_ATTRIBUTE,
  PRINT_HIDDEN_SELECTOR,
  PRINT_MARGIN_BOX_RESERVE,
  PRINT_PAGE_SELECTOR,
  PRINT_PAPER_SELECTOR,
  PRINT_ROOT_CLASS,
  PRINT_ROOT_SELECTOR,
  PRINT_STYLE_ELEMENT_ID,
  PRINT_ZERO_MARGINS,
  resolvePrintMargins
} from "./styles";
export type { PrintStylesInput, PrintStylesResult } from "./styles";
/**
 * 打印流水线自己的助手。
 *
 * `readPageSetup` 与 `readPaperFormat` 有意**不**在这里重新导出。页面扩展自己导出了一个
 * `readPaperFormat`，而 `src/index.ts` 用 `export *` 同时重新导出两个 barrel，于是两个同名的
 * 星号导出构成歧义错误，而不是后者覆盖前者。它们仍从 `printDocument.ts` 导出，供需要它们的
 * 使用方使用。
 *
 * The print pipeline's own helpers.
 *
 * `readPageSetup` and `readPaperFormat` are deliberately **not** re-exported here. The page
 * extension exports a `readPaperFormat` of its own, and `src/index.ts` re-exports both barrels
 * with `export *`, so two same-named star exports are an ambiguity error rather than a
 * last-one-wins. They remain exported from `printDocument.ts` for a consumer that needs them.
 */
export {
  collectPageSetups,
  injectPrintStyles,
  isBrowser,
  mixedPageSetupWarning,
  PRINT_FONT_TIMEOUT_MS,
  PRINT_IMAGE_TIMEOUT_MS,
  runPrint,
  usedSetup,
  waitForFonts,
  waitForImage,
  waitForImages,
  withOptionOverrides,
  withTimeout
} from "./printDocument";

/**
 * 克隆容器自己的助手。
 *
 * 只有想把打印结果自己放到别处（导出、预览）的使用方需要它们；`runPrint` 已经在流水线里调用了
 * 同一批函数。
 *
 * The clone container's own helpers.
 *
 * Only a host that wants the printable copy somewhere else (an export, a preview) needs them;
 * `runPrint` already calls the same functions inside the pipeline.
 */
export {
  collectPrintPages,
  createPrintRoot,
  mountPrintRoot,
  resolvePrintSource
} from "./printRoot";
export type { MountedPrintRoot } from "./printRoot";

/** `print` 扩展。 / The `print` extension. */
export const Print = Extension.create<PrintExtensionOptions>({
  name: "print",

  addOptions() {
    return {
      // `undefined` rather than a value: these three are documented as defaulting to *the
      // document's own page setup*, and a concrete default here would silently override it.
      paperFormat: undefined,
      orientation: undefined,
      margins: undefined,
      marginBoxes: false,
      documentTitle: undefined,
      onBeforePrint: undefined,
      onAfterPrint: undefined,
      hiddenSelectors: [],
      pageSelector: undefined,
      paperSelector: undefined,
      onWarning: undefined,
      onError: (error: unknown) => {
        console.error("[snail] printing failed", error);
      }
    };
  },

  addCommands() {
    const extension = this;

    /**
     * 接受一次打印请求并运行流水线。
     *
     * 没有 DOM 时（SSR 渲染或测试环境）返回 `false`，这与其他命令表达「此处无法完成」的契约
     * 一致。
     *
     * Accept a print request and run the pipeline.
     *
     * `false` when there is no DOM (an SSR render, or a test environment), which is the same
     * contract the other commands use for "this cannot be done here".
     */
    const printDocument = () => ({ editor }: { editor: Editor }) => {
      if (!isBrowser()) return false;

      // The promise is deliberately not awaited — a Tiptap command is synchronous — but it is
      // also never left dangling: every rejection is routed to `onError`.
      void runPrint(editor, extension.options).catch((error: unknown) => {
        extension.options.onError(error);
      });

      return true;
    };

    return {
      /** 打印文档。 / Print the document. */
      printDocument,

      /**
       * 同一条命令，用组件对外 API 使用的名字。
       *
       * 做成别名而不是重新实现，这样流水线有且只有一条。
       *
       * The same command under the name the component's exposed API uses.
       *
       * Aliased rather than re-implemented, so there is exactly one pipeline.
       */
      print: printDocument
    };
  }
});

/** 该扩展添加的命令。 / The commands the extension adds. */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    print: {
      /**
       * 用浏览器自带的对话框打印文档。没有 DOM 时返回 `false`。
       *
       * Print the document through the browser's own dialog. `false` when there is no DOM.
       */
      printDocument: () => ReturnType;

      /**
       * 供 `SEditorExposed.print()` 使用的别名，指向 {@link Commands.print.printDocument}。
       *
       * Alias of {@link Commands.print.printDocument}, for `SEditorExposed.print()`.
       */
      print: () => ReturnType;
    };
  }
}

/**
 * 默认导出，因此 `import Print from "./print"` 同样可用。
 *
 * The default export, so `import Print from "./print"` also works.
 */
export default Print;
