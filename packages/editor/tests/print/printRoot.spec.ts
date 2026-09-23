// @vitest-environment happy-dom
/**
 * 打印克隆：容器、它的样式表，以及 `runPrint` 的挂载与摘除。
 *
 * 缺陷 43：点「打印」印出来的是整个 Web 页面，而不是编辑器自己的纸张。这套测试钉住的是那条链 ——
 * 纸张进容器、容器成为 `<body>` 下唯一可见的孩子、打印结束后容器连同它那次打印专属的样式表一起
 * 消失。最后一环本身也是缺陷：把那条隐藏规则留在文档里，之后一次直接按 Ctrl+P 就会印出一张白纸。
 *
 * 这里不真的打印：`window.print()` 被换成一个记录器，并且在**它内部**检查 DOM 状态，那正是浏览器
 * 取快照的时刻。`runPrint` 之前的部分都是纯函数，按普通字符串 / DOM 变换断言。
 *
 * The print clone: the container, its stylesheet, and `runPrint`'s mount and removal.
 *
 * Defect 43: clicking print put the entire web page on paper instead of the editor's own sheets.
 * These tests pin the chain — the sheets go into the container, the container becomes the only
 * visible `<body>` child, and when printing ends the container is gone together with the
 * stylesheet that belonged to that one print. That last link is itself a defect: leaving the
 * hiding rule behind makes the next bare Ctrl+P print a blank sheet.
 *
 * Printing is never called for real: `window.print()` is replaced by a recorder, and the DOM is
 * inspected *inside* it — the moment the browser takes its snapshot. Everything before `runPrint`
 * is pure, and asserted as a plain string / DOM transformation.
 */

import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { runPrint } from "../../src/extensions/print/printDocument";
import {
  collectPrintPages,
  createPrintRoot,
  mountPrintRoot,
  resolvePrintSource
} from "../../src/extensions/print/printRoot";
import {
  buildPrintRootStyles,
  PRINT_ROOT_CLASS,
  PRINT_ROOT_SELECTOR,
  PRINT_STYLE_ELEMENT_ID
} from "../../src/extensions/print/styles";

afterEach(() => {
  // happy-dom implements neither of the two browser APIs this suite stubs.
  Reflect.deleteProperty(window, "print");
  document.getElementById(PRINT_STYLE_ELEMENT_ID)?.remove();
  document.head.querySelector("[data-print-root-styles]")?.remove();
  document.body.innerHTML = "";
  document.title = "";
});

/**
 * 一个 `page` 节点的属性，按 `readPageSetup` 读取它们的方式书写。
 *
 * One `page` node's attributes, as `readPageSetup` reads them.
 */
interface FakePage {
  paperFormat?: string;
  orientation?: string;
}

/**
 * 被测编辑器，外加断言需要的两个元素。
 *
 * The editor under test plus the two elements an assertion needs.
 */
interface FakeEditor {
  editor: Editor;
  content: HTMLElement;
  shell: HTMLElement;
}

/**
 * 一份带 `pages.length` 张纸的文档，挂在一个宿主页面自己的外壳里。
 *
 * 那个外壳正是缺陷 43 的要点：它是 `<body>` 的孩子，过去会跟着文档一起印出来。
 *
 * A document with one sheet per entry in `pages`, mounted inside a host page's own shell.
 *
 * The shell is the point of defect 43: it is a body child that used to print along with the
 * document.
 */
function buildEditor(pages: FakePage[]): FakeEditor {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = '<aside class="app-sidebar">the host application</aside>';
  document.body.append(shell);

  const root = document.createElement("div");
  root.className = "s-editor s-editor-scope";
  shell.append(root);

  const content = document.createElement("div");
  content.className = "tiptap ProseMirror";
  root.append(content);

  pages.forEach((_page, index) => {
    const element = document.createElement("section");
    element.className = "s-editor-page";
    element.dataset.index = String(index + 1);
    // The node view sizes the sheet inline; a clone must keep it.
    element.style.width = "210mm";
    element.textContent = `page ${index + 1}`;
    content.append(element);
  });

  // Only the two members `runPrint` reads: the ProseMirror doc's `descendants`, and the editor's
  // DOM root.
  const doc = {
    descendants(
      callback: (node: { type: { name: string }; attrs: Record<string, unknown> }) => boolean
    ): void {
      pages.forEach((page) => callback({ type: { name: "page" }, attrs: { ...page } }));
    }
  };

  return {
    editor: { state: { doc }, view: { dom: content } } as unknown as Editor,
    content,
    shell
  };
}

/**
 * 某一次打印挂上的那份样式表，如果它还在文档里的话。
 *
 * The stylesheet one print mounted, if it is still in the document.
 */
function mountedRootStyles(): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>("[data-print-root-styles]");
}

