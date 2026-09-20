/**
 * The `print` extension — native `@media print` in the editor's own document.
 *
 * No iframe, no `window.open`, no dependency (approved decision 5). The legacy
 * `browserPrint.ts` built a `display: none` iframe and wrote a copy of the pages into it,
 * which is a *new document*: the application's stylesheets are not there, `<link
 * media="screen">` rules are dropped, fonts and images have to be waited for all over again,
 * and the user's "Background graphics" and "Headers and footers" checkboxes decide the rest.
 * Printing the live document removes every one of those failure modes.
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

/** Re-export the contract and the pure helpers, so a host has one import. */
export type {
  PrintExtensionOptions,
  PrintPageSetup,
  PrintWarning
} from "./typing";
export type { PrintOptions } from "../../typings/editor";
export {
  buildPrintStyles,
  formatMargins,
  isZeroLength,
  PRINT_DEFAULT_SETUP,
  PRINT_HIDDEN_ATTRIBUTE,
  PRINT_HIDDEN_SELECTOR,
  PRINT_MARGIN_BOX_RESERVE,
  PRINT_PAGE_SELECTOR,
  PRINT_PAPER_SELECTOR,
  PRINT_STYLE_ELEMENT_ID,
  PRINT_ZERO_MARGINS,
  resolvePrintMargins
} from "./styles";
export type { PrintStylesInput, PrintStylesResult } from "./styles";
/**
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

/** The `print` extension. */
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
      /** Print the document. */
      printDocument,

      /**
       * The same command under the name the component's exposed API uses.
       *
       * Aliased rather than re-implemented, so there is exactly one pipeline.
       */
      print: printDocument
    };
  }
});

/** The commands the extension adds. */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    print: {
      /** Print the document through the browser's own dialog. `false` when there is no DOM. */
      printDocument: () => ReturnType;

      /** Alias of {@link Commands.print.printDocument}, for `SEditorExposed.print()`. */
      print: () => ReturnType;
    };
  }
}

/** The default export, so `import Print from "./print"` also works. */
export default Print;
