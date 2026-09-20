/**
 * The template plumbing, as tests.
 *
 * `editor/template.ts` is the one part of the component layer that needs no DOM: building
 * the stored artefact, reading one back, locating a remote entry and deciding the load
 * policy are all pure functions over plain values. They are therefore tested here, in the
 * Node environment the project's Vitest config uses — there is deliberately no jsdom and
 * no `@vue/test-utils`, because a test that mounts an editor would assert a fiction about
 * layout rather than the contract.
 *
 * Each block below pins one of the defects the rebuild exists to fix, so a regression is
 * reported as the defect rather than as a diff.
 */

import { describe, expect, it } from "vitest";

import { TEMPLATE_VERSION } from "../../src/typings/editor";
import type { JSONContent } from "@tiptap/core";
import type { TemplateSource } from "../../src/typings/editor";

import {
  buildTemplateDocument,
  countPages,
  emptyDocument,
  isRemoteListSource,
  joinUrl,
  migrateTemplate,
  normaliseTemplateList,
  parseTemplateInput,
  readPageSetup,
  readStoredTemplate,
  resolveTemplateContentUrl,
  sanitiseDocument,
  saveTemplateToTarget,
  shouldAutoLoadTemplate,
  summariseVariables,
  templateLoadPolicy
} from "../../src/editor/template";
import type { StorageLike } from "../../src/editor/template";

/** A document with one page, carrying a volatile attribute — as the page extension emits. */
function pageDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "page",
        attrs: {
          index: 1,
          paperFormat: "A5",
          orientation: "landscape",
          margins: { top: "10mm", right: "12mm", bottom: "10mm", left: "12mm" },
          _updateTimestamp: 1735689600000
        },
        content: [
          {
            type: "pageContent",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "甲方：" },
                  {
                    type: "variable",
                    attrs: {
                      label: "甲方名称",
                      key: "party.name",
                      data: { type: "text" },
                      defaultValue: "示例"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

/** A `localStorage` stub. Structural, so no DOM is involved. */
function stubStorage(): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    }
  };
}

describe("buildTemplateDocument", () => {
  it("stamps the current version", () => {
    const template = buildTemplateDocument({ doc: pageDocument() });
    expect(template.version).toBe(TEMPLATE_VERSION);
    expect(template.version).toBe(1);
  });

  it("never serialises a volatile attribute (defect 43)", () => {
    const template = buildTemplateDocument({ doc: pageDocument() });

    // The whole stored artefact, not just the doc: a volatile attribute that leaked into
    // any part of it would make an identical template serialise differently per save.
    expect(JSON.stringify(template)).not.toContain("_updateTimestamp");
    expect(Object.keys((template.doc.content?.[0]?.attrs ?? {}) as Record<string, unknown>)).not.toContain(
      "_updateTimestamp"
    );
  });

  it("does not mutate the document it was handed", () => {
    const doc = pageDocument();
    buildTemplateDocument({ doc });
    expect(doc.content?.[0]?.attrs?._updateTimestamp).toBe(1735689600000);
  });

  it("reads the page setup out of the document, not out of a prop", () => {
    const template = buildTemplateDocument({ doc: pageDocument() });

    expect(template.page?.paperFormat).toBe("A5");
    expect(template.page?.orientation).toBe("landscape");
    expect(template.page?.margins).toEqual({
      top: "10mm",
      right: "12mm",
      bottom: "10mm",
      left: "12mm"
    });
    expect(template.page?.pageCount).toBe(1);
  });

  it("summarises the variables without an editor", () => {
    const template = buildTemplateDocument({ doc: pageDocument() });

    expect(template.variables).toEqual([
      { key: "party.name", label: "甲方名称", type: "text", required: false }
    ]);
  });

  it("records the watermark only while it is enabled", () => {
    const off = buildTemplateDocument({ doc: emptyDocument(), watermark: { enabled: false, text: "草稿" } });
    expect(off.watermark).toBeUndefined();

    const on = buildTemplateDocument({ doc: emptyDocument(), watermark: { enabled: true, text: "草稿", angle: -45 } });
    expect(on.watermark).toEqual({
      enabled: true,
      text: "草稿",
      imageSrc: undefined,
      angle: -45,
      opacity: undefined,
      greyscale: undefined,
      tiled: undefined
    });
  });
});

