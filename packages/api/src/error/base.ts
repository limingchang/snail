/**
 * `@snail-js/api` 抛出的所有错误的基类。
 *
 * 每个子类都带有一个稳定的 `code`，这样应用代码无需导入具体类即可按
 * `error.code` 分支，本地化层也能据此渲染出翻译后的消息。
 *
 * Base class of every error `@snail-js/api` throws.
 *
 * A stable `code` is attached to each subclass so application code can branch
 * on `error.code` without importing the class, and so the localization layer can
 * render a translated message.
 */
export class SnailError extends Error {
  /**
   * 机器可读且稳定的错误类型标识，应用代码可据此分支。
   *
   * Machine-readable, stable identifier of this error kind.
   */
  readonly code: string;

  /**
   * 底层原因（当存在时，通常是 `AxiosError`）。
   *
   * The underlying cause, when one exists (usually an `AxiosError`).
   */
  override readonly cause: unknown;

  /**
   * 构造一个错误。
   *
   * `name` 取自 `new.target.name`，所以子类不必各自设置；`code` 缺省为
   * `"SNAIL_ERROR"`。在支持 `Error.captureStackTrace` 的运行时里，栈顶会指向
   * 子类的构造函数，而不是本构造函数。
   *
   * Build an error.
   *
   * The `name` is taken from `new.target.name` so subclasses need not set it, and
   * `code` defaults to `"SNAIL_ERROR"`. Where `Error.captureStackTrace` exists,
   * the stack starts at the subclass constructor rather than at this one.
   *
   * @param message 供人阅读的错误信息 / Human-readable error message
   * @param options 可选的错误类型标识与底层原因 / Optional error code and underlying cause
   */
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

  /**
   * 对所有源自本库的错误返回 `true`。
   *
   * `true` for every error originating from this library.
   *
   * @param value 待判断的值 / The value to test.
   * @returns 是 `SnailError` 实例时为 `true` / `true` when it is a `SnailError`.
   */
  static isSnailError(value: unknown): value is SnailError {
    return value instanceof SnailError;
  }
}
