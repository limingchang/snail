import { LOG_LEVEL_WEIGHT } from "../default/options";
import type { SnailLogLevel } from "../typings/server";

/**
 * 按级别过滤输出的 logger。
 *
 * 重写前的代码会在请求管线中间直接调用裸 `console.log`，这让一个请求库默认就很吵，
 * 而且无法让它安静下来。现在所有诊断都经过 logger，级别来自
 * `@Server({ logLevel })`，默认级别是 `"silent"`。
 *
 * Level-gated logger.
 *
 * The pre-rewrite code called bare `console.log` from the middle of the request
 * pipeline, which made a request library noisy by default and impossible to
 * silence. Every diagnostic now goes through a logger whose level comes from
 * `@Server({ logLevel })`, and the default level is `"silent"`.
 */
export interface SnailLogger {
  /**
   * 当前生效的级别。
   *
   * Active level.
   */
  readonly level: SnailLogLevel;
  /**
   * 指定级别的消息是否会被打印。
   *
   * `true` when a message at `level` would be printed.
   *
   * @param level 待判断的级别 / The level to check.
   * @returns 会被打印时为 `true` / `true` when it would be printed.
   */
  enabled(level: Exclude<SnailLogLevel, "silent">): boolean;
  /**
   * 输出 error 级诊断。
   *
   * Log an error-level diagnostic.
   *
   * @param message 主消息 / The main message.
   * @param rest 附加参数，原样透传给 `console` / Extra arguments forwarded to `console`.
   */
  error(message: string, ...rest: unknown[]): void;
  /**
   * 输出 warn 级诊断。
   *
   * Log a warn-level diagnostic.
   *
   * @param message 主消息 / The main message.
   * @param rest 附加参数，原样透传给 `console` / Extra arguments forwarded to `console`.
   */
  warn(message: string, ...rest: unknown[]): void;
  /**
   * 输出 info 级诊断。
   *
   * Log an info-level diagnostic.
   *
   * @param message 主消息 / The main message.
   * @param rest 附加参数，原样透传给 `console` / Extra arguments forwarded to `console`.
   */
  info(message: string, ...rest: unknown[]): void;
  /**
   * 输出 debug 级诊断。
   *
   * Log a debug-level diagnostic.
   *
   * @param message 主消息 / The main message.
   * @param rest 附加参数，原样透传给 `console` / Extra arguments forwarded to `console`.
   */
  debug(message: string, ...rest: unknown[]): void;
}

/**
 * 创建一个遵循 `@Server({ logLevel })` 的 logger。
 *
 * 级别权重表里查不到的级别按 0 处理，也就是静默 —— 未知配置不应让库变得吵闹。
 *
 * Create a logger honouring `@Server({ logLevel })`.
 *
 * @param level 输出级别，默认 `"silent"` / Output level, `"silent"` by default.
 * @returns 按级别过滤输出的 logger / A logger that gates output by level.
 */
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