describe("sanitiseDocument", () => {
  it("drops every underscore-prefixed attribute, at any depth", () => {
    const cleaned = sanitiseDocument({
      type: "doc",
      attrs: { _doc: true, keep: 1 },
      content: [
        { type: "paragraph", attrs: { _inner: "x", indent: "2em" }, content: [{ type: "text", text: "a" }] }
      ]
    });

    expect(cleaned.attrs).toEqual({ keep: 1 });
    expect(cleaned.content?.[0]?.attrs).toEqual({ indent: "2em" });
  });
});

describe("readPageSetup and countPages", () => {
  it("falls back to A4 portrait with 20 mm margins", () => {
    const setup = readPageSetup(emptyDocument());
    expect(setup.paperFormat).toBe("A4");
    expect(setup.orientation).toBe("portrait");
    expect(setup.margins).toEqual({ top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" });
  });

  it("counts the page nodes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [pageDocument().content?.[0] ?? { type: "page" }, { type: "page" }]
    };
    expect(countPages(doc)).toBe(2);
    expect(countPages(emptyDocument())).toBe(1);
  });
});

describe("summariseVariables", () => {
  it("deduplicates by key, keeping document order", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "variable", attrs: { label: "甲", key: "a", data: { type: "text" } } },
            { type: "variable", attrs: { label: "乙", key: "b", data: { type: "money" }, defaultValue: 0 } },
            { type: "variable", attrs: { label: "甲(again)", key: "a", data: { type: "text" } } }
          ]
        }
      ]
    };

    expect(summariseVariables(doc)).toEqual([
      { key: "a", label: "甲", type: "text", required: true },
      { key: "b", label: "乙", type: "money", required: false }
    ]);
  });

  it("never marks a system or formula variable as required", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "variable", attrs: { label: "页", key: "p", data: { type: "system", systemKey: "page" } } },
            { type: "variable", attrs: { label: "合", key: "t", data: { type: "formula", expression: "1+1" } } }
          ]
        }
      ]
    };

    expect(summariseVariables(doc).map((entry) => entry.required)).toEqual([false, false]);
  });
});

describe("parseTemplateInput", () => {
  it("round-trips a built template through JSON", () => {
    const built = buildTemplateDocument({ doc: pageDocument() });
    const parsed = parseTemplateInput(JSON.stringify(built));

    expect(parsed.migrated).toBe(false);
    expect(parsed.template.version).toBe(TEMPLATE_VERSION);
    expect(parsed.template.page?.paperFormat).toBe("A5");
    expect(parsed.content).toEqual(built.doc);
  });

  it("wraps a bare ProseMirror document", () => {
    const parsed = parseTemplateInput(pageDocument());
    expect(parsed.template.version).toBe(TEMPLATE_VERSION);
    expect(parsed.template.doc.type).toBe("doc");
  });

  it("treats a string that is not JSON as HTML", () => {
    const parsed = parseTemplateInput("<p>hello</p>");
    expect(parsed.content).toBe("<p>hello</p>");
    // HTML carries no separate page setup, so the stored doc is the empty default.
    expect(parsed.template.doc.type).toBe("doc");
  });

  it("refuses unparseable JSON rather than rendering it as text", () => {
    expect(() => parseTemplateInput("{ not json")).toThrowError(/not-a-json-document/);
  });

  it("refuses a value that is neither a document, a string nor a template", () => {
    expect(() => parseTemplateInput(42 as unknown as JSONContent)).toThrowError(/invalid-template/);
  });
});

describe("migrateTemplate", () => {
  it("reports that an older template was migrated and upgrades the version", () => {
    const { template, migrated } = migrateTemplate({
      version: 0,
      doc: { type: "doc", attrs: { _updateTimestamp: 1 }, content: [] }
    });

    expect(migrated).toBe(true);
    expect(template.version).toBe(TEMPLATE_VERSION);
    expect(template.doc.attrs).toEqual({});
  });

  it("does not report a migration for the current version", () => {
    expect(migrateTemplate({ version: TEMPLATE_VERSION, doc: emptyDocument() }).migrated).toBe(false);
  });
});

