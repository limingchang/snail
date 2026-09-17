/**
 * Build `@snail-js/api`.
 *
 * Two steps, deliberately split:
 *
 * 1. **Types** — `tsc -p tsconfig.build.json` emits `.d.ts` into `dist`.
 *    TypeScript 7.0 has no programmatic Compiler API (7.1 restores it), so
 *    `vite-plugin-dts`, `rollup-plugin-dts`, `ts-morph` and `api-extractor` are all
 *    unusable here. Driving the real `tsc` is the supported path.
 * 2. **JavaScript** — Vite library mode, one ES bundle per published entry point.
 *
 * Bundling rather than shipping raw `tsc` output is what makes the package work
 * under Node's native ESM resolver: `tsc` preserves the source's extensionless
 * relative imports, which only a bundler can resolve.
 *
 * `vue`, `react`, `zod` and `axios` stay external — they are optional peer
 * dependencies and must never be inlined into this package.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

// Vite shells out to `net use` on Windows; confined sandboxes deny the spawn and
// it throws synchronously before Vite's callback is attached. Neutralise it
// before Vite is imported — the same patch the test runner uses.
if (process.platform === "win32") {
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  childProcess.exec = function patchedExec(_command, options, callback) {
    const done = typeof options === "function" ? options : callback;
    if (typeof done === "function") {
      queueMicrotask(() =>
        done(new Error("[snail] child_process.exec is disabled by the build script"), "", "")
      );
    }
    return { on: () => undefined, once: () => undefined, kill: () => true };
  };
}

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = new URL("../dist", import.meta.url);

/** Every published entry point, matching the `exports` map in package.json. */
const ENTRIES = {
  index: "src/index.ts",
  "plugins/index": "src/plugins/index.ts",
  // The framework adapters get their own entries so the `plugins` barrel never
  // statically imports `vue` or `react` — see `src/plugins/index.ts`. Names carry
  // the trailing `index` so the emitted JS sits next to the `.d.ts` tree `tsc`
  // produces, keeping the layout predictable.
  "plugins/vue/index": "src/plugins/vue/index.ts",
  "plugins/react/index": "src/plugins/react/index.ts",
  "strategies/index": "src/strategies/index.ts",
  "strategies/plain": "src/strategies/plain.ts",
  "strategies/react": "src/strategies/react.ts"
};

/**
 * Peer dependencies and Node builtins that must not be bundled.
 *
 * A pattern list rather than a Set: `vue/dist/vue.runtime.esm-bundler.js` and
 * `react/jsx-runtime` both have to resolve to the same externals as their bare
 * package names.
 */
const EXTERNAL = [
  "axios",
  "vue",
  "react",
  "react-dom",
  "react/jsx-runtime",
  "zod",
  /^node:/,
  /^vue\//,
  /^react\//,
  /^zod\//
];

const { build } = await import("vite");

await rm(distDir, { recursive: true, force: true });

const result = await build({
  root,
  configFile: false,
  logLevel: "info",
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2022",
    minify: false,
    sourcemap: true,
    lib: {
      entry: Object.fromEntries(
        Object.entries(ENTRIES).map(([name, file]) => [name, resolve(root, file)])
      ),
      formats: ["es"]
    },
    rollupOptions: {
      external: EXTERNAL,
      output: {
        // `[name].js` keeps the on-disk layout identical to the `exports` map,
        // so `./dist/plugins/index.js` is exactly what `@snail-js/api/plugins`
        // resolves to.
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        preserveModules: false
      }
    }
  }
});

if (result) {
  // `build()` returns an array in watch mode and a single object otherwise.
  const outputs = Array.isArray(result) ? result : [result];
  for (const output of outputs) {
    for (const chunk of output.output ?? []) {
      if (chunk.type === "chunk" && chunk.isEntry) {
        console.log(`[snail] built ${chunk.fileName}`);
      }
    }
  }
}

// Declarations last, so a failure here is the loud final word rather than
// something a later JS emit could mask.
const tsc = spawnSync(
  process.execPath,
  [
    resolve(root, "../../node_modules/typescript/bin/tsc"),
    "-p",
    resolve(root, "tsconfig.build.json")
  ],
  { cwd: root, stdio: "inherit" }
);

if (tsc.status !== 0) {
  console.error("[snail] declaration emit failed");
  process.exit(tsc.status ?? 1);
}

const rewritten = await fixDeclarationSpecifiers(fileURLToPath(distDir));

console.log(
  `[snail] build complete: dist/*.js + dist/**/*.d.ts (${rewritten} declaration imports resolved)`
);

/**
 * Append `.js` to the relative specifiers inside the emitted `.d.ts` files.
 *
 * `tsc` preserves the source's extensionless relative imports, which
 * `moduleResolution: "bundler"` and `"node10"` accept but `"nodenext"` rejects
 * outright. Since these are plain strings in a declaration file, rewriting them
 * is safe, deterministic, and makes the package consumable under every
 * resolution mode — including a Node backend.
 *
 * Only specifiers that actually resolve to a sibling declaration file are
 * touched, so a bare package import is never modified.
 */
async function fixDeclarationSpecifiers(dir) {
  const files = await collect(dir, (name) => name.endsWith(".d.ts"));
  let count = 0;

  for (const file of files) {
    const original = await readFile(file, "utf8");
    const rewritten = original.replace(
      /(from\s+|import\()\s*(["'])(\.[^"']*)\2/g,
      (match, prefix, quote, specifier) => {
        if (/\.[cm]?[jt]s$/i.test(specifier)) return match;

        const base = resolve(dirname(file), specifier);
        if (existsSync(`${base}.d.ts`)) {
          count += 1;
          return `${prefix}${quote}${specifier}.js${quote}`;
        }
        if (existsSync(join(base, "index.d.ts"))) {
          count += 1;
          return `${prefix}${quote}${specifier}/index.js${quote}`;
        }
        return match;
      }
    );

    if (rewritten !== original) await writeFile(file, rewritten, "utf8");
  }

  return count;
}

/** Recursively collect files under `dir` whose name passes `match`. */
async function collect(dir, match) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collect(full, match)));
    } else if (match(entry.name)) {
      found.push(full);
    }
  }
  return found;
}
