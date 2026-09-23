// @vitest-environment happy-dom
/**
 * A real mount of `SEditor` — the check that the starter document actually reaches the paper.
 *
 * ## Why a DOM test exists in a package that tests in plain Node
 *
 * Every other test here covers a *pure* rule, and the suite deliberately runs in `environment: "node"`
 * so those rules are exercised without a browser. This file is the documented exception, because the
 * bug it guards against is invisible to every pure test and to every static assertion:
 *
 * > `SEditor` built its editor content from `props.doc` — the deprecated alias — while the public
 * > contract is `modelValue`. `v-model` was therefore never read, and every caller (including the
 * > documentation site's demos) opened an *empty* document: one blank paragraph, no error, and
 * > nothing in the DOM to explain it.
 *
 * A second bug fell out of writing it: mounting surfaced `Failed to resolve component: el-switch /
 * el-option / el-divider / …`, i.e. five panels using Element Plus controls whose components were
 * never imported. `tests/editor/elementImports.spec.ts` now audits that at the source level, and this
 * test would fail loudly if a control stopped resolving again.
 *
 * ## The mounts are kept cheap on purpose
 *
 * A full editor (Element Plus + Tiptap + the pagination pass) is slow under a simulated DOM, and the
 * paginator schedules itself every animation frame. The content assertions therefore mount with no
 * toolbar and with automatic pagination off, and one test mounts the default configuration to check
 * the toolbar.
 */

import { createApp, h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SEditor } from "../../src/index";
import { createStarterDocument, STARTER_QR_TEXT } from "../../src/editor/starter";

/** Mount options that keep a mount fast: no ribbon, no scheduled pagination pass. */
interface MountOptions {
  /** Omit to use the component's own default sections; `[]` for no ribbon at all. */
  tools?: readonly string[];
  /** `true` (default) turns the automatic pagination pass off, which is the slow part. */
  paginationOff?: boolean;
  /** `design` (default) or `fill`. */
  mode?: "design" | "fill";
  /** Fill values, keyed by variable key. */
  data?: Record<string, unknown>;
  /** The `template` prop, when the mount is about the template source. */
  template?: unknown;
}

const MOUNT_TIMEOUT = 30_000;

/** Mounts `SEditor` and hands back the host element and the exposed surface. */
async function mountEditor(
  modelValue: unknown,
  options: MountOptions = {}
): Promise<{
  host: HTMLElement;
  exposed: { getJSON?: () => unknown; getHTML?: () => string };
  unmount: () => void;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const props: Record<string, unknown> = { modelValue };
  // Omitted means "the component's default" — passing `[]` would hide the ribbon, and
  // `tools: undefined` is not the same thing as not passing the prop.
  if (options.tools !== undefined) props.tools = options.tools;
  if (options.paginationOff !== false) props.page = { pagination: false };
  if (options.mode !== undefined) props.mode = options.mode;
  if (options.data !== undefined) props.data = options.data;
  if (options.template !== undefined) props.template = options.template;

  const exposed = { getJSON: undefined as undefined | (() => unknown), getHTML: undefined as undefined | (() => string) };
  const app = createApp({
    render: () =>
      h(SEditor as never, {
        ...props,
        ref: (instance: unknown) => {
          exposed.getJSON = (instance as { getJSON?: () => unknown } | null)?.getJSON?.bind(instance);
          exposed.getHTML = (instance as { getHTML?: () => string } | null)?.getHTML?.bind(instance);
        }
      } as never)
  });
  app.mount(host);

  // The editor is created in `onMounted`, so the first paint happens a tick later.
  await nextTick();
  await nextTick();
  // Tiptap emits its `create` event from a zero-delay timer, and the runtime applies the `data`
  // prop in that handler — so the fill values only reach the paper after a macrotask. Waiting for
  // it is what a browser does by itself; without it the tests would read a half-initialised editor.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();

  return { host, exposed, unmount: () => app.unmount() };
}

const unmounts: Array<() => void> = [];

afterEach(() => {
  while (unmounts.length > 0) unmounts.pop()?.();
  document.body.innerHTML = "";
});

