import { SnailError } from "../../error/base";

/**
 * 请求池拒绝请求时可能携带的错误码。
 *
 * `isPoolError()` 是受支持的判定方式，但这些字符串同样对外导出，好让应用精确地 switch
 * 其中一个——例如把「队列已满，稍后重试」与「用户已经离开页面」区分开。
 *
 * The error codes a request-pool refusal can carry.
 *
 * `isPoolError()` is the supported way to test them, but the strings are exported
 * so an application can switch on one precisely — for example to distinguish "the
 * queue was full, try again shortly" from "the user navigated away".
 */
export const POOL_ERROR_CODES = {
  /**
   * 已达到 `maxQueue`，请求从未发出。
   *
   * `maxQueue` was reached; the request was never sent.
   */
  queueFull: "SNAIL_POOL_QUEUE_FULL",
  /**
   * 请求等待时间超过 `queueTimeout`，已被丢弃。
   *
   * The request waited longer than `queueTimeout` and was dropped.
   */
  queueTimeout: "SNAIL_POOL_QUEUE_TIMEOUT",
  /**
   * 请求在仍等待槽位时被取消。
   *
   * The request was cancelled while it was still waiting for a slot.
   */
  aborted: "SNAIL_POOL_ABORTED",
  /**
   * 队列被清空——通常是因为插件被卸载。
   *
   * The queue was cleared — usually because the plugin was uninstalled.
   */
  cleared: "SNAIL_POOL_CLEARED"
} as const;

/**
 * {@link SnailPoolError} 可能携带的任意错误码。
 *
 * Any code {@link SnailPoolError} can carry.
 */
export type PoolErrorCode = (typeof POOL_ERROR_CODES)[keyof typeof POOL_ERROR_CODES];

/**
 * 请求池拒绝或丢弃请求时抛出。
 *
 * 这里使用专门的类而不是复用 `SnailRequestError`：请求池的拒绝意味着请求**从未到达
 * 网络**，与传输层失败是性质不同的情况。重试安全且通常正确，载荷未被触碰，服务端状态
 * 也没有变化——分辨不出二者的调用方，要么会重试服务端已经处理过的请求，要么会放弃一个
 * 仅仅因为拥挤而排队的请求。
 *
 * Raised when the pool refuses or drops a request.
 *
 * A dedicated class rather than a reuse of `SnailRequestError`: a pool refusal
 * means the request **never reached the network**, which is a materially different
 * situation from a transport failure. Retrying is safe and usually correct, the
 * payload is untouched, and no server state changed — a caller that cannot tell the
 * two apart will either retry a request the server already processed, or give up on
 * one that was merely queued behind a burst.
 */
export class SnailPoolError extends SnailError {
  /**
   * 本次拒绝属于哪一种。
   *
   * Which refusal this is.
   */
  declare readonly code: PoolErrorCode;

  /**
   * 创建请求池错误。
   *
   * Create a pool error.
   *
   * @param message 错误信息 / The error message.
   * @param code 拒绝类型 / Which refusal this is.
   * @param options 可选的底层原因 / Optional underlying cause.
   */
  constructor(message: string, code: PoolErrorCode, options: { cause?: unknown } = {}) {
    super(message, { code, cause: options.cause });
  }
}
