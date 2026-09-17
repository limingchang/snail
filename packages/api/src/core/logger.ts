import { LOG_LEVEL_WEIGHT } from "../default/options";
import type { SnailLogLevel } from "../typings/server";

/**
 * Level-gated logger.
 *
 * The pre-rewrite code called bare `console.log` from the middle of the request
 * pipeline, which made a request library noisy by default and impossible to
 * silence. Every diagnostic now goes through a logger whose level comes from
 * `@Server({ logLevel })`, and the default level is `"silent"`.
 */
export interface SnailLogger {
  /** Active level. */
  readonly level: SnailLogLevel;
  /** `true` when a message at `level` would be printed. */
  enabled(level: Exclude<SnailLogLevel, "silent">): boolean;
  error(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  debug(message: string, ...rest: unknown[]): void;
}

/** Create a logger honouring `@Server({ logLevel })`. */
export function createLogger(level: SnailLogLevel = "silent"): SnailLogger {
  const threshold = LOG_LEVEL_WEIGHT[level] ?? 0;

  return {
    level,
    enabled(candidate) {
      return threshold >= LOG_LEVEL_WEIGHT[candidate];
    },
    error(message, ...rest) {
      if (threshold >= LOG_LEVEL_WEIGHT.error) console.error(message, ...rest);
    },
    warn(message, ...rest) {
      if (threshold >= LOG_LEVEL_WEIGHT.warn) console.warn(message, ...rest);
    },
    info(message, ...rest) {
      if (threshold >= LOG_LEVEL_WEIGHT.info) console.info(message, ...rest);
    },
    debug(message, ...rest) {
      if (threshold >= LOG_LEVEL_WEIGHT.debug) console.debug(message, ...rest);
    }
  };
}
