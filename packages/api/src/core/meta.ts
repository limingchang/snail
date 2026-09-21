import { SnailCancelledError } from "../error/request";
import type { SnailStateRef } from "../typings/adapter";
import type { SnailContext } from "./context";
import { unwrapEnvelope } from "./response";

/**
 * `loading` 句柄的键。固定不变，且不属于响应信封。
 *
 * Key of the `loading` handle. Fixed, and not part of the envelope.
 */
export const META_LOADING_KEY = "loading";

/**
 * `error` 句柄的键。固定不变，且不属于响应信封。
 *
 * Key of the `error` handle. Fixed, and not part of the envelope.
 */
export const META_ERROR_KEY = "error";

/**
 * 生成调用方可见的请求投影 —— `ctx.meta` 上的标准句柄。
 *
 * 它以前是两个插件（`VueAdapter` 与 `ReactAdapter`），各自在 `ctx.meta` 上创建
 * 同样的五个句柄，而 `use*` 钩子又通过另一套进程级全局适配器注册表创建自己的状态。
 * 于是“这个应用用 Vue”这一个决定必须声明两次，全局的那一半还让框架变成了导入副作用。
 * 现在两种投影都由唯一的 `@Server({ stateAdapter })` 选项驱动；核心始终不导入任何
 * 框架，只与 `SnailStateAdapter` 接口对话。
 *
 * 句柄只在构建 `SnailMethod` 时创建一次，此后只写入。每次发送都新建句柄，正是
 * “列表永远渲染第一页”的经典 bug：UI 捕获了 1 号句柄，而第二次发送写进了 2 号句柄。
 * `isState` 守卫让重复执行变得安全：在服务器适配器已知之前构建的上下文会在第一次
 * 发送时拿到句柄，而已有句柄绝不会在已渲染的视图眼皮底下被替换掉。
 *
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
 *
 * @param ctx 当前请求上下文 / The current request context.
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

/**
 * 写入一个句柄，键不存在时静默忽略。
 *
 * Write one handle, ignoring a key nobody created.
 *
 * @param ctx 当前请求上下文 / The current request context.
 * @param key `meta` 上的键 / The key on `meta`.
 * @param value 要写入的值 / The value to write.
 */
export function writeMeta(ctx: SnailContext, key: string, value: unknown): void {
  const handle = ctx.meta[key] as SnailStateRef | undefined;
  if (handle === undefined) return;
  ctx.serverOptions.stateAdapter.write(handle, value);
}

/**
 * 一次发送的开始：标记 loading 并清除上一次的失败信息。
 *
 * 陈旧的错误不应继续渲染在刚刚加载好的数据旁边。
 *
 * Start of a send: flag loading and clear the previous failure.
 *
 * A stale error must not keep rendering next to data that has just loaded.
 *
 * @param ctx 当前请求上下文 / The current request context.
 */
export function markMetaPending(ctx: SnailContext): void {
  writeMeta(ctx, META_LOADING_KEY, true);
  writeMeta(ctx, META_ERROR_KEY, undefined);
}

/**
 * 响应到达：发布 payload、code 和 message。
 *
 * 它在 `success` 事件**之前**调用，这样读取 `meta` 的处理器看到的是本次响应的值，
 * 而不是上一次请求留下的值。
 *
 * A response arrived: publish the payload, code and message.
 *
 * Called *before* the `success` event so a handler that reads `meta` sees the fresh
 * values rather than the previous request's.
 *
 * @param ctx 当前请求上下文 / The current request context.
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
 * 请求失败。
 *
 * 取消属于预期的控制流，而不是失败 —— 若把它写进去，组件在请求途中卸载时每次都会
 * 闪出一次错误状态。
 *
 * The request failed.
 *
 * A cancellation is expected control flow, not a failure — writing it would flash
 * an error state every time a component unmounts mid-request.
 *
 * @param ctx 当前请求上下文 / The current request context.
 * @param error 导致失败的错误 / The error that caused the failure.
 */
export function markMetaFailure(ctx: SnailContext, error: unknown): void {
  if (error instanceof SnailCancelledError) return;
  writeMeta(ctx, META_ERROR_KEY, error);
}

/**
 * 请求结束，无论成功与否。
 *
 * The request settled, successfully or not.
 *
 * @param ctx 当前请求上下文 / The current request context.
 */
export function markMetaSettled(ctx: SnailContext): void {
  writeMeta(ctx, META_LOADING_KEY, false);
}

/**
 * 从未知响应体上读取一个键，读不到时返回 `undefined`。
 *
 * Read one key off an unknown body, or `undefined`.
 *
 * @param body 未知的响应体 / The unknown body.
 * @param key 要读取的键 / The key to read.
 * @returns 该键的值，或 `undefined` / The value at that key, or `undefined`.
 */
function readKey(body: unknown, key: string): unknown {
  if (body === null || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key];
}
