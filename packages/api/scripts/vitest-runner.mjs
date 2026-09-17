/**
 * Vitest launcher that also works inside a confined build sandbox.
 *
 * ## The problem
 *
 * On Windows, Vite resolves paths through `windowsSafeRealPathSync`, which on its
 * first call shells out to `net use` to discover mapped network drives:
 *
 * ```js
 * exec("net use", { windowsHide: true }, (error, stdout) => { ... })
 * ```
 *
 * `child_process.exec` uses piped stdio. A sandbox that forbids opening pipes
 * makes `spawn` throw `EPERM` *synchronously*, so `exec` throws before its
 * callback is ever attached and Vitest cannot even load its config.
 *
 * ## The fix
 *
 * Patch `child_process.exec` to report an error immediately, **before** Vite is
 * imported. Vite's handler begins with `if (error) return;`, so it keeps the plain
 * `fs.realpathSync` implementation. That is the correct outcome anyway — this
 * repository is not on a mapped network drive.
 *
 * ## Why `createRequire`
 *
 * The patch must land before Node builds the ESM facade for `node:child_process`,
 * otherwise Vite's `import { exec }` would bind to the original function.
 * `createRequire` returns the CommonJS exports object without creating that
 * facade.
 *
 * Outside a sandbox the patch is a no-op: it only skips network-drive detection,
 * which this project does not rely on.
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
    // Vite discards the return value, but return something ChildProcess-shaped so
    // other callers cannot trip over `undefined`.
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
