/**
 * The DOM-facing half of printing.
 *
 * ## The pipeline
 *
 * 1. read the document's own page setup and turn it into one `@media print` block;
 * 2. inject that block into the editor's own `<head>` — a single `<style>` element, reused
 *    on every print, never an iframe and never a new window, so the print snapshot is the
 *    live document with the application's stylesheets, fonts and images already applied;
 * 3. wait for `document.fonts.ready` and for every `<img>` in the editor, because a print
 *    snapshot taken before a web font swaps shows the fallback metrics and reflows every
 *    page (the legacy extension waited for nothing — defect 35);
 * 4. run `onBeforePrint`, set `document.title` so "Save as PDF" proposes a sensible file
 *    name, call `window.print()`;
 * 5. restore the title and run `onAfterPrint` on `afterprint`.
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
import type { PrintExtensionOptions, PrintPageSetup, PrintWarning } from "./typing";

/**
 * How long to wait for one image.
 *
 * A broken image never fires `load` *or* `error` in every engine, and a `data:` URL decoder
 * that has stalled should not be able to hang the print dialog forever.
 */
export const PRINT_IMAGE_TIMEOUT_MS = 3000;

/** How long to wait for `document.fonts.ready`. */
export const PRINT_FONT_TIMEOUT_MS = 3000;

/** `true` when there is a DOM to print. The extension is SSR-safe, so this is checked. */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Narrow an unknown value to a non-null object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a paper format attribute, accepting a named size or a custom `{ width, height }`. */
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

/** The setup `@page` will actually declare: the first page's. */
export function usedSetup(pages: PrintPageSetup[]): Required<PrintPageSetup> {
  const first = pages[0];
  return {
    paperFormat: first?.paperFormat ?? PRINT_DEFAULT_SETUP.paperFormat,
    orientation: first?.orientation ?? PRINT_DEFAULT_SETUP.orientation
  };
}

/**
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

/** Wait for the fonts the layout depends on. */
export async function waitForFonts(): Promise<void> {
  const ready = document.fonts?.ready;
  if (!ready) return;
  // `document.fonts.ready` resolves once layout is complete and no further font loads are
  // needed (https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready). The timeout
  // is a guard against a font request that never settles.
  await withTimeout(ready, PRINT_FONT_TIMEOUT_MS);
}

/** Wait for one image to be paintable. */
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

/** Wait for every `<img>` under `root`. */
export async function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map((image) => waitForImage(image)));
}

/**
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

/** Build the warning for a mixed document, from the stylesheet that was already built. */
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

  // The image wait runs against the editor's own DOM, which also covers the watermark's
  // `<img>` (it is a decoration inside a page) — so an image watermark is fully loaded
  // before the snapshot is taken.
  await waitForFonts();
  await waitForImages(editor.view.dom);

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
    if (options.documentTitle !== undefined && options.documentTitle.length > 0) {
      document.title = previousTitle;
    }
    options.onAfterPrint?.();
  };

  // `afterprint` fires **whether or not the user actually printed** (react-to-print documents
  // this explicitly), and on newer Safari it can fire *before* `print()` returns — so the
  // title is restored and `onAfterPrint` is called from both the listener and the `finally`,
  // with a flag making the pair idempotent. (`window.print()` is documented as blocking while
  // the dialog is open, but that is no longer reliable on newer Safari.)
  window.addEventListener("afterprint", finish, { once: true });

  try {
    window.print();
  } finally {
    finish();
  }
}
