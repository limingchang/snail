import { createPlugin } from "../../core/plugin";
import { looksLikeEnvelope, unwrapEnvelope } from "../../core/response";
import { t } from "../../locale";
import { resolveDto } from "./decorators";
import { DEFAULT_MAX_DEPTH, hydrate } from "./hydrate";
import type { SnailContext } from "../../core/context";
import type { DtoType, TransformOptions } from "./type";

/**
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
export const transformPlugin = createPlugin<TransformOptions>({
  name: "transform",
  priority: 0,

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