describe("the container's stylesheet", () => {
  it("hides the container on screen", () => {
    const css = buildPrintRootStyles();
    const screenRule = new RegExp(`\\.${PRINT_ROOT_CLASS}\\s*\\{[^}]*display:\\s*none !important;`);
    expect(css).toMatch(screenRule);
  });

  it("makes the container the only visible body child in print", () => {
    const css = buildPrintRootStyles();
    const mediaAt = css.indexOf("@media print");
    expect(mediaAt).toBeGreaterThan(-1);

    // The hiding rule is inside the media query, and it excludes the container by name.
    const hideAt = css.indexOf(`body > *:not(${PRINT_ROOT_SELECTOR})`);
    expect(hideAt).toBeGreaterThan(mediaAt);
    expect(css.slice(hideAt)).toMatch(/display:\s*none !important;/);

    // The reverse rule has to be *more* specific than the one above, or the container would be
    // hidden by the rule that exists to hide everything except it.
    expect(css).toContain(`body > ${PRINT_ROOT_SELECTOR} {`);
    expect(css).toMatch(
      new RegExp(`body > \\.${PRINT_ROOT_CLASS}\\s*\\{[^}]*display:\\s*block !important;`)
    );
  });

  it("never uses `visibility: hidden`, which leaves blank sheets behind", () => {
    expect(buildPrintRootStyles()).not.toContain("visibility");
  });

  it("carries the document's own typography and colour onto the clone", () => {
    // The line height lives on `.s-editor-content .tiptap` on screen, and the clone is no longer
    // inside `.s-editor-content`; losing it would re-space the pagination the editor computed.
    const css = buildPrintRootStyles();
    expect(css).toMatch(/line-height:\s*var\(--se-line-height-body\)/);
    expect(css).toMatch(/font-family:\s*var\(--se-font-family-body\)/);
    expect(css).toMatch(/font-size:\s*var\(--se-font-size-body\)/);
    expect(css).toMatch(/print-color-adjust:\s*exact/);
  });

  it("does not let the copied editor classes clip the sheets", () => {
    // `.s-editor` is a flex column with `height: 100%` and `overflow: hidden`; the container
    // inherits that class list, so the print rule has to undo it.
    const css = buildPrintRootStyles();
    expect(css).toMatch(/height:\s*auto !important/);
    expect(css).toMatch(/overflow:\s*visible !important/);
  });
});

describe("finding the theme's element", () => {
  it("resolves the nearest editor scope, which is where the theme is declared", () => {
    const { editor, content } = buildEditor([{}]);
    expect(resolvePrintSource(content)).toBe(editor.view.dom.closest(".s-editor-scope"));
  });

  it("falls back to the editor element without the component's scope wrapper", () => {
    const bare = document.createElement("div");
    bare.className = "tiptap ProseMirror";
    expect(resolvePrintSource(bare)).toBe(bare);
  });
});

describe("collecting the sheets", () => {
  it("returns the editor's own pages, in document order", () => {
    const { content } = buildEditor([{}, {}]);
    const texts = collectPrintPages(content).map((page) => page.textContent);
    expect(texts).toStrictEqual(["page 1", "page 2"]);
  });

  it("never reaches another editor's pages elsewhere in the document", () => {
    const { content } = buildEditor([{}]);
    const other = document.createElement("section");
    other.className = "s-editor-page";
    other.textContent = "somebody else's page";
    document.body.append(other);

    const pages = collectPrintPages(content);
    expect(pages).toHaveLength(1);
    expect(pages[0]).not.toBe(other);
    expect(pages.map((page) => page.textContent)).toStrictEqual(["page 1"]);
  });

  it("follows a configured page selector", () => {
    const { content } = buildEditor([{}]);
    content.querySelector(".s-editor-page")?.setAttribute("data-page", "");

    expect(collectPrintPages(content, "[data-page]")).toHaveLength(1);
    expect(collectPrintPages(content, "[data-page]")[0].hasAttribute("data-page")).toBe(true);
  });

  it("falls back to the editor's content when there is no page container at all", () => {
    const { content } = buildEditor([]);
    expect(collectPrintPages(content)).toStrictEqual([content]);
  });
});

describe("building the container", () => {
  it("adds its own class and copies the editor root's class list", () => {
    const { content, editor } = buildEditor([{}]);
    const container = createPrintRoot(resolvePrintSource(content), collectPrintPages(content));

    expect(container.classList.contains(PRINT_ROOT_CLASS)).toBe(true);
    expect(container.classList.contains("s-editor-scope")).toBe(true);
    expect(container.classList.contains("s-editor")).toBe(true);
    expect(container).not.toBe(editor.view.dom);
  });

  it("deep-clones the sheets, inline geometry included, and leaves the originals", () => {
    const { content } = buildEditor([{}, {}]);
    const originals = collectPrintPages(content);
    const container = createPrintRoot(resolvePrintSource(content), originals);

    const clones = Array.from(container.querySelectorAll<HTMLElement>(".s-editor-page"));
    expect(clones).toHaveLength(2);
    expect(clones[0]).not.toBe(originals[0]);
    // The node view sizes each sheet with an inline style; `cloneNode(true)` has to keep it.
    expect(clones[0].getAttribute("style")).toContain("210mm");

    // A copy, not a move: editing it cannot disturb the live document, and the live document still
    // holds every page.
    clones[0].textContent = "changed";
    expect(originals[0].textContent).toBe("page 1");
    expect(content.querySelectorAll(".s-editor-page")).toHaveLength(2);
  });
});

