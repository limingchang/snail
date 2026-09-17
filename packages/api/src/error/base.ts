/**
 * Base class of every error `@snail-js/api` throws.
 *
 * A stable `code` is attached to each subclass so application code can branch
 * on `error.code` without importing the class, and so the localization layer can
 * render a translated message.
 */
export class SnailError extends Error {
  /** Machine-readable, stable identifier of this error kind. */
  readonly code: string;

  /** The underlying cause, when one exists (usually an `AxiosError`). */
  override readonly cause: unknown;

  constructor(
    message: string,
    options: { code?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? "SNAIL_ERROR";
    this.cause = options.cause;

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** `true` for every error originating from this library. */
  static isSnailError(value: unknown): value is SnailError {
    return value instanceof SnailError;
  }
}
