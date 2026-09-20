/**
 * The context-menu state machine.
 *
 * This is the half of `popupMenu` that decides what the user sees and what happens when
 * they click, and it is testable in Node precisely because `src/popupMenu/menu.ts`
 * imports nothing but types — no Vue, no SFC, no `document`. The failures covered here
 * are the legacy implementation's actual bugs, not hypotheticals:
 *
 * - it resolved `display`/`enabled` fail-**open**, so an unresolved row was clickable;
 * - it never handled a rejection, so a throwing predicate left a row visible forever
 *   and produced an unhandled rejection;
 * - it called `command(context)` without awaiting and unmounted the menu on the same
 *   tick, so a failure could not keep the menu open and a double click re-entered.
 */

import { describe, expect, it, vi } from "vitest";
import { createItemSnapshot, resolveItems, runCommand } from "../../src/popupMenu/menu";
import type { SPopUpMenuItemOptions } from "../../src/popupMenu/type";

interface Ctx {
  id: number;
}

describe("createItemSnapshot (fail-closed)", () => {
  it("hides a row whose display is async until it resolves", () => {
    const rows = createItemSnapshot<Ctx>([
      { label: "async", display: () => Promise.resolve(true) }
    ]);

    expect(rows[0].visible).toBe(false);
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].pending).toBe(true);
  });

  it("shows but disables a row whose enabled is async", () => {
    const rows = createItemSnapshot<Ctx>([{ label: "async", enabled: () => true }]);

    expect(rows[0].visible).toBe(true);
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].pending).toBe(true);
  });

  it("keeps synchronous booleans exactly as given", () => {
    const rows = createItemSnapshot<Ctx>([
      { label: "shown", display: true, enabled: true },
      { label: "hidden", display: false },
      { label: "disabled", disabled: true },
      { label: "enabled-false", enabled: false }
    ]);

    expect(rows.map((row) => [row.visible, row.enabled, row.pending])).toEqual([
      [true, true, false],
      [false, false, false],
      [true, false, false],
      [true, false, false]
    ]);
  });

  it("never invokes a predicate while snapshotting", () => {
    const display = vi.fn(() => true);
    const enabled = vi.fn(() => true);

    createItemSnapshot<Ctx>([{ label: "row", display, enabled }]);

    expect(display).not.toHaveBeenCalled();
    expect(enabled).not.toHaveBeenCalled();
  });

  it("treats separators as inert rows", () => {
    const rows = createItemSnapshot<Ctx>([
      { label: "", separator: true, display: () => false, enabled: () => false }
    ]);

    expect(rows[0].separator).toBe(true);
    expect(rows[0].pending).toBe(false);
    expect(rows[0].visible).toBe(true);
  });

  it("gives every row a stable id, including children", () => {
    const rows = createItemSnapshot<Ctx>([
      { label: "parent", children: [{ label: "child" }, { label: "child" }] }
    ]);
    const [parent] = rows;

    expect(parent.id).toMatch(/^s-menu-item-/);
    expect(new Set([parent.id, ...parent.children.map((child) => child.id)]).size).toBe(3);
  });

  it("keeps a caller-supplied id", () => {
    const rows = createItemSnapshot<Ctx>([{ label: "row", id: "mine" }]);
    expect(rows[0].id).toBe("mine");
  });
});

