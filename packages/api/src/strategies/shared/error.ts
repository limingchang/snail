import { isCancel } from "axios";
import { SnailCancelledError } from "../../error/request";
import { SnailHttpError, SnailResponseError } from "../../error/response";

/**
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
