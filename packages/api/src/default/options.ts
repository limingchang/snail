import { SnailAdapter } from "../adapter/plain";
import type { SnailLogLevel, SnailServerOptions } from "../typings/server";

/**
 * 默认约定的后端响应信封键名。
 *
 * Default key names of the assumed backend envelope.
 */
export const DEFAULT_RESPONSE_KEYS = {
  /**
   * 业务状态码字段名。
   *
   * Field holding the business status code.
   */
  code: "code",
  /**
   * 业务提示信息字段名。
   *
   * Field holding the business message.
   */
  message: "message",
  /**
   * 业务数据字段名。
   *
   * Field holding the payload.
   */
  data: "data"
} as const;

/**
 * 未配置 `validateCode` 时默认接受的业务码：`0` 与 `200`。
 *
 * Business codes accepted when no `validateCode` is configured.
 */
export const DEFAULT_ACCEPTED_CODES: readonly number[] = [0, 200];

/**
 * `@Server(...)` 的完整默认值，所有可选项都已解析。
 *
 * Fully resolved defaults for `@Server(...)`.
 */
export const DEFAULT_SERVER_OPTIONS: Required<
  Pick<
    SnailServerOptions,
    | "name"
    | "baseURL"
    | "timeout"
    | "codeKey"
    | "messageKey"
    | "dataKey"
    | "logLevel"
    | "coerceJSONString"
    | "stateAdapter"
  >
> = {
  /**
   * 服务唯一名称，用于隔离插件注册表、缓存与日志。
   *
   * Unique server name, namespacing plugin registries, caches and log lines.
   */
  name: "SNAIL_SERVER",
  /**
   * 所有请求 url 的前缀。
   *
   * Prefix every request url is resolved against.
   */
  baseURL: "/",
  /**
   * 请求超时时间，单位毫秒。
   *
   * Request timeout in milliseconds.
   */
  timeout: 10000,
  /**
   * 业务状态码字段名。
   *
   * Field holding the business status code.
   */
  codeKey: DEFAULT_RESPONSE_KEYS.code,
  /**
   * 业务提示信息字段名。
   *
   * Field holding the business message.
   */
  messageKey: DEFAULT_RESPONSE_KEYS.message,
  /**
   * 业务数据字段名。
   *
   * Field holding the payload.
   */
  dataKey: DEFAULT_RESPONSE_KEYS.data,
  /**
   * 日志级别；默认 `"silent"`，请求库不主动向控制台输出。
   *
   * Log level; `"silent"` by default, because a request library must not write
   * to the console on its own.
   */
  logLevel: "silent",
  /**
   * 服务端漏发 content-type 时，是否尝试把响应体按 JSON 字符串解析。
   *
   * Parse a JSON string body when the server forgot the content-type header.
   */
  coerceJSONString: true,
  /**
   * 响应式状态的创建方式，默认为无框架的 `SnailAdapter`。
   *
   * How reactive state is created; defaults to the framework-free adapter.
   */
  // Framework-free by default. A framework adapter is opted into per server rather
  // than installed process-wide, so the choice can never become an import side
  // effect, and two servers may differ.
  stateAdapter: SnailAdapter
} as const;

/**
 * 日志级别的数值权重，便于比较 `logLevel`：数值越大输出越详细。
 *
 * Numeric ordering of log levels, so `logLevel` can be compared.
 */
export const LOG_LEVEL_WEIGHT: Record<SnailLogLevel, number> = {
  /**
   * 不输出任何日志。
   *
   * Emits nothing.
   */
  silent: 0,
  /**
   * 只输出错误。
   *
   * Errors only.
   */
  error: 1,
  /**
   * 输出错误与警告。
   *
   * Errors and warnings.
   */
  warn: 2,
  /**
   * 输出错误、警告与普通信息。
   *
   * Errors, warnings and info.
   */
  info: 3,
  /**
   * 输出全部日志，含调试信息。
   *
   * Everything, including debug output.
   */
  debug: 4
};

/**
 * `@Api(...)` 的默认值。
 *
 * Default options for `@Api(...)`.
 */
export const DEFAULT_API_OPTIONS = {
  /**
   * 接口路径前缀，默认为空串。
   *
   * API url prefix; an empty string by default.
   */
  url: "",
  /**
   * 接口名称，默认为空串。
   *
   * API name; an empty string by default.
   */
  name: ""
} as const;
