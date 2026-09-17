import { SnailError } from "./base";

/**
 * Thrown when the backend answered with HTTP success but a business status code
 * that the configured {@link ServerOptions.validateCode} rule rejected.
 *
 * The whole parsed body is preserved on `payload`, so an application error
 * handler can still read `payload.message` / `payload.data`.
 */
export class SnailResponseError<T = unknown> extends SnailError {
  /** Business status code reported by the backend. */
  readonly businessCode: number | string | undefined;

  /** Full parsed response body. */
  readonly payload: T;

  constructor(
    message: string,
    options: { businessCode?: number | string; payload: T; cause?: unknown }
  ) {
    super(message, { code: "SNAIL_RESPONSE_ERROR", cause: options.cause });
    this.businessCode = options.businessCode;
    this.payload = options.payload;
  }
}

/**
 * Thrown when the transport failed: non-2xx status, network failure, timeout or
 * abort. `status` is present only when a response actually came back.
 */
export class SnailHttpError<T = unknown> extends SnailError {
  readonly status: number | undefined;
  readonly statusText: string | undefined;
  readonly payload: T | undefined;

  constructor(
    message: string,
    options: {
      status?: number;
      statusText?: string;
      payload?: T;
      cause?: unknown;
      code?: string;
    } = {}
  ) {
    super(message, { code: options.code ?? "SNAIL_HTTP_ERROR", cause: options.cause });
    this.status = options.status;
    this.statusText = options.statusText;
    this.payload = options.payload;
  }
}
