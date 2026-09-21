import { AxiosHeaders } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { DEFAULT_SERVER_OPTIONS } from "../default/options";
import {
  SNAIL_API_OPTIONS,
  SNAIL_DOWNLOAD_PROGRESS,
  SNAIL_HEADERS,
  SNAIL_REQUEST_METHOD,
  SNAIL_SERVER_OPTIONS,
  SNAIL_UPLOAD_PROGRESS
} from "./metadata.keys";
import { getMetadata } from "./metadata";
import { SnailOptionsError } from "../error/options";
import { t } from "../locale";
import type {
  SnailApiOptions,
  SnailMethodOptions,
  SnailMethodType
} from "../typings/api";
import type { ResolvedServerOptions, SnailServerOptions } from "../typings/server";
import { buildRequestURL } from "../utils/url";

/**
 * 把装饰器写下的原始元数据变成具体、已补全默认值的选项。
 *
 * 一个请求需要的一切都在*这里*解析，而不是散落在 server、proxy 和方法上。
 * 只有一处需要读，也只有一处需要测。
 *
 * Turns raw decorator metadata into concrete, fully-defaulted options.
 *
 * Everything a request needs is resolved *here* rather than spread across the
 * server, the proxy and the method. One place to read, one place to test.
 */

/**
 * 读取并补全 `@Server(...)` 写下的选项。
 *
 * 缺少装饰器、或 `baseURL` 既没声明也不是非空字符串时立即抛错：这两个问题
 * 拖到发请求时才暴露会难查得多。其余字段缺省时回落到
 * {@link DEFAULT_SERVER_OPTIONS}；`stateAdapter` 也在这里定稿，避免下游再去
 * 查某个全局变量。
 *
 * Read and default the options written by `@Server(...)`.
 *
 * @param serverClass 被 `@Server(...)` 标注的类 / The class decorated with `@Server(...)`.
 * @param fallbackName 未声明 `name` 时使用的名字 / Name used when `name` is absent.
 * @returns 补齐默认值的服务器选项 / The server options with defaults applied.
 * @throws 未标注 `@Server(...)` 或 `baseURL` 非法时抛出 `SnailOptionsError` /
 *   `SnailOptionsError` when the decorator is missing or `baseURL` is invalid.
 */
export function resolveServerOptions(
  serverClass: unknown,
  fallbackName: string
): ResolvedServerOptions {
  const declared = getMetadata<SnailServerOptions>(SNAIL_SERVER_OPTIONS, serverClass);
  if (!declared) {
    throw new SnailOptionsError(t("error.options.server.missing", fallbackName));
  }

  const baseURL = declared.baseURL ?? DEFAULT_SERVER_OPTIONS.baseURL;
  if (typeof baseURL !== "string" || baseURL.length === 0) {
    throw new SnailOptionsError(t("error.options.server.baseURL"));
  }

  return {
    ...declared,
    name: declared.name ?? fallbackName,
    baseURL,
    timeout: declared.timeout ?? DEFAULT_SERVER_OPTIONS.timeout,
    codeKey: declared.codeKey ?? DEFAULT_SERVER_OPTIONS.codeKey,
    messageKey: declared.messageKey ?? DEFAULT_SERVER_OPTIONS.messageKey,
    dataKey: declared.dataKey ?? DEFAULT_SERVER_OPTIONS.dataKey,
    logLevel: declared.logLevel ?? DEFAULT_SERVER_OPTIONS.logLevel,
    coerceJSONString:
      declared.coerceJSONString ?? DEFAULT_SERVER_OPTIONS.coerceJSONString,
    // A per-server framework choice, resolved here so nothing downstream has to
    // consult a global. See `SnailServerOptions.stateAdapter`.
    stateAdapter: declared.stateAdapter ?? DEFAULT_SERVER_OPTIONS.stateAdapter
  };
}

