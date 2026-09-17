import type { InternalAxiosRequestConfig } from "axios";
import type { SnailMethodType } from "../../typings/api";
import { shortHash, stableStringify } from "../../utils";

/**
 * Cache-key construction.
 *
 * ## Why the whole request identity is hashed
 *
 * A key has to answer one question: "would this request produce the same
 * response as the one I already stored?". That depends on the verb, the final
 * url, the query params and the body — and on nothing else. Headers are
 * deliberately excluded: an `Authorization` header changes *who* asks, not what
 * is asked, and including it would turn every token refresh into a cache flush.
 *
 * ## Why `stableStringify`
 *
 * `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are the same query. Serialising them
 * with `JSON.stringify` produces two different strings and therefore two cache
 * entries for one logical request; `stableStringify` sorts object keys, so the
 * hash — and the key — is order-independent.
 *
 * ## Why the url is final here
 *
 * The cache plugin runs at `priority: -100` — last in forward order — precisely
 * so the interceptor plugin (`100`) and the argument decorators have already
 * rewritten `ctx.request.url` and filled in `:placeholders`. Hashing an earlier
 * stage of the url would key `/user/:id` and `/user/42` differently, or worse,
 * identically.
 */

/** Everything needed to identify one cacheable request. */
export interface CacheKeyInput {
  /** Namespace, so two servers on one origin never share entries. */
  prefix: string;

  /** The live axios config — url, params and body must already be final. */
  request: InternalAxiosRequestConfig;

  /** Fallback verb when the config carries none. */
  methodType: SnailMethodType;

  /** `@Cacheable({ key })`: use this verbatim instead of the request identity. */
  explicitKey?: string;
}

/**
 * Build the key used for one request.
 *
 * The readable part (`prefix:VERB`) is kept outside the hash so a misbehaving
 * cache can be diagnosed from a key alone; only the volatile signature is hashed,
 * which keeps keys short enough for `localStorage`.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const { prefix, request, methodType, explicitKey } = input;

  // An explicit key replaces the identity rather than extending it: that is the
  // entire point of declaring one.
  if (explicitKey !== undefined && explicitKey.length > 0) {
    return `${prefix}:${explicitKey}`;
  }

  const method = (request.method ?? methodType).toUpperCase();
  const signature = stableStringify({
    method,
    baseURL: request.baseURL ?? "",
    url: request.url ?? "",
    params: request.params ?? null,
    data: request.data ?? null
  });

  return `${prefix}:${method}:${shortHash(signature)}`;
}