/** Mount, run the assertions, and always tear the editor down. */
async function withEditor(
  modelValue: unknown,
  run: (host: HTMLElement, exposed: { getJSON?: () => unknown; getHTML?: () => string }) => void,
  options: MountOptions = {}
): Promise<void> {
  const { host, exposed, unmount } = await mountEditor(modelValue, options);
  unmounts.push(unmount);
  run(host, exposed);
}

describe("SEditor mount", () => {
  it(
    "renders the document passed through `v-model`",
    async () => {
      await withEditor(createStarterDocument(), (host, exposed) => {
        // The paper, the body, and the starter document's own text.
        expect(host.querySelector(".s-editor-page")).not.toBeNull();
        const body = host.querySelector(".s-editor-page-content");
        expect(body, "the page body must exist").not.toBeNull();

        const text = body?.textContent ?? "";
        expect(text, "the starter title must be on the paper").toContain("技术服务合同");
        expect(text, "the level-2 clause must be on the paper").toContain("第一条");
        expect(text, "the variable's label must be on the paper").toContain("合同编号");
        expect(text, "the indented clause's prose must be on the paper").toContain("乙方向甲方提供");

        // Design mode is the *absence* of the fill class — that is what keeps the layout table's
        // dashed grid hints while the fill-mode rule removes them.
        expect(host.querySelector(".s-editor-fill")).toBeNull();

        /**
         * `getHTML()` is the `onChange` / `update:modelValue` / save-as-HTML path, and it *threw* for
         * every document containing a variable: `variable` is a leaf atom whose `renderHTML` used a
         * content hole, which ProseMirror refuses with
         * `RangeError: Content hole not allowed in a leaf node spec`. Typing still worked, so the only
         * symptom was a console error and a change event that never arrived.
         */
        const html = exposed.getHTML?.() ?? "";
        expect(html, "an exported document must render the variable's label").toContain("合同编号");
        expect(html, "and must carry the marker attribute").toContain('data-type="variable"');
      });
    },
    MOUNT_TIMEOUT
  );

  it(
    "renders no document text for an empty `modelValue`",
    async () => {
      // The mirror image: this is what the bug looked like from the outside — a page with one blank
      // paragraph — so the assertion above cannot pass by accident on an empty editor.
      await withEditor(undefined, (host) => {
        const body = host.querySelector(".s-editor-page-content");
        expect(body).not.toBeNull();
        expect(body?.textContent ?? "").toBe("");
      });
    },
    MOUNT_TIMEOUT
  );

  it(
    "carries the starter document's QR payload into the document",
    async () => {
      await withEditor(createStarterDocument(), (host, exposed) => {
        // The node view paints an `<img class="s-editor-qrcode">` and keeps the payload on the node,
        // so the document itself is what is checked for it.
        expect(host.querySelector("img.s-editor-qrcode")).not.toBeNull();

        const json = JSON.stringify(exposed.getJSON?.() ?? {});
        expect(json, "the QR payload must be in the document").toContain(STARTER_QR_TEXT);
      });
    },
    MOUNT_TIMEOUT
  );

  it(
    "paints a variable badge with a description / default / key tip in design mode",
    async () => {
      await withEditor(createStarterDocument(), (host) => {
        const badge = host.querySelector(".s-editor-variable");
        expect(badge, "the starter document has a variable").not.toBeNull();
        expect(badge?.textContent).toContain("合同编号");

        const tip = badge?.querySelector<HTMLElement>(".s-editor-variable-tip");
        expect(tip, "the badge carries a tip element").not.toBeNull();
        // The three rows the tip exists to show.
        expect(tip?.textContent).toContain("描述");
        expect(tip?.textContent).toContain("默认值");
        expect(tip?.textContent).toContain("key");
        expect(tip?.textContent).toContain("本合同在甲乙方系统中的编号");
        expect(tip?.textContent).toContain("SN-2026-0001");
        expect(tip?.textContent).toContain("contractNo");

        // Hidden until the pointer arrives, and the native `title` is gone — the tip replaces it.
        expect(tip?.hidden).toBe(true);
        expect(badge?.getAttribute("title")).toBeNull();
      });
    },
    MOUNT_TIMEOUT
  );

  it(
    "paints an unfilled variable as its name in fill mode, without a click-to-edit affordance",
    async () => {
      await withEditor(
        createStarterDocument(),
        (host) => {
          const badge = host.querySelector<HTMLElement>(".s-editor-variable");
          expect(badge, "the starter document has a variable").not.toBeNull();
          // The painted text is its own element, because the tip is a child of the badge.
          const content = badge?.querySelector(".s-editor-variable-content");
          // Unfilled in fill mode: the *name*, so the template still reads — not "(未填写)", and not
          // the template's `defaultValue` (which the tip still shows).
          expect(content?.textContent).toContain("合同编号");
          expect(content?.textContent).not.toContain("未填写");
          expect(content?.textContent).not.toContain("SN-2026-0001");
          expect(badge?.getAttribute("data-variable-empty")).toBe("true");
          expect(badge?.getAttribute("data-variable-mode")).toBe("fill");
          // "Nothing was filled, so the name is on screen" — the attribute fill mode's stylesheet
          // keys off, and which `data-variable-empty` alone cannot express.
          expect(badge?.getAttribute("data-variable-painted")).toBe("label");
        },
        { mode: "fill" }
      );
    },
    MOUNT_TIMEOUT
  );

  it(
    "paints the fill value once there is one",
    async () => {
      await withEditor(
        createStarterDocument(),
        (host) => {
          const badge = host.querySelector<HTMLElement>(".s-editor-variable");
          const content = badge?.querySelector(".s-editor-variable-content");
          expect(content?.textContent).toContain("HT-2026-0007");
          expect(badge?.getAttribute("data-variable-empty")).toBe("false");
          expect(badge?.getAttribute("data-variable-painted")).toBe("value");
        },
        { mode: "fill", data: { contractNo: "HT-2026-0007" } }
      );
    },
    MOUNT_TIMEOUT
  );

  it(
    "puts both halves of the selector that removes a layout table's lines into the fill-mode DOM",
    async () => {
      await withEditor(
        createStarterDocument(),
        (host) => {
          // The rule is `.s-editor-scope.s-editor-fill … tr.layout-mode`; a typo on either side
          // stops it matching silently, and the dashed design hint would survive into the finished
          // document. The stylesheet itself is asserted in `layoutTableStyle.spec.ts`.
          const scope = host.querySelector(".s-editor-scope.s-editor-fill");
          expect(scope, "fill mode must mark the editor root").not.toBeNull();

          const layoutRow = host.querySelector("tr.layout-mode");
          expect(layoutRow, "the starter layout table renders marked rows").not.toBeNull();
          expect(scope?.contains(layoutRow ?? null)).toBe(true);

          // The sample layout table is 2 × 4, and the last two columns are the fill-in positions:
          // one empty paragraph each, with no text node to paint.
          const cells = layoutRow?.querySelectorAll("td, th") ?? [];
          expect(cells).toHaveLength(4);
          expect(cells[1]?.textContent).toBe("");
          expect(cells[3]?.textContent).toBe("");
        },
        { mode: "fill" }
      );
    },
    MOUNT_TIMEOUT
  );

  it(
    "renders the toolbar with the default sections",
    async () => {
      // The one mount with the default sections: the ribbon, its tabs, and the two colour controls
      // that are drawn as Word's capital "A".
      const { host, unmount } = await mountEditor(createStarterDocument(), { paginationOff: true });
      unmounts.push(unmount);

      expect(host.querySelector(".s-editor-toolbar")).not.toBeNull();
      const tabs = host.querySelectorAll(".el-tabs__item");
      expect(tabs.length, "the default tool sections render as tabs").toBeGreaterThanOrEqual(6);

      // 模板 leads, before 格式: a template is chosen before anything is formatted.
      const labels = Array.from(tabs).map((tab) => tab.textContent?.trim() ?? "");
      expect(labels[0]).toBe("模板");
      expect(labels[1]).toBe("格式");
      // …and 水印 closes the default set, so the watermark section is reachable without naming it.
      expect(labels[labels.length - 1]).toBe("水印");

      // The colour controls exist and carry their variants (the glyph itself is CSS).
      expect(host.querySelector(".s-tool-font__color--text")).not.toBeNull();
      expect(host.querySelector(".s-tool-font__color--background")).not.toBeNull();

      // Each control is a real "A" plus a coloured bar, not a styled Element Plus trigger: the bar's
      // colour is on the element, with black/white as the defaults.
      const text = host.querySelector(".s-tool-font__color--text");
      expect(text?.querySelector(".s-tool-font__glyph")?.textContent).toBe("A");
      expect(text?.querySelector<HTMLElement>(".s-tool-font__bar")?.dataset.color).toBe("#000000");
      const background = host.querySelector(".s-tool-font__color--background");
      expect(background?.querySelector(".s-tool-font__glyph")?.textContent).toBe("A");
      expect(background?.querySelector<HTMLElement>(".s-tool-font__bar")?.dataset.color).toBe("#ffffff");
      // The invisible picker sits inside the control, so a click still opens the panel.
      expect(text?.querySelector(".s-tool-font__color-input")).not.toBeNull();
      expect(text?.querySelector(".s-tool-font__swatch")).not.toBeNull();
    },
    MOUNT_TIMEOUT
  );

  it(
    "opens the QR options dialog when the code is clicked in design mode",
    async () => {
      const { host, unmount } = await mountEditor(createStarterDocument());
      unmounts.push(unmount);

      const code = host.querySelector<HTMLElement>(".s-editor-qrcode");
      expect(code, "the starter document has a QR code").not.toBeNull();

      code?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      // The dialog is rendered by Vue, so the request from the node view needs a tick to become a
      // dialog — and it is appended to `<body>`, which is why the lookup is not scoped to `host`.
      await nextTick();
      await nextTick();

      const dialog = document.body.querySelector(".el-dialog");
      expect(dialog, "clicking the code opens its options").not.toBeNull();
      expect(dialog?.querySelector(".s-tool-qrcode"), "the dialog holds the QR form").not.toBeNull();

      // The starter document is one page, so the pick-list offers exactly 第一页. Element Plus
      // only mounts the option list when the dropdown is opened, so this reads the trigger's own
      // label — which is the same computed value the list would show.
      const pageSelect = dialog?.querySelector(".s-tool-qrcode__page");
      expect(pageSelect, "the dialog carries the page pick-list").not.toBeNull();
      expect(pageSelect?.textContent ?? "").toContain("第一页");
    },
    MOUNT_TIMEOUT
  );

  it(
    "does not open the QR dialog in fill mode, where the code is content",
    async () => {
      await withEditor(
        createStarterDocument(),
        (host) => {
          const code = host.querySelector<HTMLElement>(".s-editor-qrcode");
          code?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          expect(document.body.querySelector(".el-dialog")).toBeNull();
          expect(host.querySelector(".s-editor-qrcode"), "the code is still painted").not.toBeNull();
        },
        { mode: "fill" }
      );
    },
    MOUNT_TIMEOUT
  );

  it(
    "keeps only the template tab in fill mode when no remote template is configured",
    async () => {
      // A print operator cannot change the template — except by *choosing* one, which is why the
      // 模板 tab survives into fill mode and nothing else does.
      await withEditor(
        createStarterDocument(),
        (host) => {
          const labels = Array.from(host.querySelectorAll(".el-tabs__item")).map(
            (tab) => tab.textContent?.trim() ?? ""
          );
          expect(labels).toEqual(["模板"]);
          // The fill-in path is the local template saved on this machine.
          expect(host.querySelector(".s-tool-template")).not.toBeNull();
        },
        { mode: "fill" }
      );
    },
    MOUNT_TIMEOUT
  );

  it(
    "hides the ribbon in fill mode once a remote template is configured",
    async () => {
      // The configured URL already decides which template is printed, so a choice would be a lie.
      // The request is stubbed and never settles: this test is about the ribbon, and a real
      // fetch would only add a race.
      vi.stubGlobal("fetch", () => new Promise(() => {}));
      try {
        await withEditor(
          createStarterDocument(),
          (host) => {
            expect(host.querySelector(".s-editor-toolbar")).toBeNull();
            expect(host.querySelector(".el-tabs__item")).toBeNull();
          },
          { mode: "fill", template: { kind: "remote", url: "https://example.invalid/t.json" } }
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
    MOUNT_TIMEOUT
  );
});
