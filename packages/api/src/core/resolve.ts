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
 * Turns raw decorator metadata into concrete, fully-defaulted options.
 *
 * Everything a request needs is resolved *here* rather than spread across the
 * server, the proxy and the method. One place to read, one place to test.
 */

/** Read and default the options written by `@Server(...)`. */
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

/** Read and default the options written by `@Api(...)`. */
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

/** Read the request verb written by `@Get()` / `@Post()` / … */
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

/** Read the full request-method options written by `@Get(path, options)`. */
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
 * Merge the three levels of `@Header(...)` — api class, then method.
 *
 * Method-level headers win, which is the only ordering that lets a single
 * endpoint override a class-wide default.
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

/** Progress callbacks written by `@UploadProgress()` / `@DownloadProgress()`. */
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

/** Join the api prefix with a method path. */
export function resolveRoute(apiURL: string, methodPath: string): string {
  return buildRequestURL(apiURL, methodPath || "");
}

/**
 * Build the axios config a request starts from.
 *
 * Values cascade method → api → server, and only the winner survives. The
 * argument decorators and the plugins refine this further during the pipeline.
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
