/**
 * Response typing.
 *
 * The library assumes every JSON endpoint answers with a standard envelope:
 *
 * ```json
 * { "code": 0, "message": "ok", "data": {} }
 * ```
 *
 * Both the *shape* and the *key names* are overridable.
 *
 * ## Overriding the shape
 *
 * The default envelope is `SnailEnvelopeSchema`, which is module-augmentable:
 *
 * ```ts
 * // app/env.d.ts
 * declare module "@snail-js/api" {
 *   interface SnailEnvelopeSchema {
 *     status: number;
 *     msg: string;
 *     result: unknown;
 *   }
 * }
 * ```
 *
 * ## Overriding the key names
 *
 * ```ts
 * @Server({
 *   baseURL: "/api",
 *   codeKey: "status",
 *   messageKey: "msg",
 *   dataKey: "result"
 * })
 * class BackEnd extends SnailServer<SnailEnvelopeSchema, "result", "status", "msg"> {}
 * ```
 *
 * This module is types-only on purpose: it is safe to `import type` from, and it
 * contributes nothing to the runtime bundle.
 */

/**
 * The envelope every JSON endpoint is assumed to return.
 *
 * Augment this interface to reshape the default for the whole application.
 */
export interface SnailEnvelopeSchema {
  code: number;
  message: string;
  data: unknown;
}

/** Key names used to read the envelope. */
export interface SnailResponseKeys {
  /** Key holding the business status code. Defaults to `"code"`. */
  code: string;
  /** Key holding the human readable message. Defaults to `"message"`. */
  message: string;
  /** Key holding the actual payload. Defaults to `"data"`. */
  data: string;
}

/**
 * Payloads that bypass the envelope entirely.
 *
 * A `blob` / `arraybuffer` / `stream` response has no `code`/`message`/`data`,
 * so the typed result of such a request is the body itself.
 */
export type SnailRawPayload =
  | Blob
  | ArrayBuffer
  | ReadableStream<Uint8Array>
  | FormData
  | Document;

/** `true` when `T` is a pass-through payload rather than a JSON envelope. */
export type IsRawPayload<T> = T extends SnailRawPayload ? true : false;

/**
 * The full envelope for a payload of type `T`, or `T` itself when `T` is a raw
 * pass-through payload.
 */
export type SnailEnvelope<S, T, D extends string = "data"> =
  IsRawPayload<T> extends true
    ? T
    : S extends Record<string, any>
      ? S & Record<D, T>
      : Record<D, T>;

/** Business status code type, derived from the envelope when possible. */
export type SnailCodeOf<S, C extends string = "code"> = C extends keyof S
  ? S[C]
  : number | string | undefined;

/** Business message type, derived from the envelope when possible. */
export type SnailMessageOf<S, M extends string = "message"> = M extends keyof S
  ? S[M]
  : string | undefined;

/**
 * What every `send()` resolves to.
 *
 * Deliberately richer than the old API's bare envelope: `data` is already
 * unwrapped (the thing you want almost always) while `envelope` and `response`
 * stay available for everything else.
 */
export interface SnailResult<
  S = SnailEnvelopeSchema,
  T = unknown,
  D extends string = "data",
  C extends string = "code",
  M extends string = "message"
> {
  /** The raw axios response. */
  response: import("axios").AxiosResponse<SnailEnvelope<S, T, D>>;
  /** The parsed backend envelope (`{ code, message, data }` by default). */
  envelope: SnailEnvelope<S, T, D>;
  /** The unwrapped payload — `envelope[dataKey]`. */
  data: T;
  /** Business code — `envelope[codeKey]`. */
  code: SnailCodeOf<S, C>;
  /** Business message — `envelope[messageKey]`. */
  message: SnailMessageOf<S, M>;
  /** `true` when the value came from a cache instead of the network. */
  fromCache: boolean;
  /** The final request config, after every plugin and strategy ran. */
  config: import("axios").InternalAxiosRequestConfig;
}

/** Callback invoked when a request succeeds. */
export type SnailSuccessCallback<S, T, D extends string = "data"> = (
  result: SnailResult<S, T, D, any, any>
) => void;

/** Callback invoked when a request fails. */
export type SnailErrorCallback = (error: unknown) => void;

/** Callback invoked when the business code is rejected. */
export type SnailCodeErrorCallback<T = unknown> = (
  code: number | string,
  payload: T,
  error: unknown
) => void;

/** Callback invoked when a request settles, successfully or not. */
export type SnailFinishCallback = () => void;

/** Callback invoked when the response was served from a cache. */
export type SnailCacheHitCallback = () => void;

/**
 * Verdict function deciding whether a business status code is acceptable.
 *
 * Return `true` to accept, `false` to reject with a `SnailResponseError`.
 */
export type SnailCodeValidator = (
  code: number | string,
  envelope: unknown
) => boolean;
