import { SnailError } from "./base";

/**
 * 缺少必需的配置块时抛出——server 类没有 `@Server()`、api 类没有 `@Api()`，
 * 或者某个值没能通过选项守卫。
 *
 * Thrown when a required configuration block is missing — a server class
 * without `@Server()`, an api class without `@Api()`, or a value that failed
 * one of the option guards.
 */
export class SnailOptionsError extends SnailError {
  /**
   * 构造一个选项错误。
   *
   * 错误码固定为 `SNAIL_OPTIONS_ERROR`。
   *
   * Build an options error.
   *
   * The code is always `SNAIL_OPTIONS_ERROR`.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 可选的底层原因 / Optional underlying cause
   */
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { code: "SNAIL_OPTIONS_ERROR", cause: options.cause });
  }
}
