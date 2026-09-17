/**
 * Build entry point for `@snail-js/cli`.
 *
 * ## Why a script instead of `tsc` alone
 *
 * Two things must happen around the compiler, and neither can be expressed in
 * `tsconfig.json`:
 *
 * 1. `dist/bin.js` must start with a shebang, otherwise `snail` is not runnable
 *    after `npm i -g`. `tsc` re-emits a shebang that is already in the source, but
 *    we do not rely on that — the file is re-checked here so the published
 *    artifact cannot silently lose its executable bit.
 * 2. `dist/bin.js` needs the executable permission on POSIX, which matters for
 *    `pnpm link` / `npm link` workflows.
 *
 * ## Why no API-extractor / dts plugin / ts-morph
 *
 * TypeScript 7 removed the programmatic Compiler API. Every tool that rolls up or
 * synthesises declarations (`vite-plugin-dts`, `rollup-plugin-dts`, `ts-morph`,
 * `typedoc`, `@microsoft/api-extractor`) drives that API and breaks. Declarations
 * are therefore emitted by `tsc` itself, one file per source file, with
 * `tsconfig.build.json` (`rootDir: src`, `outDir: dist`).
 *
 * ## Why `spawnSync(process.execPath, ...)`
 *
 * Spawning the `.CMD` shim needs `shell: true` on Windows, and a pipe-free
 * `stdio: "inherit"` keeps the run safe inside sandboxes that deny opening pipes.
 * Calling the compiler's JavaScript entry with the current Node binary avoids the
 * shim entirely.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scriptsDir);

/** `dist/bin.js` is the published entry; it must exist or the build is a lie. */
const BIN_FILE = join(packageRoot, "dist", "bin.js");

/** The one line that makes the entry point runnable by a POSIX shell. */
const SHEBANG = "#!/usr/bin/env node";

/**
 * Locate the `tsc` JavaScript entry through module resolution.
 *
 * The resolved path is `typescript/lib/typescript.js`, whose sibling `tsc.js` is
 * the actual CLI. Going through `require.resolve` keeps this working whichever
 * `node_modules` level pnpm hoisted the compiler to.
 */
function resolveTscEntry() {
  const typescriptMain = require.resolve("typescript");
  return join(dirname(typescriptMain), "tsc.js");
}

function runCompiler() {
  const tscEntry = resolveTscEntry();
  const result = spawnSync(process.execPath, [tscEntry, "-p", "tsconfig.build.json"], {
    cwd: packageRoot,
    stdio: "inherit"
  });

  if (result.error) {
    throw new Error(`failed to run tsc: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`tsc exited with code ${result.status ?? "null"}`);
  }
}

/**
 * Guarantee the shebang and the executable bit.
 *
 * Without the shebang `snail` fails with `SyntaxError: Invalid or unexpected
 * token` under a POSIX shell, which points at the wrong problem entirely.
 */
function finalizeBin() {
  if (!existsSync(BIN_FILE)) {
    throw new Error("tsc did not emit dist/bin.js — check the include/exclude of tsconfig.build.json");
  }

  const source = readFileSync(BIN_FILE, "utf8");
  if (!source.startsWith("#!")) {
    writeFileSync(BIN_FILE, `${SHEBANG}\n${source}`, "utf8");
  }

  try {
    chmodSync(BIN_FILE, 0o755);
  } catch {
    // Windows has no execute bit; the shebang is what matters there.
  }
}

try {
  runCompiler();
  finalizeBin();
  process.stdout.write("built @snail-js/cli -> dist\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
