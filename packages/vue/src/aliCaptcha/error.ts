/**
 * 所有验证码失败统一上报的错误类型。
 *
 * 旧版组件唯一的错误路径是在无人 await 的异步回调里 `throw new Error("网络错误")`：
 * 消息本身是错的（脚本其实**已经加载**，失败的是挂件初始化），没有 code，也从未
 * 传递给调用方。这里的每个失败都带一个机器可读的 `code`，使用方无需匹配消息字符串
 * 即可分支处理。
 *
 * The error type every captcha failure is reported as.
 *
 * The legacy component's only error path was a bare `throw new Error("网络错误")`
 * inside an async callback nobody awaited: the message was wrong (the script had
 * *loaded*; the widget failed to initialise), it had no code, and it was never
 * surfaced to the caller. Every failure here carries a machine-readable `code` so a
 * consumer can branch on it without matching message strings.
 */

/**
 * 失败的种类。每种失败都用稳定的 `code` 表达，使用方无需匹配消息字符串即可分支处理。
 *
 * What kind of failure this is.
 */
export type CaptchaErrorCode =
  /** 缺少 `scriptSrc`。 / Missing `scriptSrc`. */
  | "missing-script-src"
  /** props 非法。 / Invalid props. */
  | "invalid-props"
  /** 当前环境不支持。 / Unsupported environment. */
  | "unsupported-environment"
  /** 脚本加载失败。 / The script failed to load. */
  | "script-load-failed"
  /** 脚本加载超时。 / The script load timed out. */
  | "script-timeout"
  /** 初始化失败。 / Initialisation failed. */
  | "init-failed"
  /** 实例尚未就绪。 / The instance is not ready. */
  | "not-ready";

/**
 * 带稳定 `code` 的 `Error`：所有验证码失败都用它上报。
 *
 * An `Error` with a stable `code`.
 */
export class AliCaptchaError extends Error {
  /** 机器可读的失败种类。 / Machine-readable failure kind. */
  readonly code: CaptchaErrorCode;

  /**
   * 创建一个错误；`options` 原样透传给 `Error`（通常用来传 `cause`）。
   *
   * @param code 机器可读的失败种类 / Machine-readable failure kind.
   * @param message 人类可读的说明 / Human-readable description.
   * @param options 标准的 `ErrorOptions` / Standard `ErrorOptions`.
   */
  constructor(code: CaptchaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    // `name` matters for logs and for `instanceof`-free checks across bundles.
    this.name = "AliCaptchaError";
    this.code = code;
  }
}
