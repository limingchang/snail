import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { DEFAULT_ACCEPTED_CODES } from "../default/options";
import { SnailResponseError } from "../error/response";
import type {
  SnailCodeValidator,
  SnailResult
} from "../typings/response";
/**
 * Response normalisation helpers.
 *
 * Responsibilities, in the order they run per request:
 *   1. optionally repair a JSON body the server sent with the wrong content-type
 *   2. decide whether the response *is* an envelope or a raw payload
 *   3. validate the business status code
 *   4. assemble the {@link SnailResult} handed to the caller
 */

/**
 * Parse a JSON string body.
 *
 * Some gateways answer `Content-Type: text/plain` (or omit the header) while
 * sending a JSON envelope. Without this repair the caller would receive a
 * string where the types promise an object — a silent, very confusing bug.
 *
 * Returns the original response when parsing is disabled, when the caller asked
 * for `responseType: "text"` explicitly (they want the raw string), or when the
 * body does not look like JSON.
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

/** `true` when the response body looks like an envelope carrying `dataKey`. */
export function looksLikeEnvelope(body: unknown, dataKey: string): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    dataKey in (body as Record<string, unknown>)
  );
}

/** Read one key off an unknown body, or `undefined`. */
export function readKey<T = unknown>(body: unknown, key: string): T | undefined {
  if (body === null || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key] as T | undefined;
}

/** Extract the payload out of an envelope, tolerating raw pass-through bodies. */
export function unwrapEnvelope<T>(body: unknown, dataKey: string): T {
  if (looksLikeEnvelope(body, dataKey)) {
    return (body as Record<string, unknown>)[dataKey] as T;
  }
  return body as T;
}

/**
 * The default business-code rule: accept `0` and `200`.
 *
 * Chosen because `0` is the overwhelmingly common "no error" code in Chinese
 * backends and `200` mirrors HTTP for teams that reuse it. Applications with a
 * different convention pass `validateCode` to `@Server(...)`.
 */
export function createDefaultCodeValidator(
  accepted: readonly (number | string)[] = DEFAULT_ACCEPTED_CODES
): SnailCodeValidator {
  const acceptedSet = new Set<string>(accepted.map(String));
  return (code) => (code === undefined || code === null ? true : acceptedSet.has(String(code)));
}

/**
 * Assert the business status code, throwing a {@link SnailResponseError} when
 * the application's rule rejects it.
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

/** Assemble the value `send()` resolves to. */
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