/**
 * 读取并补全 `@Api(...)` 写下的选项。
 *
 * 未标注该装饰器时按空对象处理，因此 api 类可以只有方法级装饰器。`url`
 * 声明的类型不对则立即抛错；`timeout`、`adapter` 等未声明时保持 `undefined`，
 * 留给 {@link buildBaseRequestConfig} 的「方法 → api → 服务器」级联兜底。
 *
 * Read and default the options written by `@Api(...)`.
 *
 * @param apiClass 承载这些选项的 api 类 / The api class that owns the options.
 * @param fallbackName 未声明 `name` 时使用的名字 / Name used when `name` is absent.
 * @returns 补齐默认值的 api 选项 / The api options with defaults applied.
 * @throws `url` 声明了但不是字符串时抛出 `SnailOptionsError` /
 *   `SnailOptionsError` when `url` is declared but is not a string.
 */
export function resolveApiOptions(
  apiClass: new () => unknown,
  fallbackName: string
): Required<SnailApiOptions> {
  const declared = getMetadata<SnailApiOptions>(SNAIL_API_OPTIONS, apiClass) ?? {};

  if (declared.url !== undefined && typeof declared.url !== "string") {
    throw new SnailOptionsError(t("error.options.api.url"));
  }

  return {
    url: declared.url ?? "",
    name: declared.name ?? fallbackName,
    timeout: declared.timeout as number,
    adapter: declared.adapter as never,
    responseType: declared.responseType as never,
    withCredentials: declared.withCredentials as boolean
  };
}

/**
 * 读取 `@Get()` / `@Post()` 等写下的请求动词。
 *
 * Read the request verb written by `@Get()` / `@Post()` / …
 *
 * @param apiClass 承载该方法的 api 类 / The api class that owns the method.
 * @param methodName 方法名 / The method name.
 * @returns 大写的动词；该方法没有请求装饰器时为 `undefined` /
 *   The upper-case verb, or `undefined` when the method is not decorated.
 */
export function resolveRequestMethod(
  apiClass: new () => unknown,
  methodName: string
): SnailMethodType | undefined {
  const options = getMetadata<{ method: SnailMethodType }>(
    SNAIL_REQUEST_METHOD,
    apiClass,
    methodName
  );
  return options?.method;
}

/**
 * 读取 `@Get(path, options)` 写下的完整请求方法选项。
 *
 * 与 {@link resolveRequestMethod} 读的是同一份元数据，只是这里要的是全部字段
 * 而非仅动词。
 *
 * Read the full request-method options written by `@Get(path, options)`.
 *
 * @param apiClass 承载该方法的 api 类 / The api class that owns the method.
 * @param methodName 方法名 / The method name.
 * @returns 该方法选项；未装饰时为 `undefined` /
 *   The method options, or `undefined` when the method is not decorated.
 */
export function resolveMethodDecoratorOptions(
  apiClass: new () => unknown,
  methodName: string
): (SnailMethodOptions & { method: SnailMethodType; url: string }) | undefined {
  return getMetadata<SnailMethodOptions & { method: SnailMethodType; url: string }>(
    SNAIL_REQUEST_METHOD,
    apiClass,
    methodName
  );
}

/**
 * 合并 `@Header(...)` 的两层声明——先是 api 类，再是方法。
 *
 * 方法级表头优先，只有这个顺序才能让单个端点覆盖类级默认值。返回的是新的
 * `AxiosHeaders` 实例，因此后续请求间的改写不会互相污染。
 *
 * Merge the three levels of `@Header(...)` — api class, then method.
 *
 * Method-level headers win, which is the only ordering that lets a single
 * endpoint override a class-wide default.
 *
 * @param apiClass 承载该方法的 api 类 / The api class that owns the method.
 * @param methodName 方法名 / The method name.
 * @returns 合并后的表头 / The merged headers.
 */
export function resolveHeaders(
  apiClass: new () => unknown,
  methodName: string
): AxiosHeaders {
  const apiHeaders = getMetadata<Record<string, unknown>>(SNAIL_HEADERS, apiClass) ?? {};
  const methodHeaders =
    getMetadata<Record<string, unknown>>(SNAIL_HEADERS, apiClass, methodName) ?? {};
  return AxiosHeaders.from({ ...apiHeaders, ...methodHeaders } as Record<string, string>);
}

