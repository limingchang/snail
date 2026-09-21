import type { AxiosRequestConfig } from "axios";
import type { SnailStateAdapter } from "./adapter";
import type { SnailCodeValidator, SnailEnvelopeSchema } from "./response";

/**
 * 日志器使用的严重级别。
 *
 * Severity used by the logger.
 */
export type SnailLogLevel = "silent" | "error" | "warn" | "info" | "debug";

/**
 * `@Server(...)` 接受的选项。
 *
 * 每个字段都是可选的；未指定的字段回退到 `DEFAULT_SERVER_OPTIONS`。
 *
 * Options accepted by `@Server(...)`.
 *
 * Every field is optional; unspecified fields fall back to
 * `DEFAULT_SERVER_OPTIONS`.
 */
export interface SnailServerOptions {
  /**
   * 该服务的唯一标识。
   *
   * 默认为被装饰的类名。它划分插件注册表、缓存条目与日志行的命名空间，因此同一个
   * 应用中的两个服务不能共用它。
   *
   * Unique identifier of this server.
   *
   * Defaults to the decorated class name. It namespaces plugin registries,
   * cache entries and log lines, so two servers in one app must not share it.
   */
  name?: string;

  /**
   * 所有请求 url 解析所依据的前缀。默认为 `"/"`。
   *
   * Prefix every request url is resolved against. Defaults to `"/"`.
   */
  baseURL?: string;

  /**
   * 请求超时时间（毫秒）。默认为 `10000`。
   *
   * Request timeout in milliseconds. Defaults to `10000`.
   */
  timeout?: number;

  /**
   * axios 适配器。不设置则使用 axios 自身的探测逻辑：浏览器中选 `xhr`/`fetch`，
   * Node 中选 `http`。
   *
   * axios adapter. Leave unset to use axios' own default detection, which picks
   * `xhr`/`fetch` in a browser and `http` in Node.
   */
  adapter?: AxiosRequestConfig["adapter"];

  /**
   * 合并进该服务每个请求的额外请求头。
   *
   * Extra headers merged into every request of this server.
   */
  headers?: AxiosRequestConfig["headers"];

  /**
   * 合并进该服务每个请求的额外查询参数。
   *
   * Extra query params merged into every request of this server.
   */
  params?: AxiosRequestConfig["params"];

  /**
   * 该服务每个请求的默认 `responseType`。
   *
   * Default `responseType` for every request of this server.
   */
  responseType?: AxiosRequestConfig["responseType"];

  /**
   * 在跨站请求中发送 cookie / 认证头。
   *
   * Send cookies / auth headers on cross-site requests.
   */
  withCredentials?: boolean;

  /**
   * 存放业务状态码的键。默认为 `"code"`。
   *
   * Key holding the business status code. Defaults to `"code"`.
   * @see SnailResponseKeys
   */
  codeKey?: string;

  /**
   * 存放业务消息的键。默认为 `"message"`。
   *
   * Key holding the business message. Defaults to `"message"`.
   * @see SnailResponseKeys
   */
  messageKey?: string;

  /**
   * 存放载荷的键。默认为 `"data"`。
   *
   * Key holding the payload. Defaults to `"data"`.
   * @see SnailResponseKeys
   */
  dataKey?: string;

  /**
   * 判定业务状态码是否可接受。
   *
   * 默认接受 `0` 与 `200`。返回 `false` 会让请求以携带完整信封的
   * `SnailResponseError` 被拒绝。
   *
   * Decides whether a business status code is acceptable.
   *
   * Defaults to accepting `0` and `200`. Returning `false` rejects the request
   * with a `SnailResponseError` carrying the full envelope.
   */
  validateCode?: SnailCodeValidator;

  /**
   * 日志级别。默认为 `"silent"`，因为除非应用主动要求，请求库不应向控制台写东西。
   *
   * Log level. Defaults to `"silent"`, because a request library must not write
   * to the console unless the application asked for it.
   */
  logLevel?: SnailLogLevel;

  /**
   * 当服务端忘记 content-type 头时，按 JSON 解析字符串请求体。
   *
   * Parse a JSON string body when the server forgot the content-type header.
   */
  coerceJSONString?: boolean;

  /**
   * 该服务的响应式状态如何创建。
   *
   * 在这里 **声明一次** 你的框架，它就会驱动请求的两个投影：`method.meta` 上的
   * 句柄，以及每个 `use*` 策略返回的状态。
   *
   * 默认为 `SnailAdapter` —— 一个普通的可变盒子，适用于测试、Node 进程、SSR
   * 渲染，或由应用手工驱动请求的场景。
   *
   * 由于这是 *服务* 级选项，同一个包里的两个服务可以使用不同的框架：Vue 管理后台
   * 与 React 小部件不必再共用一份进程级设置。
   *
   * How reactive state is created for this server.
   *
   * Declare your framework **once** here and it drives both projections of a
   * request: the handles on `method.meta`, and the state every `use*` strategy
   * returns.
   *
   * ```ts
   * import { VueRef } from "@snail-js/api/adapter/vue";
   *
   * @Server({ baseURL: "/api", stateAdapter: VueRef })
   * class BackEnd extends SnailServer {}
   * ```
   *
   * Defaults to `SnailAdapter` — a plain mutable box, correct for a test, a Node
   * process, an SSR pass or an application that drives requests by hand.
   *
   * Because this is a *server* option, two servers in one bundle may use different
   * frameworks: a Vue admin panel and a React widget no longer have to share a
   * single process-wide setting.
   */
  stateAdapter?: SnailStateAdapter;
}

/**
 * 应用了全部默认值之后的 `SnailServerOptions`。
 *
 * 插件收到的就是它，因此插件永远不必自己再应用一遍默认值。
 *
 * `SnailServerOptions` with every default applied.
 *
 * Plugins receive this, so they never have to re-apply defaults themselves.
 */
export interface ResolvedServerOptions extends SnailServerOptions {
  /**
   * 服务名，必定存在。
   *
   * The server name, always present.
   */
  name: string;
  /**
   * 基础地址，必定存在。
   *
   * The base url, always present.
   */
  baseURL: string;
  /**
   * 超时毫秒数，必定存在。
   *
   * The timeout in milliseconds, always present.
   */
  timeout: number;
  /**
   * 业务状态码键名，必定存在。
   *
   * The business code key, always present.
   */
  codeKey: string;
  /**
   * 业务消息键名，必定存在。
   *
   * The business message key, always present.
   */
  messageKey: string;
  /**
   * 载荷键名，必定存在。
   *
   * The payload key, always present.
   */
  dataKey: string;
  /**
   * 日志级别，必定存在。
   *
   * The log level, always present.
   */
  logLevel: SnailLogLevel;
  /**
   * 是否强制解析 JSON 字符串，必定存在。
   *
   * Whether JSON strings are coerced, always present.
   */
  coerceJSONString: boolean;
  /**
   * 状态适配器，必定存在。
   *
   * The state adapter, always present.
   */
  stateAdapter: SnailStateAdapter;
}

/**
 * 可用的服务端信封结构（{@link SnailEnvelopeSchema} 的别名）。
 *
 * Narrow an arbitrary value to a usable envelope schema.
 */
export type SnailServerEnvelope = SnailEnvelopeSchema;
