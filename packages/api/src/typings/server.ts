import type { AxiosRequestConfig } from "axios";
import type { SnailCodeValidator, SnailEnvelopeSchema } from "./response";

/** Severity used by the logger. */
export type SnailLogLevel = "silent" | "error" | "warn" | "info" | "debug";

/**
 * Options accepted by `@Server(...)`.
 *
 * Every field is optional; unspecified fields fall back to
 * `DEFAULT_SERVER_OPTIONS`.
 */
export interface SnailServerOptions {
  /**
   * Unique identifier of this server.
   *
   * Defaults to the decorated class name. It namespaces plugin registries,
   * cache entries and log lines, so two servers in one app must not share it.
   */
  name?: string;

  /** Prefix every request url is resolved against. Defaults to `"/"`. */
  baseURL?: string;

  /** Request timeout in milliseconds. Defaults to `10000`. */
  timeout?: number;

  /**
   * axios adapter. Leave unset to use axios' own default detection, which picks
   * `xhr`/`fetch` in a browser and `http` in Node.
   */
  adapter?: AxiosRequestConfig["adapter"];

  /** Extra headers merged into every request of this server. */
  headers?: AxiosRequestConfig["headers"];

  /** Extra query params merged into every request of this server. */
  params?: AxiosRequestConfig["params"];

  /** Default `responseType` for every request of this server. */
  responseType?: AxiosRequestConfig["responseType"];

  /** Send cookies / auth headers on cross-site requests. */
  withCredentials?: boolean;

  /**
   * Key holding the business status code. Defaults to `"code"`.
   * @see SnailResponseKeys
   */
  codeKey?: string;

  /**
   * Key holding the business message. Defaults to `"message"`.
   * @see SnailResponseKeys
   */
  messageKey?: string;

  /**
   * Key holding the payload. Defaults to `"data"`.
   * @see SnailResponseKeys
   */
  dataKey?: string;

  /**
   * Decides whether a business status code is acceptable.
   *
   * Defaults to accepting `0` and `200`. Returning `false` rejects the request
   * with a `SnailResponseError` carrying the full envelope.
   */
  validateCode?: SnailCodeValidator;

  /**
   * Log level. Defaults to `"silent"`, because a request library must not write
   * to the console unless the application asked for it.
   */
  logLevel?: SnailLogLevel;

  /** Parse a JSON string body when the server forgot the content-type header. */
  coerceJSONString?: boolean;
}

/**
 * `SnailServerOptions` with every default applied.
 *
 * Plugins receive this, so they never have to re-apply defaults themselves.
 */
export interface ResolvedServerOptions extends SnailServerOptions {
  name: string;
  baseURL: string;
  timeout: number;
  codeKey: string;
  messageKey: string;
  dataKey: string;
  logLevel: SnailLogLevel;
  coerceJSONString: boolean;
}

/** Narrow an arbitrary value to a usable envelope schema. */
export type SnailServerEnvelope = SnailEnvelopeSchema;
