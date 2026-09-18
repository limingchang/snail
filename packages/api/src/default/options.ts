import { SnailAdapter } from "../adapter/plain";
import type { SnailLogLevel, SnailServerOptions } from "../typings/server";

/** Default key names of the assumed backend envelope. */
export const DEFAULT_RESPONSE_KEYS = {
  code: "code",
  message: "message",
  data: "data"
} as const;

/** Business codes accepted when no `validateCode` is configured. */
export const DEFAULT_ACCEPTED_CODES: readonly number[] = [0, 200];

/** Fully resolved defaults for `@Server(...)`. */
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
  name: "SNAIL_SERVER",
  baseURL: "/",
  timeout: 10000,
  codeKey: DEFAULT_RESPONSE_KEYS.code,
  messageKey: DEFAULT_RESPONSE_KEYS.message,
  dataKey: DEFAULT_RESPONSE_KEYS.data,
  logLevel: "silent",
  coerceJSONString: true,
  // Framework-free by default. A framework adapter is opted into per server rather
  // than installed process-wide, so the choice can never become an import side
  // effect, and two servers may differ.
  stateAdapter: SnailAdapter
} as const;

/** Numeric ordering of log levels, so `logLevel` can be compared. */
export const LOG_LEVEL_WEIGHT: Record<SnailLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

/** Default options for `@Api(...)`. */
export const DEFAULT_API_OPTIONS = {
  url: "",
  name: ""
} as const;
