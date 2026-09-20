import { defineConfig } from "vitest/config";

/**
 * The editor's testable core is the **pagination engine** and the **variable
 * resolver** — both written as pure functions over an injected measurement
 * interface, so they can be verified here in a plain Node environment.
 *
 * There is deliberately no `jsdom`: pagination depends on real layout
 * (`offsetHeight`, computed line-height, actual text metrics) which jsdom does not
 * implement, so a jsdom test would assert a fiction rather than the behaviour. The
 * DOM-facing half is kept thin and is exercised by the live demos in the docs site.
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
