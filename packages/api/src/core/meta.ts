import { SnailCancelledError } from "../error/request";
import type { SnailStateRef } from "../typings/adapter";
import type { SnailContext } from "./context";
import { unwrapEnvelope } from "./response";

/** Key of the `loading` handle. Fixed, and not part of the envelope. */
export const META_LOADING_KEY = "loading";

/** Key of the `error` handle. Fixed, and not part of the envelope. */
export const META_ERROR_KEY = "error";

/**
 * The caller-visible projection of a request.
 *
 * ## Why this lives in core
 *
 * It used to be two plugins — `VueAdapter` and `ReactAdapter` — that each created
 * the same five handles on `ctx.meta`, while the `use*` hooks created their own
 * state through a *second*, process-global adapter registry. One decision ("this
 * app is Vue") therefore had to be declared twice, and the global half made the
 * framework an import side effect.
 *
 * Both projections are now driven by the single `@Server({ stateAdapter })` option.
 * Core still never imports a framework: it talks to the `SnailStateAdapter`
 * interface, and whichever adapter the server resolved supplies the boxes.
 *
 * ## Why the handles are created once and only written afterwards
 *
 * `createMetaHandles` runs when the `SnailMethod` is built; the writers run per
 * `send()`. Creating them per send is the classic bug where a list keeps rendering
 * the first page forever — the UI captured handle #1 while the second send wrote
 * into handle #2. The `isState` guard makes the re-run safe: a context built before
 * the server's adapter was known gets the handles on the first send, and an
 * existing handle is never replaced out from under a rendered view.
 */
export function createMetaHandles(ctx: SnailContext): void {
  const adapter = ctx.serverOptions.stateAdapter;
  const { dataKey, codeKey, messageKey } = ctx.serverOptions;

  const handles: Array<[string, unknown]> = [
    [dataKey, undefined],
    [codeKey, undefined],
    [messageKey, undefined],
    [META_LOADING_KEY, false],
    [META_ERROR_KEY, undefined]
  ];

  for (const [key, initial] of handles) {
    if (adapter.isState?.(ctx.meta[key])) continue;
    ctx.meta[key] = adapter.create(initial);
  }
}

/** Write one handle, ignoring a key nobody created. */
export function writeMeta(ctx: SnailContext, key: string, value: unknown): void {
  const handle = ctx.meta[key] as SnailStateRef | undefined;
  if (handle === undefined) return;
  ctx.serverOptions.stateAdapter.write(handle, value);
}

/**
 * Start of a send: flag loading and clear the previous failure.
 *
 * A stale error must not keep rendering next to data that has just loaded.
 */
export function markMetaPending(ctx: SnailContext): void {
  writeMeta(ctx, META_LOADING_KEY, true);
  writeMeta(ctx, META_ERROR_KEY, undefined);
}

/**
 * A response arrived: publish the payload, code and message.
 *
 * Called *before* the `success` event so a handler that reads `meta` sees the fresh
 * values rather than the previous request's.
 */
export function markMetaSuccess(ctx: SnailContext): void {
  const response = ctx.getResponse();
  if (!response) return;

  const { dataKey, codeKey, messageKey } = ctx.serverOptions;
  const body = response.data;

  writeMeta(ctx, dataKey, unwrapEnvelope(body, dataKey));
  writeMeta(ctx, codeKey, readKey(body, codeKey));
  writeMeta(ctx, messageKey, readKey(body, messageKey));
  writeMeta(ctx, META_ERROR_KEY, undefined);
}

/**
 * The request failed.
 *
 * A cancellation is expected control flow, not a failure — writing it would flash
 * an error state every time a component unmounts mid-request.
 */
export function markMetaFailure(ctx: SnailContext, error: unknown): void {
  if (error instanceof SnailCancelledError) return;
  writeMeta(ctx, META_ERROR_KEY, error);
}

/** The request settled, successfully or not. */
export function markMetaSettled(ctx: SnailContext): void {
  writeMeta(ctx, META_LOADING_KEY, false);
}

/** Read one key off an unknown body, or `undefined`. */
function readKey(body: unknown, key: string): unknown {
  if (body === null || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key];
}
