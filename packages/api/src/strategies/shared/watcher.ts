import type { SnailStateAdapter, SnailStateRef } from "../../typings/adapter";

/**
 * 读取 `watching()` 结果中的一项。
 *
 * `docs/guide/plugin-lifecycle.md` 的 adapter 契约没有提供可移植的「这是 state 句柄吗？」
 * 询问方式：Vue adapter 有 `isState`，React 的没有，plain adapter 的盒子是裸 `{ value }`
 * 对象。因此按可信度顺序处理三种情况：
 *
 * 1. `adapter.isState(value)` 为真——解包它（Vue）。
 * 2. 值是仅有一个自有键 `value` 的普通对象——正是 plain 与 React adapter 分配的形态——
 *    解包它。
 * 3. 其它情况就是值本身。
 *
 * 情况 2 是启发式的，这也是为什么当对象确实是数据而不是句柄时，
 * `watching: () => [{ value: 1 }]` 应写成 `() => [{ value: 1 }.value]`。没有它，
 * `() => [pageRef]`——最自然的写法——会比较 ref 对象本身，永远检测不到变化。
 *
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
 * 把 `watching()` 函数求值为用于比较的普通值。
 *
 * watcher 是用户代码，因此非数组返回值会被归一化成单元素列表，而不是盲目迭代——
 * 展开字符串会比较它的字符，展开 `undefined` 会在 hook 内部抛错。
 *
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
 * 用 `Object.is` 比较两个被观察的快照。
 *
 * 用 `Object.is` 而不是 `===`，是为了让 `NaN` 不会在每次渲染时都被当成变化——否则一个
 * 恰好为 `NaN` 的数值字段上的 watcher 会永远重复发送。
 *
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
