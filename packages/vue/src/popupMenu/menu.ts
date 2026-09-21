/**
 * 上下文菜单的状态机。
 *
 * ## 这个文件里为什么没有 DOM
 *
 * 所有决定*用户看到什么、点击之后发生什么*的逻辑都放在这里，而本文件除了类型之外
 * 不 import 任何东西：没有 `vue`，没有 `.vue` SFC，也没有 `document`。本包的测试套件
 * 跑在没有 `jsdom` 的纯 Node 环境里（见 `vitest.config.ts`），所以异步解析规则要想
 * 真正被单元测试覆盖，唯一办法就是让这些规则不依赖组件也能触达。面向 DOM 的另一半
 * 在 `SPopUpMenu.ts` 里，它 import 本模块和 SFC。
 *
 * ## 失败即关闭，而不是失败即放行
 *
 * 旧的 `checkBoolean` 默认返回 `true`，条目初始就是 `enabled: true` 和
 * `display: true`，而 `props.options.display().then(...)` 没有任何拒绝处理。后果比
 * 看上去更糟：
 *
 * - 尚未获准的条目在解析期间是**可以点击的**；
 * - *被拒绝*的 `display()`/`enabled()` 会产生未处理的 rejection，并让该条目**永远**
 *   保持可见且可启用。
 *
 * 在这里，`display` 是函数的行在解析完成前隐藏，`enabled` 是函数的行在解析完成前
 * 禁用，被拒绝时该行隐藏或禁用，而且失败只会通过 `onError` 上报一次。
 *
 * The context menu's state machine.
 *
 * ## Why this file has no DOM in it
 *
 * Everything that decides *what the user sees and what happens when they click* lives
 * here, and the file imports nothing but types: no `vue`, no `.vue` SFC, no
 * `document`. The package's test suite runs in a plain Node environment with no
 * `jsdom` (see `vitest.config.ts`), so the only way the async resolution rules can be
 * unit-tested at all is for the rules to be reachable without a component. The
 * DOM-facing half lives in `SPopUpMenu.ts`, which imports this module and the SFC.
 *
 * ## Fail-closed, not fail-open
 *
 * The legacy `checkBoolean` defaulted to `true`, items started `enabled: true` and
 * `display: true`, and `props.options.display().then(...)` had no rejection handler.
 * The consequences were worse than they look:
 *
 * - a not-yet-permitted item was **clickable** during resolution;
 * - a *rejected* `display()`/`enabled()` produced an unhandled rejection and left the
 *   item visible and enabled **forever**.
 *
 * Here, a row whose `display` is a function is hidden until it resolves, a row whose
 * `enabled` is a function is disabled until it resolves, a rejection hides/disables
 * the row, and the failure is reported exactly once through `onError`.
 */

import type {
  ResolvedMenuItem,
  RunCommandOutcome,
  SPopUpMenuItemOptions,
  SPopUpMenuOptions
} from "./type";

let idSeed = 0;

/**
 * Identity for a row that did not bring its own.
 *
 * Generated at snapshot time and preserved through resolution, so the DOM key, the
 * keyboard highlight and the "which source row did this come from" lookup all agree
 * between the pending render and the resolved one.
 */
function nextItemId(): string {
  idSeed += 1;
  return `s-menu-item-${idSeed}`;
}

/**
 * Report a failure through `onError`, exactly once.
 *
 * A reporter that throws is swallowed on purpose: a broken logger must not take the
 * menu down with it, and it must not cause a second report of the same failure.
 */
function report<TContext>(
  error: unknown,
  item: SPopUpMenuItemOptions<TContext>,
  options: SPopUpMenuOptions<TContext>
): void {
  try {
    options.onError?.(error, item);
  } catch {
    /* a throwing reporter is the caller's problem, not the menu's */
  }
}

/**
 * The context as the callback declared it.
 *
 * `options.context` is optional — the legacy API allowed a menu whose commands take
 * nothing — while a callback's parameter is typed by the caller's own `TContext`.
 * This function is the single place that gap is bridged.
 */
function contextFor<TContext>(options: SPopUpMenuOptions<TContext>): TContext {
  return options.context as TContext;
}

/**
 * 菜单的同步、失败即关闭快照。
 *
 * 这就是菜单打开那一瞬间渲染的内容：此时任何异步 `display`/`enabled` 都还没有机会
 * 解析，带异步判断的行处于隐藏或禁用状态，其余行按配置显示。它**不**调用任何用户
 * 回调，这正是「在指针处立即打开」之所以安全的原因。
 *
 * The synchronous, fail-closed snapshot of a menu.
 *
 * This is what the menu renders the instant it opens, before any async
 * `display`/`enabled` has had a chance to resolve: rows with an async predicate are
 * hidden/disabled, everything else is shown as configured. It calls **no** user
 * callback, which is what makes "open at the pointer immediately" safe.
 *
 * @param items 调用方声明的菜单行 / The rows as the caller declared them.
 * @returns 与 `items` 一一对应的解析树；异步行在落定前处于隐藏或禁用状态 /
 *   A resolved tree mirroring `items`; async rows stay hidden or disabled
 *   until they settle.
 */
