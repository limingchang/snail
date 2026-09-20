/**
 * Shared Vite-library build for the Vue packages (`@snail-js/vue`, `@snail-js/editor`).
 *
 * `packages/api` builds with a self-contained `scripts/build.mjs` because it is a
 * plain-TypeScript package. The Vue packages need the same four steps, so the logic
 * lives here once and each package's `scripts/build.mjs` is a thin call:
 *
 * 1. **JavaScript** — Vite library mode with `@vitejs/plugin-vue`.
 * 2. **CSS** — one `dist/style.css`, never a per-component split. A library that
 *    emits one stylesheet per SFC forces a consumer to import N files to get one
 *    component working.
 * 3. **Types** — `vue-tsc`, the only emitter that understands `.vue`.
 * 4. **Declaration specifiers** — see {@link fixDeclarationSpecifiers}.
 *
 * ## Why Vite and the Vue plugin are passed in
 *
 * pnpm's isolated linker installs a package's dependencies into *that package's*
 * `node_modules`, and this file lives at the repository root, where neither `vite`
 * nor `@vitejs/plugin-vue` exists. A bare `import("vite")` here therefore fails with
 * `ERR_MODULE_NOT_FOUND: vite`, and resolving it manually through
 * `createRequire(...).resolve()` would pick up Vite's CommonJS entry, whose named
 * exports depend on `cjs-module-lexer` guessing right.
 *
 * So each package's own `scripts/build.mjs` — which *is* inside the package, and
 * therefore resolves its own tools with the correct `import` export condition —
 * hands them over:
 *
 * ```js
 * import { build } from "vite";
 * import vue from "@vitejs/plugin-vue";
 * import { buildVueLibrary } from "../../../scripts/build-vue-lib.mjs";
 *
 * await buildVueLibrary(fileURLToPath(new URL("..", import.meta.url)), { build, vue });
 * ```
 *
 * ## Why every dependency is external
 *
 * The externals list is derived from the package's own `dependencies` and
 * `peerDependencies` rather than hand-written. For these packages that is not a
 * nicety: `@tiptap/*` and `prosemirror-*` must resolve to a single instance in the
 * consumer's bundle, because ProseMirror compares schema and node identity with
 * `instanceof`. A second copy silently produces "cannot find node type" errors at
 * runtime. Deriving the list also means a newly added dependency cannot be forgotten
 * and accidentally inlined.
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

// Vite shells out to `net use` on Windows. A confined sandbox denies that spawn and
// Vite throws synchronously before its callback is attached, so the call is
// neutralised before Vite is exercised — the same patch `packages/api` uses.
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

/**
 * Build one Vue library package.
 *
 * @param {string} packageRoot Absolute path of the package directory.
 * @param {{
 *   build: (config: unknown) => Promise<unknown>,
 *   vue: () => unknown,
 *   entries?: Record<string, string>
 * }} tools The package's own Vite `build` and Vue plugin, plus an optional entry map
 *   (defaults to `{ index: "src/index.ts" }`). They are injected rather than imported
 *   here for the reason in the file header.
 */
export async function buildVueLibrary(packageRoot, tools) {
  const root = packageRoot;
  const distDir = join(root, "dist");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

  if (typeof tools?.build !== "function" || typeof tools?.vue !== "function") {
    throw new Error(
      "[snail] buildVueLibrary needs the package's own `build` and `vue` — see the " +
        "file header for why they cannot be imported from here"
    );
  }

  const entries = tools.entries ?? { index: "src/index.ts" };

  await rm(distDir, { recursive: true, force: true });

  const result = await tools.build({
    root,
    configFile: false,
    logLevel: "info",
    plugins: [tools.vue()],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      target: "es2022",
      minify: false,
      sourcemap: true,
      // One stylesheet for the whole package, emitted as `dist/style.css` — the path
      // the `exports` map advertises as `./style.css`.
      cssCodeSplit: false,
      lib: {
        entry: Object.fromEntries(
          Object.entries(entries).map(([name, file]) => [name, resolve(root, file)])
        ),
        formats: ["es"],
        cssFileName: "style"
      },
      rollupOptions: {
        external: externalMatchers(pkg),
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name]-[hash].js"
        }
      }
    }
  });

  for (const output of Array.isArray(result) ? result : [result]) {
    for (const chunk of output?.output ?? []) {
      if (chunk.type === "chunk" && chunk.isEntry) console.log(`[snail] built ${chunk.fileName}`);
      if (chunk.type === "asset" && String(chunk.fileName).endsWith(".css")) {
        console.log(`[snail] built ${chunk.fileName}`);
      }
    }
  }

  // Declarations last, so a failure here is the loud final word rather than
  // something a later JS emit could mask. `vue-tsc` is resolved as a *path* from the
  // package's own `node_modules`, which needs no export-condition guesswork.
  const vueTscBin = createRequire(join(root, "package.json")).resolve("vue-tsc/bin/vue-tsc.js");

  const tsc = spawnSync(
    process.execPath,
    [vueTscBin, "-p", join(root, "tsconfig.build.json")],
    { cwd: root, stdio: "inherit" }
  );

  if (tsc.status !== 0) {
    console.error("[snail] declaration emit failed");
    process.exit(tsc.status ?? 1);
  }

  const rewritten = await fixDeclarationSpecifiers(distDir);

  if (!existsSync(join(distDir, "style.css"))) {
    console.warn(
      "[snail] warning: dist/style.css was not emitted — check that a stylesheet is imported from src/index.ts"
    );
  }

  console.log(
    `[snail] build complete: dist/*.js + dist/style.css + dist/**/*.d.ts (${rewritten} declaration imports resolved)`
  );
}

/**
 * Every import that must stay outside the bundle: the package's own declared
 * dependencies and peers, plus Node builtins.
 *
 * Subpath imports (`element-plus/es/...`, `@tiptap/core/...`) have to match too, so
 * each bare name is paired with a prefix matcher.
 */
function externalMatchers(pkg) {
  const names = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {})
  ]);

  const matchers = [/^node:/];
  for (const name of names) matchers.push(name, new RegExp(`^${escapeRegExp(name)}/`));
  return matchers;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Append `.js` to relative specifiers inside the emitted `.d.ts` files.
 *
 * `vue-tsc` preserves the source's extensionless relative imports, which
 * `moduleResolution: "bundler"` accepts but `"nodenext"` rejects. Since these are
 * plain strings in a declaration file, rewriting them is safe and makes the package
 * consumable under every resolution mode.
 *
 * **`.vue` specifiers are deliberately left alone.** `vue-tsc` names a component's
 * declaration after the source file (`icon.vue.d.ts`), so `from "./icon.vue"` already
 * resolves to it; appending `.js` would point at a file that does not exist.
 */
async function fixDeclarationSpecifiers(dir) {
  if (!existsSync(dir)) return 0;

  const files = await collect(dir, (name) => name.endsWith(".d.ts"));
  let count = 0;

  for (const file of files) {
    const original = await readFile(file, "utf8");
    const rewritten = original.replace(
      /(from\s+|import\()\s*(["'])(\.[^"']*)\2/g,
      (match, prefix, quote, specifier) => {
        if (/\.(?:[cm]?[jt]s|vue|json|css|scss)$/i.test(specifier)) return match;

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
    if (entry.isDirectory()) found.push(...(await collect(full, match)));
    else if (match(entry.name)) found.push(full);
  }
  return found;
}
