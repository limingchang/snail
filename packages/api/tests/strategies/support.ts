import { Server, SnailServer } from "../../src/index";
import { createTestAdapter } from "../helpers/test-adapter";

/**
 * Build a throwaway server whose transport is a recording adapter.
 *
 * Copied from `tests/core/core.spec.ts` on purpose: exercising the *real* axios
 * adapter path is what makes a strategy bug observable, and a stubbed axios would
 * hide exactly the config mutations this layer performs.
 */
export function buildServer(reply: Parameters<typeof createTestAdapter>[0] = {}) {
  const test = createTestAdapter(reply);

  @Server({ baseURL: "/api", adapter: test.adapter })
  class TestServer extends SnailServer {}

  return { Service: new TestServer(), test };
}

/** Real-timer sleep. Kept short in every test: a strategy must never need long. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition that a background task will eventually satisfy.
 *
 * Uploads and preloads finish off the returned promise, so a test has no promise
 * to await. Polling a few milliseconds is deterministic enough for these timings
 * and, unlike a fixed sleep, cannot flake on a slow machine.
 */
export async function until(predicate: () => boolean, attempts = 200): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await delay(1);
  }
  throw new Error("[snail] test condition was not met in time");
}
