import { isCancel } from "axios";
import { SnailCancelledError } from "../../error/request";
import { SnailHttpError, SnailResponseError } from "../../error/response";

/**
 * 判断一个错误是否表示「这次请求被有意停止」。
 *
 * 取消是**预期的控制流**，不是失败：`method.abort()` 和策略丢弃过期响应都会产生它。
 * 每个策略都必须在写入 `error` state 或触发 `onError` 之前问这个问题，否则用户主动
 * 中止请求时会看到一条本不该出现的错误提示。
 *
 * 鸭子类型式的 `code` 检查用于捕获调用方自带的 `AbortSignal` 产生的 `AbortError`，
 * axios 并不总会把它包装进自己的取消类。
 *
 * `true` when an error means "this request was deliberately stopped".
 *
 * Cancellation is **expected control flow**, not a failure: `method.abort()` and
 * a strategy discarding a stale response both produce it. Every strategy must ask
 * this question before writing `error` state or firing `onError`, otherwise a
 * user aborting a request would see a spurious error toast.
 *
 * The duck-typed `code` check is what catches an `AbortError` produced by a
 * caller-supplied `AbortSignal`, which axios does not always wrap in its own
 * cancel class.
 */
export function isCancellation(error: unknown): boolean {
  if (error instanceof SnailCancelledError) return true;
  if (isCancel(error)) return true;
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === "ERR_CANCELED" || code === "ABORT_ERR";
}

/**
 * 尽力读出失败的业务/HTTP code，供 `code` state 句柄使用。
 *
 * 从错误本身而不是从响应上读取，使 `code` 在失败路径上依然有意义——即便没有任何信封
 * 通过校验，`401` 也应该对 UI 可见。
 *
 * Best-effort business/HTTP code of a failure, for the `code` state handle.
 *
 * Reading it from the error rather than from a response keeps `code` meaningful
 * on the failure path too — a `401` should be visible to the UI even though no
 * envelope ever passed validation.
 */
export function readErrorCode(error: unknown): number | string | undefined {
  if (error instanceof SnailResponseError) return error.businessCode;
  if (error instanceof SnailHttpError) return error.status;

  const candidate = error as
    | { status?: unknown; response?: { status?: unknown } }
    | null
    | undefined;
  const value = candidate?.response?.status ?? candidate?.status;
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

/**
 * 尽力读出失败的可读信息，供 `message` 句柄使用。
 *
 * 优先取后端信封而不是 `Error.message`，因为 axios 的传输层信息
 * （"Request failed with status code 401"）给用户看毫无用处，而
 * `{ message: "token expired" }` 有用。
 *
 * Best-effort human readable message of a failure, for the `message` handle.
 *
 * The backend envelope is preferred over the `Error.message` because an axios
 * transport message ("Request failed with status code 401") is useless to show a
 * user while `{ message: "token expired" }` is not.
 */
export function readErrorMessage(error: unknown): string | undefined {
  if (error instanceof SnailResponseError) {
    const payload = error.payload as { message?: unknown } | null | undefined;
    if (payload && typeof payload.message === "string") return payload.message;
  }

  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" ? message : undefined;
}
