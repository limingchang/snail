import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";

/**
 * Read one entry of a `watching()` result.
 *
 * `docs/guide/plugin-lifecycle.md`'s adapter contract exposes no way to ask "is this a state
 * handle?" portably: the Vue adapter has `isState`, React's has none, and the
 * plain adapter's boxes are bare `{ value }` objects. So three cases are handled,
 * in order of confidence:
 *
 * 1. `adapter.isState(value)` says yes — unwrap it (Vue).
 * 2. the value is a plain object whose *only* own key is `value` — the exact shape
 *    the plain and React adapters allocate — unwrap it.
 * 3. anything else is the value itself.
 *
 * Case 2 is a heuristic, and it is the reason `watching: () => [{ value: 1 }]`
 * should be written as `() => [{ value: 1 }.value]` if the object is genuine
 * data rather than a handle. Without it, `() => [pageRef]` — the natural thing to
 * write — would compare the ref object itself and never detect a change.
 */
export function unwrapWatchedValue(adapter: SnailStateAdapter, value: unknown): unknown {
  if (adapter.isState?.(value)) {
    return adapter.read(value as SnailStateRef<unknown>);
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "value") {
      return (value as SnailStateRef<unknown>).value;
    }
  }

  return value;
}

/**
 * Evaluate a `watching()` function into the plain values that get compared.
 *
 * A watcher is user code, so a non-array return is normalised to a one-element
 * list rather than iterated blindly — spreading a string would compare its
 * characters, and spreading `undefined` would throw inside the hook.
 */
export function readWatchedValues(
  adapter: SnailStateAdapter,
  watching: () => readonly unknown[]
): unknown[] {
  const produced = watching() as unknown;
  const list = Array.isArray(produced) ? produced : [produced];
  return list.map((value) => unwrapWatchedValue(adapter, value));
}

/**
 * Compare two watched snapshots with `Object.is`.
 *
 * `Object.is` rather than `===` so `NaN` does not look like a change on every
 * render — a watcher over a numeric field that happens to be `NaN` would
 * otherwise re-send forever.
 */
export function shallowEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}
