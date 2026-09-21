import type { InternalAxiosRequestConfig } from "axios";
import type { SnailMethodType } from "../../typings/api";
import { shortHash, stableStringify } from "../../utils";

/**
 * 缓存键的构造。
 *
 * ## 为什么对整个请求身份做哈希
 *
 * 一个键只需回答一个问题：“这个请求会产出与我已存储的那次相同的响应吗？”
 * 这取决于请求方法、最终 url、查询参数和请求体——除此之外不依赖任何东西。请求头被刻意排除：
 * `Authorization` 头改变的是*谁*在问，而不是问了什么，把它算进去会让每次 token 刷新都变成
 * 一次缓存清空。
 *
 * ## 为什么用 `stableStringify`
 *
 * `{ a: 1, b: 2 }` 与 `{ b: 2, a: 1 }` 是同一个查询。用 `JSON.stringify` 序列化会得到两个
 * 不同的字符串，从而让一次逻辑请求产生两个缓存条目；`stableStringify` 会对对象键排序，
 * 因此哈希——以及键——与顺序无关。
 *
 * ## 为什么这里的 url 已是最终形态
 *
 * 缓存插件运行在 `priority: -100`，也就是正向顺序的最后，正是为了让拦截器插件（`100`）
 * 和参数装饰器已经改写过 `ctx.request.url` 并填好了 `:placeholders`。对更早阶段的 url
 * 做哈希，会把 `/user/:id` 与 `/user/42` 算成不同的键，更糟的是算成相同的键。
 *
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

/**
 * 识别一个可缓存请求所需的全部信息。
 *
 * Everything needed to identify one cacheable request.
 */
export interface CacheKeyInput {
  /**
   * 命名空间，使同一源上的两个服务永不共享条目。
   *
   * Namespace, so two servers on one origin never share entries.
   */
  prefix: string;

  /**
   * 实时的 axios 配置——url、params 与 body 必须已经是最终形态。
   *
   * The live axios config — url, params and body must already be final.
   */
  request: InternalAxiosRequestConfig;

  /**
   * 配置中没有请求方法时使用的兜底方法。
   *
   * Fallback verb when the config carries none.
   */
  methodType: SnailMethodType;

  /**
   * `@Cacheable({ key })`：直接使用该值，替代请求身份。
   *
   * `@Cacheable({ key })`: use this verbatim instead of the request identity.
   */
  explicitKey?: string;
}

/**
 * 构造一次请求所用的键。
 *
 * 可读部分（`prefix:VERB`）留在哈希之外，这样仅凭一个键就能诊断行为异常的缓存；
 * 只有易变的签名部分参与哈希，从而让键短到足以放进 `localStorage`。
 *
 * Build the key used for one request.
 *
 * The readable part (`prefix:VERB`) is kept outside the hash so a misbehaving
 * cache can be diagnosed from a key alone; only the volatile signature is hashed,
 * which keeps keys short enough for `localStorage`.
 *
 * @param input 请求身份的各组成部分 / The parts of the request identity
 * @returns 形如 `prefix:VERB:hash` 的键 / The key, shaped `prefix:VERB:hash`
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
