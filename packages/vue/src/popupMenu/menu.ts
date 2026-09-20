/**
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
 * The synchronous, fail-closed snapshot of a menu.
 *
 * This is what the menu renders the instant it opens, before any async
 * `display`/`enabled` has had a chance to resolve: rows with an async predicate are
 * hidden/disabled, everything else is shown as configured. It calls **no** user
 * callback, which is what makes "open at the pointer immediately" safe.
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
 * Resolve every async predicate in a menu.
 *
 * The returned tree keeps the snapshot's ids, so the caller can swap the pending tree
 * out for this one without losing the row identity it uses for activation.
 */
export async function resolveItems<TContext>(
  items: readonly SPopUpMenuItemOptions<TContext>[],
  options: SPopUpMenuOptions<TContext> = {}
): Promise<ResolvedMenuItem[]> {
  const snapshot = createItemSnapshot(items);
  return Promise.all(snapshot.map((row, index) => settleRow(row, items[index], options)));
}

/**
 * Run one row's command.
 *
 * The result tells the caller whether to close the menu; it never decides that on its
 * own, because "close" is also subject to the menu-level `closeOnClick`. A failure is
 * reported here (once) and **never** closes the menu: an async command that failed
 * usually wants a retry, and closing under the user's pointer is how the legacy
 * version lost both the error and the pending state.
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
