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
import { afterEach, describe, expect, it } from "vitest";

import { SEditor } from "../../src/index";
import { createStarterDocument, STARTER_QR_TEXT } from "../../src/editor/starter";

/** Mount options that keep a mount fast: no ribbon, no scheduled pagination pass. */
interface MountOptions {
  /** Omit to use the component's own default sections; `[]` for no ribbon at all. */
  tools?: readonly string[];
  /** `true` (default) turns the automatic pagination pass off, which is the slow part. */
  paginationOff?: boolean;
}

const MOUNT_TIMEOUT = 30_000;

/** Mounts `SEditor` and hands back the host element and the exposed surface. */
async function mountEditor(
  modelValue: unknown,
  options: MountOptions = {}
): Promise<{ host: HTMLElement; exposed: { getJSON?: () => unknown }; unmount: () => void }> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const props: Record<string, unknown> = { modelValue };
  // Omitted means "the component's default" — passing `[]` would hide the ribbon, and
  // `tools: undefined` is not the same thing as not passing the prop.
  if (options.tools !== undefined) props.tools = options.tools;
  if (options.paginationOff !== false) props.page = { pagination: false };

  const exposed = { getJSON: undefined as undefined | (() => unknown) };
  const app = createApp({
    render: () =>
      h(SEditor as never, {
        ...props,
        ref: (instance: unknown) => {
          exposed.getJSON = (instance as { getJSON?: () => unknown } | null)?.getJSON?.bind(instance);
        }
      } as never)
  });
  app.mount(host);

  // The editor is created in `onMounted`, so the first paint happens a tick later.
  await nextTick();
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
  run: (host: HTMLElement, exposed: { getJSON?: () => unknown }) => void,
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
      await withEditor(createStarterDocument(), (host) => {
        // The paper, the body, and the starter document's own text.
        expect(host.querySelector(".s-editor-page")).not.toBeNull();
        const body = host.querySelector(".s-editor-page-content");
        expect(body, "the page body must exist").not.toBeNull();

        const text = body?.textContent ?? "";
        expect(text, "the starter title must be on the paper").toContain("技术服务合同");
        expect(text, "the level-2 clause must be on the paper").toContain("第一条");
        expect(text, "the variable's label must be on the paper").toContain("合同编号");
        expect(text, "the indented clause's prose must be on the paper").toContain("乙方向甲方提供");
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
    "renders the toolbar with the default sections",
    async () => {
      // The one mount with the default sections: the ribbon, its tabs, and the two colour controls
      // that are drawn as Word's capital "A".
      const { host, unmount } = await mountEditor(createStarterDocument(), { paginationOff: true });
      unmounts.push(unmount);

      expect(host.querySelector(".s-editor-toolbar")).not.toBeNull();
      const tabs = host.querySelectorAll(".el-tabs__item");
      expect(tabs.length, "the five default tool sections render as tabs").toBeGreaterThanOrEqual(5);

      // The colour controls exist and carry their variants (the glyph itself is CSS).
      expect(host.querySelector(".s-tool-font__color--text")).not.toBeNull();
      expect(host.querySelector(".s-tool-font__color--background")).not.toBeNull();
    },
    MOUNT_TIMEOUT
  );
});
