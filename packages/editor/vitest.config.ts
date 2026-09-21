import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/**
 * The editor's testable core is the **pagination engine** and the **variable
 * resolver** — both written as pure functions over an injected measurement
 * interface, so they can be verified here in a plain Node environment.
 *
 * The default environment stays `node` on purpose: pagination depends on real layout
 * (`offsetHeight`, computed line-height, actual text metrics) which a simulated DOM does not
 * implement, so a DOM test of *layout* would assert a fiction rather than the behaviour.
 *
 * ## The one exception, and why
 *
 * `tests/editor/mountStarter.spec.ts` opts into `happy-dom` with a per-file
 * `// @vitest-environment happy-dom` comment, because the bug it guards is not a layout bug: it is
 * that `v-model` never reached the editor's initial content, so every caller opened an empty
 * document. That is a *mounting* fact — the paper either carries the document's text or it does not
 * — and no pure test and no static assertion can see it. `@vitejs/plugin-vue` is therefore
 * registered so that a test may import a `.vue` file at all.
 *
 * `pool: "threads"` because the sandbox cannot spawn the `forks` pool's processes.
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    pool: "threads",
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    passWithNoTests: false
  }
});