describe("resolveItems", () => {
  it("resolves display and enabled predicates", async () => {
    const rows = await resolveItems<Ctx>(
      [
        { label: "yes", display: () => Promise.resolve(true), enabled: () => Promise.resolve(true) },
        { label: "no", display: () => Promise.resolve(false) }
      ],
      { context: { id: 7 } }
    );

    expect(rows[0]).toMatchObject({ visible: true, enabled: true, pending: false });
    expect(rows[1]).toMatchObject({ visible: false, enabled: false, pending: false });
  });

  it("passes `options.context` to predicates", async () => {
    const display = vi.fn((context: Ctx) => context.id === 7);

    await resolveItems<Ctx>([{ label: "row", display }], { context: { id: 7 } });

    expect(display).toHaveBeenCalledWith({ id: 7 });
  });

  it("hides the row and reports once when display throws", async () => {
    const onError = vi.fn();
    const failure = new Error("display exploded");

    const rows = await resolveItems<Ctx>([{ label: "row", display: () => Promise.reject(failure) }], {
      onError
    });

    expect(rows[0]).toMatchObject({ visible: false, enabled: false, pending: false });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure, expect.objectContaining({ label: "row" }));
  });

  it("disables the row and reports once when enabled throws", async () => {
    const onError = vi.fn();

    const rows = await resolveItems<Ctx>(
      [{ label: "row", enabled: () => Promise.reject(new Error("enabled exploded")) }],
      { onError }
    );

    expect(rows[0]).toMatchObject({ visible: true, enabled: false, pending: false });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("does not evaluate enabled once the row is hidden", async () => {
    const enabled = vi.fn(() => true);

    await resolveItems<Ctx>([{ label: "row", display: false, enabled }]);

    expect(enabled).not.toHaveBeenCalled();
  });

  it("resolves nested children against their own sources", async () => {
    const rows = await resolveItems<Ctx>([
      {
        label: "parent",
        children: [
          { label: "shown", display: () => true },
          { label: "hidden", display: () => Promise.resolve(false) }
        ]
      }
    ]);

    expect(rows[0].children.map((child) => child.visible)).toEqual([true, false]);
    // Nesting is arbitrary and each level keeps its own identity and labels.
    expect(rows[0].children.map((child) => child.label)).toEqual(["shown", "hidden"]);
    expect(rows[0].children[0].children).toEqual([]);
    expect(new Set([rows[0].id, ...rows[0].children.map((child) => child.id)]).size).toBe(3);
  });

  it("survives a reporter that throws", async () => {
    const rows = await resolveItems<Ctx>(
      [{ label: "row", display: () => Promise.reject(new Error("boom")) }],
      {
        onError: () => {
          throw new Error("the reporter itself is broken");
        }
      }
    );

    expect(rows[0].visible).toBe(false);
  });
});

describe("runCommand", () => {
  it("awaits the command and closes on success", async () => {
    const order: string[] = [];
    const item: SPopUpMenuItemOptions<Ctx> = {
      label: "save",
      command: async (context) => {
        order.push(`start:${context.id}`);
        await Promise.resolve();
        order.push("end");
      }
    };

    const outcome = await runCommand(item, { context: { id: 3 } });

    expect(outcome).toEqual({ status: "success", close: true });
    expect(order).toEqual(["start:3", "end"]);
  });

  it("keeps the menu open when the command rejects, and reports once", async () => {
    const onError = vi.fn();
    const failure = new Error("request failed");
    const item: SPopUpMenuItemOptions<Ctx> = {
      label: "save",
      command: () => Promise.reject(failure)
    };

    const outcome = await runCommand(item, { onError });

    expect(outcome.status).toBe("error");
    expect(outcome.close).toBe(false);
    expect(outcome.error).toBe(failure);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("honours closeOnClick on the item and on the menu", async () => {
    const command = vi.fn(() => Promise.resolve());

    const perItem = await runCommand({ label: "row", command, closeOnClick: false }, {});
    const perMenu = await runCommand({ label: "row", command }, { closeOnClick: false });

    expect(perItem.close).toBe(false);
    expect(perMenu.close).toBe(false);
    expect(command).toHaveBeenCalledTimes(2);
  });

  it("skips a row that has no command (a submenu parent)", async () => {
    const outcome = await runCommand<Ctx>({ label: "parent", children: [{ label: "child" }] });

    expect(outcome).toEqual({ status: "skipped", close: false });
  });

  it("waits for an async command before deciding to close", async () => {
    let settled = false;
    const item: SPopUpMenuItemOptions<Ctx> = {
      label: "slow",
      command: () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            settled = true;
            resolve();
          }, 5);
        })
    };

    const outcome = await runCommand(item);

    expect(settled).toBe(true);
    expect(outcome.close).toBe(true);
  });
});
