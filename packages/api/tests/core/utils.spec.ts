/**
 * Core utilities.
 *
 * These are the pieces every other module leans on — url joining, path
 * substitution, stable serialisation and the cache key hash — so they are tested
 * directly rather than only through a request.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildRequestURL,
  deepMerge,
  Emitter,
  isPlainObject,
  joinURL,
  omit,
  omitUndefined,
  pathParamNames,
  pick,
  replacePathParams,
  shortHash,
  stableStringify,
  stripQuery
} from "../../src/index";

describe("joinURL", () => {
  it("normalises slashes between segments", () => {
    expect(joinURL("/api/", "/user/", "/list")).toBe("/api/user/list");
    expect(joinURL("api", "user")).toBe("api/user");
    expect(joinURL("/api", "user")).toBe("/api/user");
  });

  it("lets an absolute segment win", () => {
    expect(joinURL("/api", "https://cdn.example.com/x")).toBe("https://cdn.example.com/x");
  });

  it("skips empty and undefined segments", () => {
    expect(joinURL("/api", "", undefined, null, "user")).toBe("/api/user");
  });

  it("returns an empty string when nothing is given", () => {
    expect(joinURL()).toBe("");
    expect(joinURL("", undefined)).toBe("");
  });

  it("preserves the trailing segment's own query string", () => {
    expect(joinURL("/api", "user?page=1")).toBe("/api/user?page=1");
  });
});

describe("buildRequestURL", () => {
  it("joins a relative url onto the base", () => {
    expect(buildRequestURL("/api", "/user")).toBe("/api/user");
  });

  it("passes an absolute url through untouched", () => {
    expect(buildRequestURL("/api", "https://x.dev/user")).toBe("https://x.dev/user");
  });
});

describe("replacePathParams", () => {
  it("substitutes and url-encodes", () => {
    expect(replacePathParams("/f/:a/:b", { a: "x y", b: "p/q" })).toBe("/f/x%20y/p%2Fq");
  });

  it("accepts numeric values", () => {
    expect(replacePathParams("/user/:id", { id: 7 })).toBe("/user/7");
  });

  it("leaves an unknown placeholder alone when no handler is given", () => {
    expect(replacePathParams("/user/:id", {})).toBe("/user/:id");
  });

  it("reports a missing placeholder through the handler", () => {
    const missing: string[] = [];

    expect(() =>
      replacePathParams("/user/:id", {}, (name) => {
        missing.push(name);
        throw new Error("missing path parameter");
      })
    ).toThrow("missing path parameter");

    expect(missing).toEqual(["id"]);
  });

  it("lists placeholder names", () => {
    expect(pathParamNames("/a/:x/:y/z")).toEqual(["x", "y"]);
  });
});

describe("stripQuery", () => {
  it("drops the query string and hash", () => {
    expect(stripQuery("/a/b?x=1#f")).toBe("/a/b");
  });
});

describe("isPlainObject", () => {
  it("accepts literals and rejects everything else", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
  });
});

describe("omit / pick / omitUndefined", () => {
  it("omits the listed keys without mutating the source", () => {
    const source = { a: 1, b: 2, c: 3 };
    expect(omit(source, ["b"])).toEqual({ a: 1, c: 3 });
    expect(source).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("picks only the listed keys", () => {
    expect(pick({ a: 1, b: 2 }, ["a"])).toEqual({ a: 1 });
    expect(pick({ a: 1 }, ["missing" as "a"])).toEqual({});
  });

  it("drops undefined but keeps null", () => {
    expect(omitUndefined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });
});

describe("deepMerge", () => {
  it("merges nested objects", () => {
    // The default shape is spelled out once and the override may be deeply
    // partial — that is the whole point of `DeepPartial` on the signature.
    const merged = deepMerge<{ a: { b: number; c: number } }>(
      { a: { b: 1, c: 2 } },
      { a: { c: 3 } }
    );
    expect(merged).toEqual({ a: { b: 1, c: 3 } });
  });

  it("replaces arrays rather than concatenating them", () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it("ignores undefined values so a later source cannot erase a default", () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  it("ignores non-object sources", () => {
    expect(deepMerge({ a: 1 }, undefined, null)).toEqual({ a: 1 });
  });
});

describe("stableStringify", () => {
  it("is insensitive to key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("sorts nested keys too", () => {
    expect(stableStringify({ x: { a: 1, b: 2 } })).toBe(
      stableStringify({ x: { b: 2, a: 1 } })
    );
  });

  it("handles primitives, arrays, dates and null", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(undefined)).toBe("undefined");
    expect(stableStringify([1, "a", true])).toBe('[1,"a",true]');
    expect(stableStringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
  });

  it("survives a circular reference instead of overflowing", () => {
    const node: Record<string, unknown> = { name: "a" };
    node.self = node;
    expect(stableStringify(node)).toContain("[Circular]");
  });

  it("renders a non-finite number as null, matching JSON", () => {
    expect(stableStringify(Number.NaN)).toBe("null");
    expect(stableStringify(Number.POSITIVE_INFINITY)).toBe("null");
  });
});

describe("shortHash", () => {
  it("is deterministic and base36", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).toMatch(/^[0-9a-z]+$/);
  });

  it("separates different inputs", () => {
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
  });
});

describe("Emitter", () => {
  it("invokes listeners with the payload", () => {
    const emitter = new Emitter<{ ready: number }>();
    const seen: number[] = [];
    emitter.on("ready", (value) => seen.push(value));
    emitter.emit("ready", 1);
    expect(seen).toEqual([1]);
  });

  it("returns an unsubscribe function", () => {
    const emitter = new Emitter<{ ready: void }>();
    const listener = vi.fn();
    const off = emitter.on("ready", listener);
    off();
    emitter.emit("ready", undefined);
    expect(listener).not.toHaveBeenCalled();
    expect(emitter.count("ready")).toBe(0);
  });

  it("reports a throwing listener instead of letting it escape", () => {
    const emitter = new Emitter<{ go: void }>();
    const survivor = vi.fn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      emitter.on("go", () => {
        throw new Error("listener exploded");
      });
      emitter.on("go", survivor);

      // The emit must not throw and must not stop the remaining listeners. An
      // escaping error here would turn a settled, successful request into an
      // uncaught exception.
      expect(() => emitter.emit("go", undefined)).not.toThrow();
      expect(survivor).toHaveBeenCalledOnce();
      expect(logged).toHaveBeenCalledOnce();
    } finally {
      logged.mockRestore();
    }
  });

  it("clears by type or entirely", () => {
    const emitter = new Emitter<{ a: void; b: void }>();
    emitter.on("a", () => undefined);
    emitter.on("b", () => undefined);
    emitter.clear("a");
    expect(emitter.count("a")).toBe(0);
    expect(emitter.count("b")).toBe(1);
    emitter.clear();
    expect(emitter.count("b")).toBe(0);
  });
});
