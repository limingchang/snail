/**
 * The error type every captcha failure is reported as.
 *
 * The legacy component's only error path was a bare `throw new Error("网络错误")`
 * inside an async callback nobody awaited: the message was wrong (the script had
 * *loaded*; the widget failed to initialise), it had no code, and it was never
 * surfaced to the caller. Every failure here carries a machine-readable `code` so a
 * consumer can branch on it without matching message strings.
 */

/** What kind of failure this is. */
export type CaptchaErrorCode =
  | "missing-script-src"
  | "invalid-props"
  | "unsupported-environment"
  | "script-load-failed"
  | "script-timeout"
  | "init-failed"
  | "not-ready";

/** An `Error` with a stable `code`. */
export class AliCaptchaError extends Error {
  /** Machine-readable failure kind. */
  readonly code: CaptchaErrorCode;

  constructor(code: CaptchaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    // `name` matters for logs and for `instanceof`-free checks across bundles.
    this.name = "AliCaptchaError";
    this.code = code;
  }
}
