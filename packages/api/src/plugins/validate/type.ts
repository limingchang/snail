import type { ZodType, core } from "zod";
import { SnailError } from "../../error/base";

/**
 * Zod 校验插件类型。
 *
 * `zod` 是可选的 peer 依赖，而本目录是库中唯一允许引用它的地方。这里全部是**类型**引用，
 * 所以导入插件永远不会把 zod 的运行时带进产物：schema 由应用提供，而应用本来就有 zod。
 *
 * Zod validation plugin types.
 *
 * `zod` is an optional peer dependency and this directory is the only place in the
 * library allowed to reference it. Everything here is a *type* reference, so
 * importing the plugin never pulls zod's runtime into the bundle: the schemas are
 * supplied by the application, which already has zod.
 */

/**
 * zod 报告的单个问题。
 *
 * 以库自有的名字重新导出，好让应用代码在不导入 zod 内部 `core` 命名空间的情况下给错误
 * 处理器标注类型——那个命名空间的弃用风波不应该经由本库传到调用方。
 *
 * One problem zod reported.
 *
 * Re-exported under a library-owned name so application code can type an error
 * handler without importing zod's internal `core` namespace — the deprecation
 * churn of that namespace should not reach callers through this library.
 */
export type SnailValidationIssue = core.$ZodIssue;

/**
 * `Validate` 插件工厂接受的选项。
 *
 * Options accepted by the `Validate` plugin factory.
 */
export interface ValidateOptions {
  /**
   * 没有任何 `@Validate()` 装饰器声明 schema 时使用的 schema。
   *
   * Schema applied when no `@Validate()` decorator declares one.
   */
  request?: ZodType;

  /**
   * 没有任何 `@ValidateResponse()` 装饰器声明 schema 时使用的 schema。
   *
   * Schema applied when no `@ValidateResponse()` decorator declares one.
   */
  response?: ZodType;

  /**
   * *请求*不合法时是否中止本次调用。
   *
   * 默认 `true`。`false` 会把失败降级为警告并放行请求——在后端契约仍在变动时开发很有用，
   * 但永远不适合生产环境。响应从不做严格校验。
   *
   * Whether an invalid *request* aborts the call.
   *
   * Defaults to `true`. `false` downgrades the failure to a warning and lets the
   * request go out — useful while developing against a backend whose contract is
   * still moving, and never a good idea in production. Responses are never
   * validated strictly.
   */
  strict?: boolean;
}

/**
 * 请求载荷不满足其 schema 时抛出。
 *
 * 请求在**任何东西到达网络之前**就被放弃，而这正是校验请求的全部意义：一个仍然发出的
 * 非法请求体会产生看起来像服务端 bug 的后端错误，以及一个 4xx——它污染应用的错误处理，
 * 而实际原因只是程序员的失误。
 *
 * `issues` 是 zod 自己的列表，原样保留，好让应用渲染字段路径与消息，而不必解析字符串。
 *
 * Thrown when the request payload does not satisfy its schema.
 *
 * The request is abandoned **before** anything reaches the network, which is the
 * whole point of validating a request: an invalid body that is still sent produces
 * a backend error that looks like a server bug, and a `4xx` that pollutes the
 * application's error handling for what is really a programmer mistake.
 *
 * `issues` is zod's own list, kept verbatim so the application can render field
 * paths and messages instead of parsing a string.
 */
export class SnailValidationError extends SnailError {
  /**
   * zod 报告的每个问题，保持 zod 原有的形状。
   *
   * Every issue zod reported, in zod's original shape.
   */
  readonly issues: readonly SnailValidationIssue[];

  /**
   * 创建校验失败错误。
   *
   * Create a validation failure error.
   *
   * @param message 错误信息 / The error message.
   * @param options zod 的问题列表与可选的底层原因 / zod's issues plus an optional cause.
   */
  constructor(
    message: string,
    options: { issues: readonly SnailValidationIssue[]; cause?: unknown }
  ) {
    super(message, { code: "SNAIL_VALIDATION_ERROR", cause: options.cause });
    this.issues = options.issues;
  }
}
