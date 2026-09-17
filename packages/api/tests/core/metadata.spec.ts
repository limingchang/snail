/**
 * Metadata-store internals.
 *
 * Kept in its own file because the last case swaps the whole registry — running
 * that alongside tests that rely on metadata would make the suite order
 * dependent.
 */
import { describe, expect, it } from "vitest";
import {
  appendMetadata,
  clearMetadataRegistry,
  collectMethodKeys,
  defineMetadata,
  deleteMetadata,
  getMetadata,
  getOwnMetadata,
  hasMetadata,
  mergeMetadata,
  resolveOwner
} from "../../src/index";

const key = (name: string): symbol => Symbol.for(`test:${name}`);

describe("metadata store", () => {
  it("writes and reads class-level metadata", () => {
    const k = key("class");
    class Sample {}
    defineMetadata(k, { a: 1 }, Sample);
    expect(getMetadata(k, Sample)).toEqual({ a: 1 });
    expect(getOwnMetadata(k, Sample)).toEqual({ a: 1 });
  });

  it("normalises a prototype to its constructor", () => {
    class Sample {}
    expect(resolveOwner(Sample.prototype)).toBe(Sample);
    expect(resolveOwner(Sample)).toBe(Sample);
  });

  it("keeps class and method slots independent", () => {
    const k = key("slots");
    class Sample {
      run(): void {}
    }
    defineMetadata(k, "class", Sample);
    defineMetadata(k, "method", Sample.prototype, "run");

    expect(getMetadata(k, Sample)).toBe("class");
    expect(getMetadata(k, Sample, "run")).toBe("method");
  });

  it("walks the prototype chain, preferring the most derived value", () => {
    const k = key("inherit");
    class Base {}
    class Derived extends Base {}

    defineMetadata(k, "base", Base);
    expect(getMetadata(k, Derived)).toBe("base");
    expect(getOwnMetadata(k, Derived)).toBeUndefined();

    defineMetadata(k, "derived", Derived);
    expect(getMetadata(k, Derived)).toBe("derived");
    expect(getMetadata(k, Base)).toBe("base");
  });

  it("appends without mutating a previous array", () => {
    const k = key("append");
    class Sample {}
    appendMetadata(k, 1, Sample);
    const first = getOwnMetadata<number[]>(k, Sample)!;
    appendMetadata(k, 2, Sample);
    const second = getOwnMetadata<number[]>(k, Sample)!;

    expect(first).toEqual([1]);
    expect(second).toEqual([1, 2]);
    expect(first).not.toBe(second);
  });

  it("merges records shallowly", () => {
    const k = key("merge");
    class Sample {}
    mergeMetadata(k, { a: 1, b: 2 }, Sample);
    mergeMetadata(k, { b: 3 }, Sample);
    expect(getMetadata(k, Sample)).toEqual({ a: 1, b: 3 });
  });

  it("reports presence and deletes", () => {
    const k = key("delete");
    class Sample {}
    expect(hasMetadata(k, Sample)).toBe(false);
    defineMetadata(k, 1, Sample);
    expect(hasMetadata(k, Sample)).toBe(true);
    expect(deleteMetadata(k, Sample)).toBe(true);
    expect(hasMetadata(k, Sample)).toBe(false);
    expect(deleteMetadata(k, Sample)).toBe(false);
  });

  it("collects decorated method names across the chain, base first", () => {
    const k = key("collect");
    class Base {
      fromBase(): void {}
    }
    class Derived extends Base {
      fromDerived(): void {}
      plain(): void {}
    }
    defineMetadata(k, true, Base.prototype, "fromBase");
    defineMetadata(k, true, Derived.prototype, "fromDerived");

    expect(collectMethodKeys(k, Derived)).toEqual(["fromBase", "fromDerived"]);
  });

  it("clears the whole registry", () => {
    const k = key("clear");
    class Sample {}
    defineMetadata(k, 1, Sample);
    clearMetadataRegistry();
    expect(getMetadata(k, Sample)).toBeUndefined();
  });
});
