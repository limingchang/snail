import { createPlugin } from "../../core/plugin";
import { looksLikeEnvelope, unwrapEnvelope } from "../../core/response";
import { t } from "../../locale";
import { resolveDto } from "./decorators";
import { DEFAULT_MAX_DEPTH, hydrate } from "./hydrate";
import type { SnailContext } from "../../core/context";
import type { DtoType, TransformOptions } from "./type";

/**
 * JSON → 类的转换插件。
 *
 * 在调用方（或策略）看到响应之前，就把响应的解包载荷替换为 `@Transform(DtoClass)` 声明的
 * DTO 实例，因此 `result.data instanceof UserDto` 成立，DTO 上的方法也可调用。
 *
 * ## 为什么放在 `afterResponse` 而不是结果构建之后
 *
 * `afterResponse` 运行时，响应仍是唯一的真相来源：信封校验、`buildResult` 与 `success`
 * 事件都读取 `ctx.response`，所以在这里改写响应意味着后续每一步——尤其是 `result.data`
 * ——都自然一致，无需第二条代码路径。
 *
 * ## 优先级
 *
 * `0`。在解包一侧，它排在 validate 插件（`-50`）之后，这是刻意的：schema 描述的是后端
 * 发来的 JSON，若改为校验水合后的实例，就等于拿 DTO 实例去比对 JSON schema，会在每个
 * `Date` 上失败。
 *
 * JSON → class transform plugin.
 *
 * Replaces the unwrapped payload of a response with instances of the DTO declared
 * by `@Transform(DtoClass)` before the caller (or a strategy) ever sees it, so
 * `result.data instanceof UserDto` holds and methods on the DTO are callable.
 *
 * ## Why `afterResponse` and not after the result is built
 *
 * `afterResponse` runs while the response is still the source of truth: the
 * envelope validation, `buildResult` and the `success` event all read
 * `ctx.response`, so rewriting the response there means every later step — and
 * `result.data` in particular — is consistent without a second code path.
 *
 * ## Priority
 *
 * `0`. On the unwind side that puts it *after* the validate plugin (`-50`), which
 * is deliberate: the schema describes the JSON the backend sends, so validating
 * the hydrated instance instead would compare DTO instances against a JSON schema
 * and fail on every `Date`.
 */

/** Transform options with defaults applied, captured once per server. */
interface ResolvedTransform {
  keepUnknown: boolean;
  maxDepth: number;
}

/**
 * Hydrate the live response payload in place (by replacing the response body).
 *
 * A hydration failure must not corrupt the response: a throwing DTO constructor or
 * a broken `fromJSON` is reported and the raw JSON is left exactly as it arrived,
 * because a partially hydrated body is worse than an unhydrated one.
 */
function transformResponse(
  ctx: SnailContext,
  Dto: DtoType,
  options: ResolvedTransform
): void {
  const response = ctx.getResponse();
  if (!response) return;

  const { dataKey } = ctx.serverOptions;

  try {
    const envelope = response.data;
    const payload = unwrapEnvelope(envelope, dataKey);
    const hydrated = hydrate(payload, Dto, {
      keepUnknown: options.keepUnknown,
      maxDepth: options.maxDepth,
      ctx
    });

    // A raw (non-envelope) body has no key to rewrite, so the whole body is
    // replaced instead of digging for a `data` field that does not exist.
    ctx.setResponse({
      ...response,
      data: looksLikeEnvelope(envelope, dataKey)
        ? { ...(envelope as Record<string, unknown>), [dataKey]: hydrated }
        : hydrated
    });
  } catch (error) {
    ctx.logger.warn(t("error.plugin.transform", ctx.fullName, String(error)));
  }
}

/**
 * 创建转换插件。
 *
 * Create the transform plugin.
 *
 * ```ts
 * Service.use(Transform());
 *
 * @Api("/user")
 * @Transform(UserDto)
 * class UserApi {
 *   @Get("/:id")
 *   getUser(@Params("id") id: string): Promise<UserDto> { return null!; }
 * }
 * ```
 *
 * Without a DTO — no decorator and no `dto` option — the plugin is a no-op and the
 * payload stays the plain object JSON.parse produced.
 */
/**
 * 转换所在的优先级区间——也是第三方插件拿到的默认值。
 *
 * 导出它而不是留一个字面量 `0`，是为了让意图可读：转换位于普通区间，依赖的是与注册顺序
 * 无关的排序，而不是某个特权数字。
 *
 * The transform band — the same default a third-party plugin gets.
 *
 * It is exported rather than left as a bare `0` so the intent is legible: transform
 * sits in the ordinary band and relies on registration-independent ordering rather
 * than on a privileged number.
 */
export const TRANSFORM_PRIORITY = 0;

/**
 * 转换插件工厂，交由 `Service.use()` 安装。
 *
 * The transform plugin factory, handed to `Service.use()`.
 *
 * @param options 转换插件配置 / Transform plugin options.
 * @returns 转换插件对象 / The transform plugin object.
 */
export const transformPlugin = createPlugin<TransformOptions>({
  name: "transform",
  priority: TRANSFORM_PRIORITY,

  setup(options) {
    const fallbackDto = options?.dto;
    const resolved: ResolvedTransform = {
      keepUnknown: options?.keepUnknown ?? false,
      maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH
    };

    return {
      afterResponse(ctx, next) {
        const Dto = resolveDto(ctx.apiClass, ctx.methodName) ?? fallbackDto;
        if (Dto) transformResponse(ctx, Dto, resolved);
        return next();
      }
    };
  }
});