/**
 * 读取 `@UploadProgress()` / `@DownloadProgress()` 写下的进度回调。
 *
 * Progress callbacks written by `@UploadProgress()` / `@DownloadProgress()`.
 *
 * @param apiClass 承载该方法的 api 类 / The api class that owns the method.
 * @param methodName 方法名 / The method name.
 * @returns 两个可选的进度回调 / Both optional progress callbacks.
 */
export function resolveProgress(
  apiClass: new () => unknown,
  methodName: string
): {
  onUploadProgress: SnailMethodOptions["onUploadProgress"];
  onDownloadProgress: SnailMethodOptions["onDownloadProgress"];
} {
  return {
    onUploadProgress: getMetadata(SNAIL_UPLOAD_PROGRESS, apiClass, methodName),
    onDownloadProgress: getMetadata(SNAIL_DOWNLOAD_PROGRESS, apiClass, methodName)
  };
}

/**
 * 把 api 前缀和方法路径拼成最终路由。
 *
 * Join the api prefix with a method path.
 *
 * @param apiURL `@Api(...)` 声明的 url 前缀 / The url prefix from `@Api(...)`.
 * @param methodPath 方法自己的路径 / The method's own path.
 * @returns 拼接后的路由 / The joined route.
 */
export function resolveRoute(apiURL: string, methodPath: string): string {
  return buildRequestURL(apiURL, methodPath || "");
}

/**
 * 构造一个请求起步时使用的 axios 配置。
 *
 * 取值按「方法 → api → 服务器」级联，只有胜出的那个值会保留下来；参数装饰器
 * 和插件会在后续流水线里继续细化它。表头先 `concat` 复制一份再补服务器级
 * 表头，因为方法级表头对象被缓存在方法描述符上、会被同名方法的每个请求复用，
 * 就地改写会让 `@HeaderValue()` 或插件的修改泄漏到下一个请求。
 *
 * Build the axios config a request starts from.
 *
 * Values cascade method → api → server, and only the winner survives. The
 * argument decorators and the plugins refine this further during the pipeline.
 *
 * @param input 级联所需的各层选项与表头 /
 *   The per-layer options and headers the cascade needs.
 * @param input.serverOptions 服务器级选项 / Server-level options.
 * @param input.apiOptions api 级选项 / Api-level options.
 * @param input.methodOptions 方法级选项 / Method-level options.
 * @param input.methodType 请求动词 / The request verb.
 * @param input.headers 已合并的表头 / The already-merged headers.
 * @returns 交给 axios 的请求配置 / The request config handed to axios.
 */export function buildBaseRequestConfig(input: {
  serverOptions: ResolvedServerOptions;
  apiOptions: Required<SnailApiOptions>;
  methodOptions: SnailMethodOptions & { url: string };
  methodType: SnailMethodType;
  headers: AxiosHeaders;
}): InternalAxiosRequestConfig {
  const { serverOptions, apiOptions, methodOptions, methodType, headers } = input;

  // `AxiosHeaders.from(existing)` returns the *same* instance rather than a copy.
  // Since the per-method `headers` object is cached on the method descriptor and
  // reused by every request of that method, building on it directly would let a
  // `@HeaderValue()` argument or a plugin's in-place mutation leak into the next
  // request. `concat` always allocates a fresh instance.
  const merged = AxiosHeaders.concat(headers);
  for (const [key, value] of Object.entries(serverOptions.headers ?? {})) {
    if (!merged.has(key)) merged.set(key, value as never);
  }

  return {
    url: methodOptions.url,
    method: methodType.toLowerCase(),
    baseURL: serverOptions.baseURL,
    timeout: methodOptions.timeout ?? apiOptions.timeout ?? serverOptions.timeout,
    responseType:
      methodOptions.responseType ??
      apiOptions.responseType ??
      serverOptions.responseType ??
      "json",
    withCredentials:
      methodOptions.withCredentials ??
      apiOptions.withCredentials ??
      serverOptions.withCredentials,
    adapter: methodOptions.adapter ?? apiOptions.adapter ?? serverOptions.adapter,
    headers: merged,
    params: { ...(serverOptions.params ?? {}), ...(methodOptions.params ?? {}) },
    data: methodOptions.data,
    onUploadProgress: methodOptions.onUploadProgress,
    onDownloadProgress: methodOptions.onDownloadProgress
  };
}
