import { createPlugin } from "../../core/plugin";
import { unwrapEnvelope } from "../../core/response";
import { t } from "../../locale";
import { resolveRequestSchema, resolveResponseSchema } from "./decorators";
import { SnailValidationError } from "./type";
import type { ZodType } from "zod";
import type { SnailContext } from "../../core/context";
import type { ValidateOptions } from "./type";

/**
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
 * The reserved validation band.
 *
 * Forward order places it after the payload has been shaped but before the cache
 * hashes a key; unwind order places it after the cache stored the raw envelope and
 * before transformation hydrates it. Exported so a plugin can position itself
 * relative to it rather than hardcoding `-50`.
 */
export const VALIDATE_PRIORITY = -50;

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
