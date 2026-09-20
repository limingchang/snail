/**
 * The observable the node views subscribe to.
 *
 * Small, but it carries the decision that makes fill mode possible at all: changing the
 * values is *not* a document change, so it has to have its own notification path. These
 * tests pin the two properties the node views rely on — every subscriber hears about a
 * change, and a subscriber that has gone away never hears anything again.
 */

import { describe, expect, it, vi } from "vitest";

import { VariableStore } from "../../src/extensions/variable/store";

describe("VariableStore", () => {
  it("starts from the values it was given, without aliasing them", () => {
    const source = { name: "甲" };
    const store = new VariableStore(source);

    // Mutating the caller's object must not reach the store: the caller owns its own
    // state and may reuse the object it passed in.
    source.name = "乙";
    expect(store.getValues().name).toBe("甲");
  });

  it("defaults to design mode", () => {
    expect(new VariableStore({}).getMode()).toBe("design");
  });

  it("notifies every subscriber on a value change", () => {
    const store = new VariableStore({});
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.setValues({ a: 1 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(store.getValues()).toEqual({ a: 1 });
  });

  it("treats `set` as an alias of `setValues`", () => {
    const store = new VariableStore({});
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ b: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getValues()).toEqual({ b: 2 });
  });

  it("notifies on a mode change, and only when the mode actually changes", () => {
    // A mode change repaints every node view, so a redundant one would be wasted work.
    const store = new VariableStore({}, "design");
    const listener = vi.fn();
    store.subscribe(listener);

    store.setMode("fill");
    store.setMode("fill");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getMode()).toBe("fill");
  });

  it("stops notifying an unsubscribed listener, and leaves the others alone", () => {
    const store = new VariableStore({});
    const kept = vi.fn();
    const removed = vi.fn();
    const keptId = store.subscribe(kept);
    const removedId = store.subscribe(removed);

    store.unsubscribe(removedId);
    store.setValues({ a: 1 });

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    expect(keptId).not.toBe(removedId);
  });

  it("ignores an unknown token, so a double unsubscribe is harmless", () => {
    const store = new VariableStore({});
    expect(() => store.unsubscribe(99)).not.toThrow();
  });

  it("lets a listener unsubscribe while it runs", () => {
    // `destroy` on a node view can run inside a repaint; iterating the live map would
    // then skip the next subscriber.
    const store = new VariableStore({});
    const second = vi.fn();
    // Typed as `number` rather than narrowed to the literal `0`, because the closure
    // reads it after the assignment below; a plain `let x = 0` is narrowed by TypeScript
    // inside a callback declared before the reassignment.
    let firstId: number = 0;
    const first = vi.fn(() => store.unsubscribe(firstId));

    firstId = store.subscribe(first);
    store.subscribe(second);
    store.setValues({ a: 1 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reports how many node views are attached", () => {
    const store = new VariableStore({});
    expect(store.size).toBe(0);
    const id = store.subscribe(() => undefined);
    expect(store.size).toBe(1);
    store.unsubscribe(id);
    expect(store.size).toBe(0);
  });

  it("emits on demand, for a caller that changed something it does not own", () => {
    const store = new VariableStore({});
    const listener = vi.fn();
    store.subscribe(listener);
    store.emit();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("copies on write, so an old snapshot is not rewritten", () => {
    const store = new VariableStore({ a: 1 });
    const before = store.getValues();
    store.setValues({ a: 2 });
    expect(before).toEqual({ a: 1 });
    expect(store.getValues()).toEqual({ a: 2 });
  });
});