export function createItemSnapshot<TContext>(
  items: readonly SPopUpMenuItemOptions<TContext>[]
): ResolvedMenuItem[] {
  return items.map((item) => {
    const separator = item.separator === true;
    const displayIsAsync = typeof item.display === "function";
    const enabledIsAsync = typeof item.enabled === "function";

    const visible = separator ? true : displayIsAsync ? false : item.display !== false;
    const enabled =
      !separator &&
      visible &&
      item.disabled !== true &&
      !enabledIsAsync &&
      item.enabled !== false;

    return {
      id: item.id ?? nextItemId(),
      label: item.label,
      icon: item.icon,
      separator,
      danger: item.danger === true,
      visible,
      enabled,
      pending: !separator && (displayIsAsync || enabledIsAsync),
      closeOnClick: item.closeOnClick,
      children: createItemSnapshot(item.children ?? [])
    };
  });
}

/**
 * Settle one snapshot row against its source.
 *
 * `enabled` is only evaluated when the row turned out to be visible: asking whether a
 * hidden row is permitted usually means a needless request.
 */
async function settleRow<TContext>(
  row: ResolvedMenuItem,
  source: SPopUpMenuItemOptions<TContext> | undefined,
  options: SPopUpMenuOptions<TContext>
): Promise<ResolvedMenuItem> {
  if (!source || row.separator) {
    const children = await Promise.all(
      row.children.map((child, index) => settleRow(child, source?.children?.[index], options))
    );
    return { ...row, pending: false, children };
  }

  let visible: boolean;
  if (typeof source.display === "function") {
    try {
      visible = Boolean(await source.display(contextFor(options)));
    } catch (error) {
      report(error, source, options);
      visible = false;
    }
  } else {
    visible = source.display !== false;
  }

  let enabled: boolean;
  if (!visible) {
    enabled = false;
  } else if (source.disabled === true) {
    enabled = false;
  } else if (typeof source.enabled === "function") {
    try {
      enabled = Boolean(await source.enabled(contextFor(options)));
    } catch (error) {
      report(error, source, options);
      enabled = false;
    }
  } else {
    enabled = source.enabled !== false;
  }

  const children = await Promise.all(
    row.children.map((child, index) => settleRow(child, source.children?.[index], options))
  );

  return { ...row, visible, enabled, pending: false, children };
}

/**
 * 解析菜单里每一个异步判断。
 *
 * 返回的树保留快照里的 id，因此调用方可以把待定树换成这棵树，而不丢失它用于激活的
 * 行标识。
 *
 * Resolve every async predicate in a menu.
 *
 * The returned tree keeps the snapshot's ids, so the caller can swap the pending tree
 * out for this one without losing the row identity it uses for activation.
 *
 * @param items 调用方声明的菜单行 / The rows as the caller declared them.
 * @param options 菜单配置，提供 `command` 回调收到的 `context` /
 *   Menu options; supplies the `context` handed to `command` callbacks.
 * @returns 每个异步 `display`/`enabled` 都已落定的解析树 /
 *   The resolved tree with every async `display`/`enabled` settled.
 */
export async function resolveItems<TContext>(
  items: readonly SPopUpMenuItemOptions<TContext>[],
  options: SPopUpMenuOptions<TContext> = {}
): Promise<ResolvedMenuItem[]> {
  const snapshot = createItemSnapshot(items);
  return Promise.all(snapshot.map((row, index) => settleRow(row, items[index], options)));
}

/**
 * 运行某一行的命令。
 *
 * 返回值告诉调用方是否应该关闭菜单；它自己从不做这个决定，因为「关闭」还要受菜单级
 * `closeOnClick` 的约束。失败在这里上报（只报一次），并且**从不**关闭菜单：失败的
 * 异步命令通常需要重试，而在用户指针底下关闭菜单，正是旧版本既丢掉错误、又丢掉等待
 * 态的原因。
 *
 * Run one row's command.
 *
 * The result tells the caller whether to close the menu; it never decides that on its
 * own, because "close" is also subject to the menu-level `closeOnClick`. A failure is
 * reported here (once) and **never** closes the menu: an async command that failed
 * usually wants a retry, and closing under the user's pointer is how the legacy
 * version lost both the error and the pending state.
 *
 * @param item 其命令要运行的那一行 / The row whose command should run.
 * @param options 菜单配置，提供 `command` 回调收到的 `context` /
 *   Menu options; supplies the `context` handed to `command` callbacks.
 * @returns 状态、是否关闭，以及失败时的错误 /
 *   The status, whether to close, and the error on failure.
 */
export async function runCommand<TContext>(
  item: SPopUpMenuItemOptions<TContext>,
  options: SPopUpMenuOptions<TContext> = {}
): Promise<RunCommandOutcome> {
  const shouldClose = item.closeOnClick ?? options.closeOnClick ?? true;

  if (typeof item.command !== "function") {
    // A submenu parent, or a row with no command: nothing to do, nothing to close.
    return { status: "skipped", close: false };
  }

  try {
    await item.command(contextFor(options));
    return { status: "success", close: shouldClose };
  } catch (error) {
    report(error, item, options);
    return { status: "error", close: false, error };
  }
}