describe("saveTemplateToTarget", () => {
  it("writes JSON to localStorage under the default key", async () => {
    const storage = stubStorage();
    const template = buildTemplateDocument({ doc: pageDocument() });

    const result = await saveTemplateToTarget(
      { kind: "local" },
      { template, html: "<p/>", storage: { local: storage } }
    );

    expect(result.error).toBeUndefined();
    expect(result.kind).toBe("local");
    expect(storage.data.get("snail-editor-template")).toBe(JSON.stringify(template));
  });

  it("honours a custom storage key", async () => {
    const storage = stubStorage();
    await saveTemplateToTarget(
      { kind: "local", storageKey: "contract-7" },
      { template: buildTemplateDocument({ doc: emptyDocument() }), html: "", storage: { local: storage } }
    );

    expect([...storage.data.keys()]).toEqual(["contract-7"]);
  });

  it("uses sessionStorage when the target asks for it", async () => {
    const local = stubStorage();
    const session = stubStorage();

    await saveTemplateToTarget(
      { kind: "local", session: true },
      { template: buildTemplateDocument({ doc: emptyDocument() }), html: "", storage: { local, session } }
    );

    expect(session.data.size).toBe(1);
    expect(local.data.size).toBe(0);
  });

  it("reports a missing storage environment instead of throwing", async () => {
    const result = await saveTemplateToTarget(
      { kind: "local" },
      { template: buildTemplateDocument({ doc: emptyDocument() }), html: "" }
    );

    expect(result.error).toBeDefined();
    expect((result.error as { code?: string }).code).toBe("storage-unavailable");
  });

  it("POSTs the stored template by default and the HTML when unstructured", async () => {
    const calls: Array<{ url: string; method?: string; body?: string; headers?: Record<string, string> }> = [];
    const fetchImpl = async (
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string }
    ): Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }> => {
      calls.push({ url, ...init });
      return { ok: true, status: 201, json: async () => ({}), text: async () => "" };
    };

    const template = buildTemplateDocument({ doc: emptyDocument() });

    const structured = await saveTemplateToTarget(
      { kind: "remote", url: "/api/templates" },
      { template, html: "<p>hi</p>", fetch: fetchImpl }
    );
    expect(structured.status).toBe(201);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers?.["Content-Type"]).toBe("application/json");
    expect(calls[0]?.body).toBe(JSON.stringify(template));

    await saveTemplateToTarget(
      { kind: "remote", url: "/api/templates", method: "PUT", structured: false },
      { template, html: "<p>hi</p>", fetch: fetchImpl }
    );
    expect(calls[1]?.method).toBe("PUT");
    expect(calls[1]?.headers?.["Content-Type"]).toBe("text/html");
    expect(calls[1]?.body).toBe("<p>hi</p>");
  });

  it("records an HTTP failure on the result rather than in a toast", async () => {
    const fetchImpl = async (): Promise<{
      ok: boolean;
      status: number;
      json(): Promise<unknown>;
      text(): Promise<string>;
    }> => ({ ok: false, status: 500, json: async () => ({}), text: async () => "" });

    const result = await saveTemplateToTarget(
      { kind: "remote", url: "/api/templates" },
      { template: buildTemplateDocument({ doc: emptyDocument() }), html: "", fetch: fetchImpl }
    );

    expect(result.status).toBe(500);
    expect((result.error as { code?: string }).code).toBe("response-error");
  });

  it("records a thrown network error as network-error", async () => {
    const fetchImpl = async (): Promise<never> => {
      throw new Error("offline");
    };

    const result = await saveTemplateToTarget(
      { kind: "remote", url: "/api/templates" },
      { template: buildTemplateDocument({ doc: emptyDocument() }), html: "", fetch: fetchImpl }
    );

    expect((result.error as { code?: string }).code).toBe("network-error");
  });
});

