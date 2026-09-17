import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Whether this run is the coverage one.
 *
 * Vitest normally turns coverage on from `--coverage`, but this package has to launch
 * Vitest through `scripts/vitest-runner.mjs` (Vitest's default `forks` pool and Vite's
 * Windows `net use` probe both need a process spawn, which confined environments deny).
 * That runner forwards extra CLI arguments as *file filters*, so `--coverage` would be
 * read as "run a test file called --coverage" and the run would find nothing.
 *
 * `npm_lifecycle_event` is set by npm/pnpm to the script being run, which is a portable
 * signal that needs no extra argument — so `pnpm test:cov` collects coverage and
 * `pnpm test` stays fast.
 */
const isCoverageRun =
  process.env.npm_lifecycle_event === "test:cov" || process.argv.includes("--coverage");

export default defineConfig({
  root,
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts", "src/**/*.spec.ts"],

    // `threads` rather than Vitest's default `forks` pool: worker threads need no
    // process spawn, which confined build environments deny.
    pool: "threads",

    coverage: {
      enabled: isCoverageRun,
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts"]
    }
  }
});
