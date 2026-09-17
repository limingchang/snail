import { vueStateAdapter } from "../../adapter/vue";
import { createPlugin } from "../../core/plugin";
import { readKey, unwrapEnvelope } from "../../core/response";
import { SnailCancelledError } from "../../error/request";
import type { SnailContext } from "../../core/context";
import type { SnailStateRef } from "../../typings/adapter";
import type { VueAdapterOptions } from "./type";

/**
 * Vue adapter plugin.
 *
 * Mirrors every request's state onto `ctx.meta` as Vue refs, so a component can
 * render `method.meta.data` / `loading` / `error` without writing a single
 * `ref()` or `watch()` itself.
 *
 * ## Why `initMeta` and not `beforeRequest`
 *
 * `initMeta` runs **once**, when the `SnailMethod` is built; `beforeCreate` runs
 * per `send()`. Creating the refs in the per-send hook is the classic bug where a
 * list keeps rendering the first page forever: the UI captured ref #1 while the
 * second send wrote into ref #2. The handles are created here and only ever
 * *written* afterwards, so the object the caller holds stays live for the whole
 * life of the method.
 *
 * ## Why the work is split across four hooks
 *
 * `ctx.meta` is caller-visible, so each handle is written at the moment its value
 * becomes true: the payload after the response arrives (before the `success`
 * event, so a handler that reads `meta.data` sees fresh data), the error before
 * the `error`/`codeError` event, and `loading` in `afterRequest` — which runs in a
 * `finally`, for success, failure and cancellation alike.
 */

/** Key of the `loading` handle. Fixed, and not part of the envelope. */
const LOADING_KEY = "loading";

/** Key of the `error` handle. Fixed, and not part of the envelope. */
const ERROR_KEY = "error";

/**
 * Create one handle unless the caller already holds one for that key.
 *
 * The guard matters because `send()` re-runs `initMeta` when the context was built
 * before the plugin was installed; recreating refs there would silently detach
 * whatever the UI is rendering.
 */
function ensureHandle(ctx: SnailContext, key: string, initial: unknown): void {
  if (vueStateAdapter.isState?.(ctx.meta[key])) return;
  ctx.meta[key] = vueStateAdapter.create(initial);
}

/** Create the five handles. Runs once per `SnailMethod`. */
function createHandles(ctx: SnailContext): void {
  const { dataKey, codeKey, messageKey } = ctx.serverOptions;
  ensureHandle(ctx, dataKey, undefined);
  ensureHandle(ctx, codeKey, undefined);
  ensureHandle(ctx, messageKey, undefined);
  ensureHandle(ctx, LOADING_KEY, false);
  ensureHandle(ctx, ERROR_KEY, undefined);
}

/**
 * Write one handle, ignoring a key this plugin never created.
 *
 * A missing handle means the caller removed it or another adapter owns the key;
 * skipping is better than creating a ref nobody holds a reference to.
 */
function writeHandle(ctx: SnailContext, key: string, value: unknown): void {
  const handle = ctx.meta[key];
  if (handle) vueStateAdapter.write(handle as SnailStateRef, value);
}

/** Copy the envelope of the current response into the caller's refs. */
function captureResponse(ctx: SnailContext): void {
  const response = ctx.getResponse();
  if (!response) return;

  const { dataKey, codeKey, messageKey } = ctx.serverOptions;
  writeHandle(ctx, dataKey, unwrapEnvelope(response.data, dataKey));
  writeHandle(ctx, codeKey, readKey(response.data, codeKey));
  writeHandle(ctx, messageKey, readKey(response.data, messageKey));
}

/**
 * Create the Vue adapter plugin.
 *
 * ```ts
 * Service.use(VueAdapter());
 *
 * const user = Service.createApi(UserApi).getUser("1");
 * // renders immediately: `user.meta.loading.value === false`
 * await user.send();
 * user.meta.data.value;   // the unwrapped payload
 * ```
 */
export const VueAdapter = createPlugin<VueAdapterOptions>({
  name: "vue-adapter",
  priority: 0,

  setup() {
    return {
      initMeta(ctx) {
        createHandles(ctx);
      },

      beforeCreate(ctx) {
        writeHandle(ctx, LOADING_KEY, true);
        // A new attempt clears the previous failure; otherwise a stale error would
        // keep rendering next to data that has just loaded successfully.
        writeHandle(ctx, ERROR_KEY, undefined);
      },

      afterResponse(ctx, next) {
        captureResponse(ctx);
        return next();
      },

      onError(ctx, error) {
        // Cancellation is expected control flow, not a failure: writing it would
        // flash an error state every time a component unmounts mid-request.
        if (error instanceof SnailCancelledError) return;
        writeHandle(ctx, ERROR_KEY, error);
      },

      afterRequest(ctx) {
        writeHandle(ctx, LOADING_KEY, false);
      }
    };
  }
});
