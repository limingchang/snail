import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { DEFAULT_ACCEPTED_CODES } from "../default/options";
import { SnailResponseError } from "../error/response";
import type {
  SnailCodeValidator,
  SnailResult
} from "../typings/response";
/**
 * 响应规范化辅助函数。
 *
 * 每个请求按下列顺序执行这些职责：
 *   1. 必要时修复服务端用错 content-type 发出的 JSON 响应体
 *   2. 判断响应究竟是信封（envelope）还是裸载荷
 *   3. 校验业务状态码
 *   4. 组装交给调用方的 {@link SnailResult}
 *
 * Response normalisation helpers.
 *
 * Responsibilities, in the order they run per request:
 *   1. optionally repair a JSON body the server sent with the wrong content-type
 *   2. decide whether the response *is* an envelope or a raw payload
 *   3. validate the business status code
 *   4. assemble the {@link SnailResult} handed to the caller
 */

/**
 * 解析字符串形式的 JSON 响应体。
 *
 * 有些网关会一边回 JSON 信封、一边把 `Content-Type` 写成 `text/plain`（或干脆
 * 不带该头）。不做这层修复，调用方拿到的就是字符串，而类型上承诺的是对象——
 * 一个很隐蔽、很难查的 bug。
 *
 * 解析被关闭时、调用方显式要求 `responseType: "text"`（他要的就是原始字符串）
 * 时，以及响应体不像 JSON 时，都返回原响应。
 *
 * Parse a JSON string body.
 *
 * Some gateways answer `Content-Type: text/plain` (or omit the header) while
 * sending a JSON envelope. Without this repair the caller would receive a
 * string where the types promise an object — a silent, very confusing bug.
 *
 * Returns the original response when parsing is disabled, when the caller asked
 * for `responseType: "text"` explicitly (they want the raw string), or when the
 * body does not look like JSON.
 *
 * @param response 原始 axios 响应 / The original axios response.
 * @param enabled 是否启用修复 / Whether the repair is enabled.
 * @returns 修复后的响应，或原响应 / The repaired response, or the original one.
 */
export function coerceJSONStringBody<T>(
  response: AxiosResponse<T>,
  enabled: boolean
): AxiosResponse<T> {
  if (!enabled) return response;
  if (response.config?.responseType === "text") return response;

  const body = response.data as unknown;
  if (typeof body !== "string") return response;

  const trimmed = body.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return response;

  try {
    return { ...response, data: JSON.parse(trimmed) as T };
  } catch {
    return response;
  }
}

/**
 * 响应体是否像一个携带 `dataKey` 的信封。
 *
 * 数组不算信封：有的接口直接返回列表，此时 `length` 之类的键不该被误认成
 * 业务字段。
 *
 * `true` when the response body looks like an envelope carrying `dataKey`.
 *
 * @param body 已解析的响应体 / The parsed response body.
 * @param dataKey 载荷字段名 / The payload field name.
 * @returns 是信封则为 `true` / `true` when the body is an envelope.
 */
export function looksLikeEnvelope(body: unknown, dataKey: string): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    dataKey in (body as Record<string, unknown>)
  );
}

/**
 * 从未知响应体上读一个键，读不到返回 `undefined`。
 *
 * 非对象（含 `null`）一律视为读不到，因此调用方无需先行判空。
 *
 * Read one key off an unknown body, or `undefined`.
 *
 * @param body 已解析的响应体 / The parsed response body.
 * @param key 要读取的键 / The key to read.
 * @returns 字段值，或 `undefined` / The field value, or `undefined`.
 */
export function readKey<T = unknown>(body: unknown, key: string): T | undefined {
  if (body === null || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key] as T | undefined;
}

/**
 * 从信封里取出载荷，同时兼容裸响应体。
 *
 * 不是信封时原样返回，所以直接返回列表或标量的接口也能走同一条装配路径。
 *
 * Extract the payload out of an envelope, tolerating raw pass-through bodies.
 *
 * @param body 已解析的响应体 / The parsed response body.
 * @param dataKey 载荷字段名 / The payload field name.
 * @returns 载荷本身 / The payload itself.
 */
export function unwrapEnvelope<T>(body: unknown, dataKey: string): T {
  if (looksLikeEnvelope(body, dataKey)) {
    return (body as Record<string, unknown>)[dataKey] as T;
  }
  return body as T;
}

