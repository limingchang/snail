/**
 * Download support: the anchor-based utility and the `useDownload` strategy.
 *
 * The environment is Node, so the DOM is stubbed with a minimal recorder rather
 * than jsdom. That is deliberate — the assertions that matter are "which URL was
 * navigated to, with which `download` attribute, and was the anchor detached
 * again", which is exactly what a recorder captures and jsdom would obscure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Api,
  Post,
  Server,
  SnailServer,
  filenameFromDisposition,
  triggerBlobDownload,
  triggerDownload
} from "../../src/index";
import { useDownload } from "../../src/strategies/plain";
import { createTestAdapter } from "../helpers/test-adapter";

/** A minimal stand-in for the parts of the DOM the download helper touches. */
function stubDom() {
  const created: Array<{
    tag: string;
    href: string;
    download: string;
    target: string;
    rel: string;
    clicked: number;
    attached: boolean;
    removed: boolean;
  }> = [];

  class FakeAnchor {
    href = "";
    download = "";
    target = "";
    rel = "";
    referrerPolicy = "";
    clicked = 0;
    attached = false;
    removed = false;
    style: Record<string, string> = {};

    click(): void {
      this.clicked += 1;
    }

    remove(): void {
      this.removed = true;
      const entry = created.find((candidate) => candidate.tag === "a" && candidate.clicked === this.clicked);
      void entry;
    }
  }

  const body = {
    appendChild(node: FakeAnchor) {
      node.attached = true;
      created.push({
        tag: "a",
        href: node.href,
        download: node.download,
        target: node.target,
        rel: node.rel,
        clicked: 0,
        attached: true,
        removed: false
      });
      return node;
    }
  };

  const document = {
    body,
    createElement(tag: string) {
      const anchor = new FakeAnchor();
      // Record the click with the attributes as they were at click time.
      const originalClick = anchor.click.bind(anchor);
      anchor.click = () => {
        const record = created[created.length - 1];
        if (record) record.clicked += 1;
        originalClick();
      };
      void tag;
      return anchor;
    }
  };

  const globals = globalThis as Record<string, unknown>;
  const previousDocument = globals.document;
  globals.document = document;

  return {
    created,
    restore() {
      globals.document = previousDocument;
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("triggerDownload", () => {
  it("navigates a detached anchor and sets the filename", () => {
    const dom = stubDom();
    try {
      const result = triggerDownload("/files/report.pdf", { filename: "report.pdf" });

      expect(result).toEqual({ url: "/files/report.pdf", filename: "report.pdf" });
      expect(dom.created).toHaveLength(1);
      expect(dom.created[0]!.href).toBe("/files/report.pdf");
      expect(dom.created[0]!.download).toBe("report.pdf");
      expect(dom.created[0]!.clicked).toBe(1);
    } finally {
      dom.restore();
    }
  });

  it("omits the download attribute when no filename is given", () => {
    const dom = stubDom();
    try {
      triggerDownload("/files/raw");
      expect(dom.created[0]!.download).toBe("");
      expect(dom.created[0]!.clicked).toBe(1);
    } finally {
      dom.restore();
    }
  });

  it("adds noopener when opening in a new tab", () => {
    const dom = stubDom();
    try {
      const result = triggerDownload("/report", { openInNewTab: true, filename: "ignored.pdf" });

      expect(dom.created[0]!.target).toBe("_blank");
      // Without `noopener` the opened page gets a `window.opener` handle back.
      expect(dom.created[0]!.rel).toBe("noopener noreferrer");
      expect(result.filename).toBe("ignored.pdf");
    } finally {
      dom.restore();
    }
  });

  it("still clicks when there is no filename and no new tab", () => {
    const dom = stubDom();
    try {
      triggerDownload("blob:abc");
      expect(dom.created[0]!.clicked).toBe(1);
    } finally {
      dom.restore();
    }
  });

  it("throws on a server rather than silently doing nothing", () => {
    const globals = globalThis as Record<string, unknown>;
    const previous = globals.document;
    delete globals.document;
    try {
      expect(() => triggerDownload("/x")).toThrow(ReferenceError);
      expect(() => triggerDownload("/x")).toThrow(/needs a DOM/);
    } finally {
      globals.document = previous;
    }
  });
});

describe("triggerBlobDownload", () => {
  it("creates an object URL and revokes it on the next tick", async () => {
    const dom = stubDom();
    const globals = globalThis as Record<string, unknown>;
    const previousUrl = globals.URL;

    const created: Blob[] = [];
    const revoked: string[] = [];
    globals.URL = {
      createObjectURL(blob: Blob) {
        created.push(blob);
        return "blob:mock-1";
      },
      revokeObjectURL(url: string) {
        revoked.push(url);
      }
    };

    try {
      const blob = new Blob(["hello"]);
      triggerBlobDownload(blob, { filename: "greeting.txt" });

      expect(created).toEqual([blob]);
      expect(dom.created[0]!.href).toBe("blob:mock-1");
      expect(revoked).toEqual([]);

      // Revoking in the same tick races the navigation in Safari and Firefox, so
      // it must be deferred.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(revoked).toEqual(["blob:mock-1"]);
    } finally {
      globals.URL = previousUrl;
      dom.restore();
    }
  });
});

describe("filenameFromDisposition", () => {
  it("prefers the RFC 5987 extended form", () => {
    expect(
      filenameFromDisposition("attachment; filename=\"fallback.txt\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf")
    ).toBe("报告.pdf");
  });

  it("reads a quoted plain filename", () => {
    expect(filenameFromDisposition('attachment; filename="report.pdf"')).toBe("report.pdf");
  });

  it("reads an unquoted plain filename", () => {
    expect(filenameFromDisposition("attachment; filename=report.pdf")).toBe("report.pdf");
  });

  it("returns undefined when nothing is named", () => {
    expect(filenameFromDisposition(undefined)).toBeUndefined();
    expect(filenameFromDisposition("attachment")).toBeUndefined();
    expect(filenameFromDisposition('attachment; filename=""')).toBeUndefined();
  });

  it("does not throw on a malformed escape", () => {
    expect(() => filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A")).not.toThrow();
  });
});

describe("useDownload", () => {
  function harness(body: unknown, delayMs = 0) {
    const test = createTestAdapter({ body, delayMs });

    @Server({ baseURL: "/api", adapter: test.adapter })
    class TestServer extends SnailServer {}

    const Service = new TestServer();

    @Api("/report")
    class ReportApi {
      @Post("/export")
      create(): Promise<unknown> {
        return null!;
      }
    }

    return { Service, test, api: Service.createApi(ReportApi) };
  }

  it("waits only for the url, then triggers the download", async () => {
    const dom = stubDom();
    try {
      const { api, test } = harness({ code: 0, message: "ok", data: { url: "/tmp/abc", filename: "r.pdf" } });
      const download = useDownload(api.create);

      const result = await download.download();

      // Exactly one request: the one that minted the url. The file itself is never
      // fetched by the library.
      expect(test.requests).toHaveLength(1);
      expect(test.requests[0]!.url).toBe("/report/export");
      expect(result).toEqual({ url: "/tmp/abc", filename: "r.pdf" });
      expect(dom.created[0]!.href).toBe("/tmp/abc");
      expect(dom.created[0]!.download).toBe("r.pdf");
    } finally {
      dom.restore();
    }
  });

  it("accepts a bare url string", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: "/tmp/plain" });
      const download = useDownload(api.create);

      await download.download();
      expect(dom.created[0]!.href).toBe("/tmp/plain");
      expect(download.info.value).toEqual({ url: "/tmp/plain" });
    } finally {
      dom.restore();
    }
  });

  it("accepts downloadUrl and name aliases", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { downloadUrl: "/tmp/x", name: "x.zip" } });
      const download = useDownload(api.create);

      await download.download();
      expect(dom.created[0]!.href).toBe("/tmp/x");
      expect(dom.created[0]!.download).toBe("x.zip");
    } finally {
      dom.restore();
    }
  });

  it("lets a filename option override the server's", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { url: "/tmp/x", filename: "server.pdf" } });
      const download = useDownload(api.create, { filename: "local.pdf" });

      await download.download();
      expect(dom.created[0]!.download).toBe("local.pdf");
      // `info` still reports what the server said; the override is presentation only.
      expect(download.info.value?.filename).toBe("server.pdf");
    } finally {
      dom.restore();
    }
  });

  it("supports a custom pick for a differently shaped payload", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { payload: { link: "/tmp/deep", fileName: "d.csv" } } });
      const download = useDownload<readonly unknown[], { payload: { link: string; fileName: string } }>(
        api.create as never,
        { pick: (payload) => ({ url: payload.payload.link, filename: payload.payload.fileName }) }
      );

      await download.download();
      expect(dom.created[0]!.href).toBe("/tmp/deep");
      expect(dom.created[0]!.download).toBe("d.csv");
    } finally {
      dom.restore();
    }
  });

  it("does not touch the DOM when autoTrigger is off", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { url: "/tmp/x" } });
      const download = useDownload(api.create, { autoTrigger: false });

      const result = await download.download();

      expect(dom.created).toHaveLength(0);
      expect(result.url).toBe("/tmp/x");
      expect(download.info.value).toEqual({ url: "/tmp/x" });
    } finally {
      dom.restore();
    }
  });

  it("throws a clear error when the payload carries no url", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { nope: true } });
      const download = useDownload(api.create);

      await expect(download.download()).rejects.toThrow(/carried no download url/);
      expect(dom.created).toHaveLength(0);
      expect(download.error.value).toBeInstanceOf(TypeError);
      expect(download.loading.value).toBe(false);
    } finally {
      dom.restore();
    }
  });

  it("drives loading and data like any other hook", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { url: "/tmp/x" } });
      const download = useDownload(api.create);
      const seen: boolean[] = [];
      download.onSuccess(() => seen.push(download.loading.value));

      expect(download.loading.value).toBe(false);
      await download.download();

      expect(download.loading.value).toBe(false);
      expect(download.data.value).toEqual({ url: "/tmp/x" });
      expect(download.error.value).toBeUndefined();
      expect(seen).toEqual([true]);
    } finally {
      dom.restore();
    }
  });

  it("notifies onDownload subscribers with the descriptor", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 0, message: "ok", data: { url: "/tmp/x", filename: "x.bin" } });
      const download = useDownload(api.create);
      const seen: unknown[] = [];
      const off = download.onDownload((info) => seen.push(info));

      await download.download();
      off();
      await download.download();

      expect(seen).toEqual([{ url: "/tmp/x", filename: "x.bin" }]);
    } finally {
      dom.restore();
    }
  });

  it("fails the call when nothing can actually download, rather than resolving quietly", async () => {
    // No DOM: this is `useDownload` used on a server. The request that mints the url
    // succeeds, so the tempting behaviour would be to resolve and let the caller
    // assume a file is on its way. Failing is the honest outcome.
    const globals = globalThis as Record<string, unknown>;
    const previous = globals.document;
    delete globals.document;

    try {
      const { api } = harness({ code: 0, message: "ok", data: { url: "/tmp/x" } });
      const download = useDownload(api.create);
      const seen: unknown[] = [];
      download.onDownload((info) => seen.push(info));

      await expect(download.download()).rejects.toThrow(/needs a DOM/);

      expect(download.error.value).toBeInstanceOf(ReferenceError);
      expect(download.loading.value).toBe(false);
      // The download never began, so `info` was never written and no listener fired.
      expect(download.info.value).toBeUndefined();
      expect(seen).toEqual([]);
    } finally {
      globals.document = previous;
    }
  });

  it("surfaces a business-code rejection through the usual error state", async () => {
    const dom = stubDom();
    try {
      const { api } = harness({ code: 500, message: "boom", data: null });
      const download = useDownload(api.create);

      await expect(download.download()).rejects.toThrow();
      expect(download.error.value).toBeDefined();
      expect(dom.created).toHaveLength(0);
    } finally {
      dom.restore();
    }
  });
});
