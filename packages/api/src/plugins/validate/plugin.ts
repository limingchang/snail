import { createPlugin } from "../../core/plugin";
import { unwrapEnvelope } from "../../core/response";
import { t } from "../../locale";
import { resolveRequestSchema, resolveResponseSchema } from "./decorators";
import { SnailValidationError } from "./type";
import type { ZodType } from "zod";
import type { SnailContext } from "../../core/context";
import type { ValidateOptions } from "./type";

/**
 * Zod 校验插件。
 *
 * ## 这种不对称是刻意的
 *
 * **请求不合法会中止本次调用。** 请求根本到不了网络：连自己的 schema 都过不了的请求体是
 * 程序员的失误，而它本会引发的后端报错指向了错误的层。
 *
 * **响应不合法只发出警告。** 响应已经拿到，而且正是调用方要的；因为后端新增、改名或改了
 * 某个字段的类型就把它丢掉，会把一次无害的漂移变成坏掉的页面。警告里会带上 zod 的问题
 * 列表，所以漂移在控制台里依然可见。
 *
 * ## 优先级
 *
 * `-50`——保留给校验的区间。在正向阶段，它在版本（`50`）与适配器（`0`）塑造完请求之后、
 * 在向缓存（`-100`）索取键之前运行；在解包阶段，它在缓存之后、适配器之前运行，因此响应
 * 会在 transform 插件把它替换成类实例**之前**被校验。
 *
 * Zod validation plugin.
 *
 * ## The asymmetry, and why it is deliberate
 *
 * **An invalid request aborts the call.** The request never reaches the network:
 * a body that fails its own schema is a programmer mistake, and the backend error
 * it would produce points at the wrong layer.
 *
 * **An invalid response only warns.** The response is already here and the caller
 * asked for it; throwing it away because the backend added, renamed or retyped a
 * field turns a cosmetic drift into a broken page. The warning carries zod's
 * issues so the drift is still visible in the console.
 *
 * ## Priority
 *
 * `-50` — the reserved validate band. In the forward phase it runs after the
 * version (`50`) and the adapters (`0`) have finished shaping the request, and
 * before the cache (`-100`) is asked for a key. On the unwind side it runs after
 * the cache and before the adapters, so the response is validated *before* the
 * transform plugin replaces the payload with class instances.
 */

/**
 * The value a request schema validates.
 *
 * Write verbs carry a body, read verbs carry query params. Validating the body
 * when there is one and the query otherwise means one decorator covers both, and
 * a request that carries neither (`undefined`) is left to the backend rather than
 * failing against an empty object.
 */
function requestTarget(ctx: SnailContext): unknown {
  return ctx.request.data !== undefined ? ctx.request.data : ctx.request.params;
}

/**
 * Validate the outgoing request, throwing when `strict`.
 *
 * Never calls `next()` on failure: the chain ends, `send()` rejects with the
 * {@link SnailValidationError}, and no axios adapter is ever reached.
 */
function validateRequest(
  ctx: SnailContext,
  schema: ZodType,
  strict: boolean,
  next: () => Promise<void>
): Promise<void> | void {
  const target = requestTarget(ctx);
  if (target === undefined) return next();

  const parsed = schema.safeParse(target);
  if (parsed.success) return next();

  const message = t("error.plugin.validate.request", ctx.fullName);

  if (!strict) {
    ctx.logger.warn(message, parsed.error.issues);
    return next();
  }

  throw new SnailValidationError(message, { issues: parsed.error.issues });
}

/**
 * Validate the response payload and warn about it.
 *
 * A throwing logger or a malformed schema must not fail the request, so the whole
 * check is defensive: the caller still receives the payload no matter what.
 */
function warnOnInvalidResponse(ctx: SnailContext, schema: ZodType): void {
  try {
    const response = ctx.getResponse();
    if (!response) return;

    const payload = unwrapEnvelope(response.data, ctx.serverOptions.dataKey);
    const parsed = schema.safeParse(payload);
    if (parsed.success) return;

    ctx.logger.warn(
      t("error.plugin.validate.response", ctx.fullName),
      parsed.error.issues
    );
  } catch (error) {
    ctx.logger.warn(t("error.plugin.validate.response", ctx.fullName), error);
  }
}

/**
 * 创建 zod 校验插件。
 *
 * Create the zod validation plugin.
 *
 * ```ts
 * Service.use(Validate({ strict: false }));
 * ```
 *
 * It is normally used without options, together with the decorators:
 * `Service.use(Validate())`.
 */
/**
 * 保留给校验的优先级区间。
 *
 * 正向顺序把它放在载荷已塑造之后、缓存计算键之前；解包顺序把它放在缓存存下原始信封之后、
 * 转换水合之前。之所以导出，是为了让别的插件可以相对它定位自己，而不是硬编码 `-50`。
 *
 * The reserved validation band.
 *
 * Forward order places it after the payload has been shaped but before the cache
 * hashes a key; unwind order places it after the cache stored the raw envelope and
 * before transformation hydrates it. Exported so a plugin can position itself
 * relative to it rather than hardcoding `-50`.
 */
export const VALIDATE_PRIORITY = -50;

/**
 * 校验插件工厂，交由 `Service.use()` 安装。
 *
 * The validate plugin factory, handed to `Service.use()`.
 *
 * @param options 校验插件配置 / Validate plugin options.
 * @returns 校验插件对象 / The validate plugin object.
 */
export const validatePlugin = createPlugin<ValidateOptions>({
  name: "validate",
  priority: VALIDATE_PRIORITY,

  setup(options) {
    const fallbackRequest = options?.request;
    const fallbackResponse = options?.response;
    const strict = options?.strict ?? true;

    return {
      beforeRequest(ctx, next) {
        const schema =
          resolveRequestSchema(ctx.apiClass, ctx.methodName) ?? fallbackRequest;
        if (!schema) return next();
        return validateRequest(ctx, schema, strict, next);
      },

      afterResponse(ctx, next) {
        const schema =
          resolveResponseSchema(ctx.apiClass, ctx.methodName) ?? fallbackResponse;
        if (schema) warnOnInvalidResponse(ctx, schema);
        return next();
      }
    };
  }
});
