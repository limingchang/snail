/**
 * The pagination pass's scheduling policy.
 *
 * These two functions are what keep a large paste or a hanging layout from freezing the editor,
 * so they are tested directly rather than through a DOM:
 *
 * - {@link resolvePassBudget} turns "no budget given" into the default and "no budget wanted"
 *   into `Infinity`, which is what makes a pass deterministic for `flush()` and for tests.
 * - {@link mayScheduleAnotherPass} is the valve on the loop the budget creates: a pass that
 *   stopped early may ask for one more frame, but only a bounded number of times in a row.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PASS_BUDGET_MS,
  MAX_CONSECUTIVE_PASSES,
  mayScheduleAnotherPass,
  resolvePassBudget
} from "../../src/extensions/page/pageContent/paginator";

describe("resolvePassBudget", () => {
  it("falls back to the default for `undefined`", () => {
    expect(resolvePassBudget(undefined)).toBe(DEFAULT_PASS_BUDGET_MS);
  });

  it("keeps a positive budget", () => {
    expect(resolvePassBudget(8)).toBe(8);
    expect(resolvePassBudget(0)).toBe(0);
  });

  it("reads a negative or non-finite budget as `no budget`", () => {
    // The deterministic path: one pass does everything it can, exactly as before the budget
    // existed. A negative value cannot mean "stop immediately" — that would make a pass a
    // no-op and the document would never paginate at all.
    expect(resolvePassBudget(-1)).toBe(Number.POSITIVE_INFINITY);
    expect(resolvePassBudget(Number.NaN)).toBe(Number.POSITIVE_INFINITY);
    expect(resolvePassBudget(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it("has a default that leaves room inside a 60 Hz frame", () => {
    // 16.7 ms is the frame; the pass must leave the browser time to paint in the same one.
    expect(DEFAULT_PASS_BUDGET_MS).toBeGreaterThan(0);
    expect(DEFAULT_PASS_BUDGET_MS).toBeLessThan(16.7);
  });
});

describe("mayScheduleAnotherPass", () => {
  it("never continues a pass that finished its work", () => {
    expect(mayScheduleAnotherPass(false, 0)).toBe(false);
    expect(mayScheduleAnotherPass(false, MAX_CONSECUTIVE_PASSES - 1)).toBe(false);
  });

  it("continues an interrupted pass while the valve is open", () => {
    expect(mayScheduleAnotherPass(true, 0)).toBe(true);
    expect(mayScheduleAnotherPass(true, MAX_CONSECUTIVE_PASSES - 1)).toBe(true);
  });

  it("closes the valve at the cap, so a layout that never settles cannot spin forever", () => {
    expect(mayScheduleAnotherPass(true, MAX_CONSECUTIVE_PASSES)).toBe(false);
    expect(mayScheduleAnotherPass(true, MAX_CONSECUTIVE_PASSES + 5)).toBe(false);
  });
});