/**
 * 默认的业务码规则：接受 `0` 和 `200`。
 *
 * 这样选是因为国内后端绝大多数用 `0` 表示「无错误」，而 `200` 照顾了沿用
 * HTTP 语义的团队。约定不同的应用给 `@Server(...)` 传 `validateCode` 覆盖。
 *
 * The default business-code rule: accept `0` and `200`.
 *
 * Chosen because `0` is the overwhelmingly common "no error" code in Chinese
 * backends and `200` mirrors HTTP for teams that reuse it. Applications with a
 * different convention pass `validateCode` to `@Server(...)`.
 *
 * @param accepted 视为成功的业务码集合 / The business codes treated as success.
 * @returns 业务码校验函数 / The business-code validator.
 */
export function createDefaultCodeValidator(
  accepted: readonly (number | string)[] = DEFAULT_ACCEPTED_CODES
): SnailCodeValidator {
  const acceptedSet = new Set<string>(accepted.map(String));
  return (code) => (code === undefined || code === null ? true : acceptedSet.has(String(code)));
}

/**
 * 断言业务状态码，应用的规则拒绝它时抛出 {@link SnailResponseError}。
 *
 * 业务码为 `undefined` / `null` 时直接放行：没有信封的接口不该被这一步拦下。
 *
 * Assert the business status code, throwing a {@link SnailResponseError} when
 * the application's rule rejects it.
 *
 * @param options 校验参数 / The validation input.
 * @param options.body 响应体原文 / The raw response body.
 * @param options.code 解析出的业务码 / The parsed business code.
 * @param options.dataKey 载荷字段名 / The payload field name.
 * @param options.validate 自定义校验函数，缺省用默认规则 /
 *   Custom validator; defaults to the built-in rule.
 * @param options.fullName 出错信息里用的完整方法名 / Full method name for messages.
 * @param options.message 抛出错误时携带的消息 / The message carried by the error.
 * @throws 业务码未被接受时抛出 `SnailResponseError` /
 *   `SnailResponseError` when the code is not accepted.
 */
export function assertBusinessCode(options: {
  body: unknown;
  code: number | string | undefined;
  dataKey: string;
  validate: SnailCodeValidator | undefined;
  fullName: string;
  message: string;
}): void {
  const { body, code, dataKey, validate, fullName, message } = options;
  if (code === undefined || code === null) return;

  const rule = validate ?? createDefaultCodeValidator();
  if (rule(code, body)) return;

  throw new SnailResponseError(message, { businessCode: code, payload: body });
}

/**
 * 组装 `send()` 最终 resolve 出来的值。
 *
 * 各字段都直接取自信封，取不到的键静默为 `undefined`，`fromCache` 与 `config`
 * 则由调用方透传，用来告诉调用方这次结果是不是缓存命中。
 *
 * Assemble the value `send()` resolves to.
 *
 * @param options 装配参数 / The assembly input.
 * @param options.response 原始 axios 响应 / The original axios response.
 * @param options.envelope 已解析的信封 / The parsed envelope.
 * @param options.codeKey 业务码字段名 / The business-code field name.
 * @param options.messageKey 消息字段名 / The message field name.
 * @param options.dataKey 载荷字段名 / The payload field name.
 * @param options.fromCache 是否来自缓存 / Whether the value came from a cache.
 * @param options.config 本次请求的 axios 配置 / The axios config of the request.
 * @returns 交给调用方的 {@link SnailResult} / The {@link SnailResult} for the caller.
 */
export function buildResult<
  S,
  T,
  D extends string,
  C extends string,
  M extends string
>(options: {
  response: AxiosResponse;
  envelope: unknown;
  codeKey: string;
  messageKey: string;
  dataKey: string;
  fromCache: boolean;
  config: InternalAxiosRequestConfig;
}): SnailResult<S, T, D, C, M> {
  const { response, envelope, codeKey, messageKey, dataKey, fromCache, config } = options;

  return {
    response: response as SnailResult<S, T, D, C, M>["response"],
    envelope: envelope as SnailResult<S, T, D, C, M>["envelope"],
    data: unwrapEnvelope<T>(envelope, dataKey),
    code: readKey<number>(envelope, codeKey) as SnailResult<S, T, D, C, M>["code"],
    message: readKey<string>(envelope, messageKey) as SnailResult<S, T, D, C, M>["message"],
    fromCache,
    config
  };
}
