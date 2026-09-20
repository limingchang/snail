import { defineConfig } from "vitest/config";

/**
 * The component packages are tested where it is meaningful: pure logic (icon
 * resolution, the context-menu state machine, the captcha load/teardown contract,
 * the pagination maths) is unit-tested here in a plain Node environment.
 *
 * There is deliberately no `jsdom`. Every DOM-dependent behaviour these packages
 * have depends on **real layout** — `offsetHeight`, line breaking, `@page` — which
 * jsdom does not implement, so a jsdom test would assert a fiction. Those paths are
 * covered by the live component demos in the docs site instead.
 *
 * `pool: "threads"` because the sandbox cannot spawn the `forks` pool's processes.
 */
export default defineConfig({
  test: {
    pool: "threads",
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    passWithNoTests: false
  }
});
