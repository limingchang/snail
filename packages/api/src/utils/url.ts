import { isPlainObject } from "./is";

/**
 * 把首字符转成大写，其余字符保持不变。
 *
 * 用的是 `toUpperCase()`：中文等没有大小写概念的文字会原样返回，空字符串也
 * 不会抛错，只是原样返回。
 *
 * Uppercase the first character, leaving the rest untouched.
 *
 * @param value 原始字符串 / The input string.
 * @returns 首字符大写后的字符串 / The string with its first character uppercased.
 */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/**
 * url 自带 scheme 或使用协议相对前缀（`//`）时返回 `true`。
 *
 * `true` when the url carries its own scheme or protocol-relative prefix.
 *
 * @param url 待判断的地址 / The url to test.
 * @returns 是否为绝对地址 / Whether the url is absolute.
 */
export function isAbsoluteURL(url: string): boolean {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

/**
 * 去掉末尾斜杠，同时不触碰孤立的 `"/"`。
 *
 * Drop trailing slashes without touching a bare `"/"`.
 */
function trimEndSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * 去掉开头斜杠，同时保留孤立的 `"/"`。
 *
 * Drop leading slashes, keeping a bare `"/"` intact.
 */
function trimStartSlash(url: string): string {
  return url.replace(/^\/+/, "");
}

/**
 * 把多个 url 片段拼成一条路径，并规范化片段之间的斜杠。
 *
 * 绝对地址的 `segment` 会直接取胜，与 axios 的 `baseURL` 语义一致。空串、
 * `null` 与 `undefined` 片段会被忽略。
 *
 * Join url segments into one path, normalising the slashes between them.
 *
 * An absolute `segment` wins outright, matching axios' `baseURL` semantics.
 *
 * ```ts
 * joinURL("/api/", "/user/", "/list") // "/api/user/list"
 * joinURL("/api", "https://cdn.x/y")  // "https://cdn.x/y"
 * ```
 *
 * @param segments 要拼接的 url 片段，空值忽略 / Url segments to join; empty values are skipped.
 * @returns 拼接并规范化后的路径 / The joined and normalised path.
 */
export function joinURL(...segments: Array<string | undefined | null>): string {
  const parts = segments.filter(
    (segment): segment is string => typeof segment === "string" && segment.length > 0
  );
  if (parts.length === 0) return "";

  let result = parts[0]!;
  for (const part of parts.slice(1)) {
    if (isAbsoluteURL(part)) {
      result = part;
      continue;
    }
    if (result.length === 0) {
      result = part;
      continue;
    }
    result = `${trimEndSlash(result)}/${trimStartSlash(part)}`;
  }

  // Preserve a meaningful leading slash, collapse any accidental duplicates.
  return result.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * 匹配 `:id` 形式的占位符，并忽略前置的 `::` 转义。
 *
 * Matches `:id` style placeholders, ignoring a leading `::` escape.
 */
const PATH_PARAM_PATTERN = /:([A-Za-z_$][\w$]*)/g;

/**
 * 路由模板中出现的所有 `:placeholder` 名字。
 *
 * 与 {@link replacePathParams} 共用同一个正则，因此只有以字母、`_` 或 `$`
 * 开头的占位符会被识别；同一个名字出现多次就会重复列出。
 *
 * Names of every `:placeholder` present in a route template.
 *
 * @param route 路由模板 / The route template.
 * @returns 占位符名字列表 / The placeholder names.
 */
export function pathParamNames(route: string): string[] {
  const names: string[] = [];
  for (const match of route.matchAll(PATH_PARAM_PATTERN)) {
    names.push(match[1]!);
  }
  return names;
}

/**
 * 用给定值替换 `:placeholder` 片段。
 *
 * 值会被 URL 编码。没有对应值的占位符会调用 `onMissing`，而调用方正是在
 * 其中抛错的；省略该回调时占位符会原样留下。之所以选择抛错，是因为把 `:id`
 * 原样留在请求路径里，只会在离病因很远的地方产生一个令人困惑的 404——改写
 * 前的代码先 `console.error` 再抛出，结局并无不同。
 *
 * Substitute `:placeholder` segments with values.
 *
 * Values are URL-encoded. A placeholder with no value throws, because silently
 * leaving `:id` in a request path produces a confusing 404 far from the cause —
 * the pre-rewrite code logged to `console.error` and then threw anyway.
 *
 * @param route 路由模板 / The route template.
 * @param values 占位符取值表 / The placeholder values, keyed by name.
 * @param onMissing 占位符缺值时调用；通常在其中抛错 /
 *   Called for a placeholder with no value; usually throws.
 * @returns 替换后的路径 / The substituted path.
 * @throws `onMissing` 抛出的错误会原样向外传播 / Whatever `onMissing` throws propagates.
 */
export function replacePathParams(
  route: string,
  values: Record<string, unknown>,
  onMissing?: (name: string) => never
): string {
  return route.replace(PATH_PARAM_PATTERN, (match, name: string) => {
    const value = values[name];
    if (value === undefined || value === null) {
      if (onMissing) onMissing(name);
      return match;
    }
    return encodeURIComponent(String(value));
  });
}

/**
 * 拼出完整 url；传入绝对 url 时原样返回。
 *
 * Build a full url, appending absolute urls verbatim.
 *
 * @param baseURL 基础地址 / The base url.
 * @param url 请求地址 / The request url.
 * @returns 完整请求地址 / The full request url.
 */
export function buildRequestURL(baseURL: string, url: string): string {
  if (isAbsoluteURL(url)) return url;
  return joinURL(baseURL, url);
}

/**
 * 去掉查询串与 hash，便于记录日志。
 *
 * Strip the query string and hash, for logging.
 *
 * @param url 原始地址 / The input url.
 * @returns 不含查询串与 hash 的部分 / The url without its query string or hash.
 */
export function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0]!;
}