describe("mounting the container", () => {
  it("appends the container to `<body>` and its stylesheet to `<head>`", () => {
    const { content } = buildEditor([{}]);
    const mounted = mountPrintRoot(resolvePrintSource(content), collectPrintPages(content));

    expect(mounted.container.parentElement).toBe(document.body);
    expect(mounted.container.firstElementChild?.classList.contains("s-editor-page")).toBe(true);
    expect(mountedRootStyles()?.textContent).toContain(PRINT_ROOT_SELECTOR);
  });

  it("takes both back out, and is safe to call twice", () => {
    const { content } = buildEditor([{}]);
    const mounted = mountPrintRoot(resolvePrintSource(content), collectPrintPages(content));

    mounted.remove();
    mounted.remove();

    expect(mounted.container.parentElement).toBeNull();
    expect(mountedRootStyles()).toBeNull();
  });
});

describe("runPrint", () => {
  it("hands the browser a body whose only visible child is the clone", async () => {
    const { editor, content, shell } = buildEditor([
      { paperFormat: "A5", orientation: "landscape" }
    ]);
    let isBodyChild = false;
    let containerClasses: string[] = [];
    let clonedPages = 0;
    let hostShellStillMounted = false;
    let calls = 0;

    window.print = () => {
      calls += 1;
      const container = document.body.querySelector(`.${PRINT_ROOT_CLASS}`);
      isBodyChild = container?.parentElement === document.body;
      containerClasses = container ? Array.from(container.classList) : [];
      clonedPages = container ? container.querySelectorAll(".s-editor-page").length : 0;
      // The host page is not rewritten, only hidden by the stylesheet mounted with the clone; it
      // must still be exactly where it was.
      hostShellStillMounted = shell.parentElement === document.body;
    };

    await runPrint(editor, { onError: () => undefined });

    expect(calls).toBe(1);
    expect(isBodyChild).toBe(true);
    expect(containerClasses).toStrictEqual([PRINT_ROOT_CLASS, "s-editor", "s-editor-scope"]);
    expect(clonedPages).toBe(1);
    expect(hostShellStillMounted).toBe(true);

    // The `@page` size comes from the document's own page setup, not from a hardcoded A4.
    const printStyles = document.getElementById(PRINT_STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(printStyles).toContain("size: 210mm 148mm;");

    // Everything this print added is gone again.
    expect(document.body.querySelector(`.${PRINT_ROOT_CLASS}`)).toBeNull();
    expect(mountedRootStyles()).toBeNull();
    expect(content.querySelectorAll(".s-editor-page")).toHaveLength(1);
  });

  it("removes the clone when the dialog closes before `print()` returns", async () => {
    const { editor } = buildEditor([{}]);
    let afterPrints = 0;

    // Newer Safari can fire `afterprint` while `print()` is still running.
    window.print = () => {
      window.dispatchEvent(new Event("afterprint"));
    };

    await runPrint(editor, { onError: () => undefined, onAfterPrint: () => (afterPrints += 1) });

    expect(document.body.querySelector(`.${PRINT_ROOT_CLASS}`)).toBeNull();
    expect(mountedRootStyles()).toBeNull();
    // The listener and the `finally` both run `finish`; the callback still fires exactly once.
    expect(afterPrints).toBe(1);
  });

  it("removes the clone even when the dialog itself throws", async () => {
    const { editor } = buildEditor([{}]);
    window.print = () => {
      throw new Error("the print dialog failed");
    };

    const attempt = runPrint(editor, { onError: () => undefined });
    await expect(attempt).rejects.toThrow("the print dialog failed");

    expect(document.body.querySelector(`.${PRINT_ROOT_CLASS}`)).toBeNull();
    expect(mountedRootStyles()).toBeNull();
  });

  it("suggests the document title and restores it", async () => {
    const { editor } = buildEditor([{}]);
    document.title = "宿主页面";
    let duringPrint = "";

    window.print = () => {
      duringPrint = document.title;
    };

    await runPrint(editor, { onError: () => undefined, documentTitle: "合同 A" });

    expect(duringPrint).toBe("合同 A");
    expect(document.title).toBe("宿主页面");
  });

  it("prints a document with no page container at all rather than nothing", async () => {
    const { editor, content } = buildEditor([]);
    let clonedChildren = -1;

    window.print = () => {
      clonedChildren = document.body.querySelector(`.${PRINT_ROOT_CLASS}`)?.children.length ?? -1;
    };

    await runPrint(editor, { onError: () => undefined });

    expect(clonedChildren).toBe(1);
    expect(document.body.querySelector(`.${PRINT_ROOT_CLASS}`)).toBeNull();
    expect(content.parentElement).not.toBeNull();
  });
});
