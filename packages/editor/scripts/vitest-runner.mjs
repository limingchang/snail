/**
 * Vitest launcher that also works inside a confined build sandbox.
 *
 * On Windows, Vite resolves paths through `windowsSafeRealPathSync`, which on its
 * first call shells out to `net use` to discover mapped network drives. That uses
 * `child_process.exec`, whose piped stdio a confined sandbox denies — the spawn
 * throws `EPERM` synchronously, before the callback is attached, so Vitest cannot
 * even load its config.
 *
 * Patching `exec` **before** Vite is imported makes Vite's handler take its
 * `if (error) return;` branch and keep the plain `fs.realpathSync` implementation,
 * which is correct for a repository that is not on a mapped network drive.
 *
 * `createRequire` is used on purpose: it returns the CommonJS exports object
 * without building Node's ESM facade for `node:child_process`, so the patch lands
 * before Vite's `import { exec }` binds to the original function.
 *
 * Outside a sandbox the patch only skips network-drive detection.
 */
import { createRequire } from "node:module";

if (process.platform === "win32") {
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");

  const original = childProcess.exec;

  childProcess.exec = function patchedExec(_command, options, callback) {
    const done = typeof options === "function" ? options : callback;
    if (typeof done === "function") {
      queueMicrotask(() =>
        done(new Error("[snail] child_process.exec is disabled by the test runner"), "", "")
      );
    }
    return {
      on() {
        return this;
      },
      once() {
        return this;
      },
      kill() {
        return true;
      },
      pid: undefined,
      original
    };
  };
}

const { startVitest } = await import("vitest/node");

// `run` is Vitest's "don't watch" subcommand, not a file filter — drop it and let
// the `run: true` option below express the same thing.
const cliArgs = process.argv.slice(2).filter((arg) => arg !== "run");
const vitest = await startVitest("test", cliArgs, { run: true });

if (!vitest) process.exit(1);
await vitest.close();

const failed = vitest.state.getCountOfFailedTests?.() ?? 0;
const errors = vitest.state.getCountOfFailedTestSuites?.() ?? 0;
process.exit(failed > 0 || errors > 0 ? 1 : 0);