/**
 * 确定性的、递归稳定的 JSON 序列化。
 *
 * 对象键会被排序，所以两个逻辑上相同的负载总是得到同一个字符串——这对缓存
 * 键与请求去重至关重要。数值中的 `NaN` / `Infinity` 写成 `null`；
 * `undefined`、函数与 symbol 写成裸的 `undefined`（并不是合法 JSON）；
 * `bigint` 写成字符串；`Date` 写成 ISO 串；`RegExp` 写成 `toString()` 的结果；
 * 遇到环（对象仍出现在当前递归路径上）时写成 `"[Circular]"`，以免无限递归。
 *
 * Deterministic, recursively stable JSON serialisation.
 *
 * Object keys are sorted so two logically identical payloads always produce the
 * same string — essential for cache keys and for request de-duplication.
 *
 * @param value 任意待序列化的值 / Any value to serialise.
 * @returns 稳定的 JSON 字符串 / The stable JSON string.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (input: unknown): string => {
    if (input === null) return "null";

    const type = typeof input;
    if (type === "number") return Number.isFinite(input as number) ? String(input) : "null";
    if (type === "boolean") return String(input);
    if (type === "bigint") return `"${String(input)}"`;
    if (type === "string") return JSON.stringify(input);
    if (type === "undefined") return "undefined";
    if (type === "function" || type === "symbol") return "undefined";

    if (input instanceof Date) return `"${input.toISOString()}"`;
    if (input instanceof RegExp) return `"${input.toString()}"`;

    if (Array.isArray(input)) {
      return `[${input.map(walk).join(",")}]`;
    }

    if (isPlainObject(input)) {
      const object = input as Record<string, unknown>;
      if (seen.has(object)) return '"[Circular]"';
      seen.add(object);
      const body = Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${walk(object[key])}`)
        .join(",");
      seen.delete(object);
      return `{${body}}`;
    }

    return JSON.stringify(String(input));
  };

  return walk(value);
}

/**
 * 32 位 FNV-1a 哈希，以 base36 输出。
 *
 * 便宜、几乎不额外分配内存、跨运行稳定，用于把冗长的请求签名压成紧凑的内存
 * 缓存键。它**不是**安全哈希；而且只有 32 位，不同输入完全可能得到同一个
 * 结果（碰撞），所以除了缓存键之外不要依赖它。
 *
 * 32-bit FNV-1a hash rendered as base36.
 *
 * Cheap, allocation-light and stable across runs — used to turn a long request
 * signature into a compact in-memory cache key. It is *not* a security hash.
 *
 * @param input 待哈希的字符串 / The string to hash.
 * @returns base36 表示的 32 位哈希 / The 32-bit hash in base36.
 */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
