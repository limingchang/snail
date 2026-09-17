/**
 * Level-gated logger for the CLI.
 *
 * ## Why this exists
 *
 * The CLI produces two very different kinds of text, and mixing them breaks both
 * of its uses:
 *
 * - **Product output** (`wrote 12 files`, the `--dry-run` listing) belongs on
 *   stdout even in a quiet run, because it *is* the command's result and callers
 *   pipe it.
 * - **Diagnostics** (`resolving $ref …`) must never reach stdout, because a
 *   script consuming the listing would choke on them.
 *
 * Funnelling both through one object keeps that split in a single place instead of
 * scattering `console.log` calls across the pipeline, and it lets every test
 * observe the pipeline's output without capturing a real stream.
 *
 * ## Why not `console.log`
 *
 * Level gating is per-call, not per-process: `--verbose` must be decidable at the
 * moment of writing, and `--dry-run` must still be able to tell the user what it
 * skipped. A global flag plus `console.log` cannot express that.
 */

/** Ordered from least to most talkative; a call prints when its level is ≤ `level`. */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

/** Sink for one already-formatted line, including its newline. */
export type LogSink = (chunk: string) => void;

/**
 * The logger every CLI module writes through.
 *
 * Injected rather than imported as a singleton so a test can capture output, and so the
 * level is decided once per run instead of per call site.
 */
export interface Logger {
  /** Effective level; callers may inspect it before doing expensive formatting. */
  readonly level: LogLevel;

  /** Whether a call at `level` would print. Cheap guard for costly messages. */
  isEnabled(level: LogLevel): boolean;

  /**
   * Product output — the command's actual result.
   *
   * Printed whenever the logger is not `silent`, so `--verbose` diagnostics never
   * displace it and a script can rely on stdout carrying only results.
   */
  out(message: string): void;

  /** Progress narration, only useful while debugging the generator itself. */
  debug(message: string): void;

  /** Something was skipped or is suspicious, but the run still succeeded. */
  warn(message: string): void;

  /** The run failed; always paired with a non-zero exit code by the caller. */
  error(message: string): void;
}

/** Construction options for {@link createLogger}. */
export interface LoggerOptions {
  level?: LogLevel;
  /** Overridable so tests can assert on output without touching the real stdio. */
  stdout?: LogSink;
  stderr?: LogSink;
}

function defaultStdout(chunk: string): void {
  process.stdout.write(chunk);
}

function defaultStderr(chunk: string): void {
  process.stderr.write(chunk);
}

/**
 * Build a logger that writes to stdout/stderr.
 *
 * Defaults to `info`: warnings and errors print, per-step diagnostics do not, which is
 * the behaviour a CI log wants.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const stdout = options.stdout ?? defaultStdout;
  const stderr = options.stderr ?? defaultStderr;

  const enabled = (candidate: LogLevel): boolean =>
    LEVEL_WEIGHT[candidate] <= LEVEL_WEIGHT[level] && level !== "silent";

  return {
    level,

    isEnabled: enabled,

    out(message) {
      if (level === "silent") return;
      stdout(`${message}\n`);
    },

    debug(message) {
      if (!enabled("debug")) return;
      stderr(`${message}\n`);
    },

    warn(message) {
      if (!enabled("warn")) return;
      stderr(`warn: ${message}\n`);
    },

    error(message) {
      if (!enabled("error")) return;
      stderr(`error: ${message}\n`);
    }
  };
}

/**
 * Map CLI flags onto a level.
 *
 * Kept separate from `createLogger` so the *policy* (`--verbose` means debug) does
 * not leak into the many modules that only need to write a line.
 */
export function resolveLogLevel(flags: { verbose?: boolean } = {}): LogLevel {
  return flags.verbose ? "debug" : "info";
}

/** A logger that swallows everything; the default for library-only callers. */
export function createSilentLogger(): Logger {
  return createLogger({ level: "silent" });
}