describe("readStoredTemplate", () => {
  it("reads back what a local save wrote", async () => {
    const storage = stubStorage();
    const template = buildTemplateDocument({ doc: pageDocument() });
    await saveTemplateToTarget({ kind: "local" }, { template, html: "", storage: { local: storage } });

    expect(readStoredTemplate({ kind: "local" }, storage)?.page?.paperFormat).toBe("A5");
  });

  it("treats a corrupted slot as no saved template", () => {
    const storage = stubStorage();
    storage.data.set("snail-editor-template", "{ broken");
    expect(readStoredTemplate({ kind: "local" }, storage)).toBeUndefined();
  });

  it("returns undefined when there is nothing stored", () => {
    expect(readStoredTemplate({ kind: "local" }, stubStorage())).toBeUndefined();
  });
});

describe("remote-list sources", () => {
  it("resolves a content URL as `${url}/${id}` by default", () => {
    const source: TemplateSource = { kind: "remote-list", url: "/api/templates" };
    expect(isRemoteListSource(source)).toBe(true);
    if (!isRemoteListSource(source)) throw new Error("unreachable");

    expect(resolveTemplateContentUrl(source, { id: "42", name: "合同" })).toBe("/api/templates/42");
  });

  it("does not double the separator when the base URL ends with one", () => {
    const source: TemplateSource = { kind: "remote-list", url: "/api/templates/" };
    if (!isRemoteListSource(source)) throw new Error("unreachable");

    expect(resolveTemplateContentUrl(source, { id: "/42", name: "合同" })).toBe("/api/templates/42");
    expect(joinUrl("/api/", "templates")).toBe("/api/templates");
  });

  it("prefers a custom contentUrl", () => {
    const source: TemplateSource = {
      kind: "remote-list",
      url: "/api/templates",
      contentUrl: (item) => `/api/template-content?id=${item.id}`
    };
    if (!isRemoteListSource(source)) throw new Error("unreachable");

    expect(resolveTemplateContentUrl(source, { id: "42", name: "合同" })).toBe(
      "/api/template-content?id=42"
    );
  });

  it("defaults to manual and only auto-loads when asked", () => {
    const manual: TemplateSource = { kind: "remote-list", url: "/api/templates" };
    const auto: TemplateSource = { kind: "remote-list", url: "/api/templates", load: "auto" };
    const remote: TemplateSource = { kind: "remote", url: "/api/templates/1" };

    expect(templateLoadPolicy(manual)).toBe("manual");
    expect(shouldAutoLoadTemplate(manual)).toBe(false);

    expect(templateLoadPolicy(auto)).toBe("auto");
    expect(shouldAutoLoadTemplate(auto)).toBe(true);

    // A single remote template is not a list: there is nothing to choose, so "manual"
    // here means "no list to wait for", not "do not fetch".
    expect(templateLoadPolicy(remote)).toBe("manual");
    expect(shouldAutoLoadTemplate(remote)).toBe(false);

    expect(templateLoadPolicy(undefined)).toBe("manual");
    expect(shouldAutoLoadTemplate(undefined)).toBe(false);
  });
});

describe("normaliseTemplateList", () => {
  it("reads a bare array, and keeps an inline document beside the list", () => {
    const result = normaliseTemplateList([
      { id: 1, name: "劳动合同", description: "标准版", updatedAt: "2024-01-01" },
      { id: "2", doc: pageDocument() }
    ]);

    expect(result.items).toEqual([
      { id: "1", name: "劳动合同", description: "标准版", updatedAt: "2024-01-01" },
      { id: "2", name: "2" }
    ]);
    expect(result.inline.get("2")).toEqual(pageDocument());
  });

  it("reads a `{ data: [...] }` envelope", () => {
    expect(normaliseTemplateList({ data: [{ id: "a" }] }).items).toEqual([{ id: "a", name: "a" }]);
  });

  it("skips an entry without an id instead of blanking the list", () => {
    expect(normaliseTemplateList([{ name: "no id" }, { id: "ok" }]).items).toEqual([
      { id: "ok", name: "ok" }
    ]);
  });

  it("refuses a payload that is not a list at all", () => {
    expect(() => normaliseTemplateList({ items: [] })).toThrowError(/invalid-list/);
  });
});
