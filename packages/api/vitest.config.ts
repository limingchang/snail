import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

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
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/typings/**"]
    }
  }
});
