import type { SnailConnection } from "../typings/stream";

/**
 * 为连接对象挂载 `Symbol.dispose` / `Symbol.asyncDispose` 释放符号。
 *
 * 之所以做成辅助函数，而不是在每个传输层上各写两个方法，是因为这两个符号是可选的：
 * `esnext.disposable` 是较新的提案，若把键名内联写死，缺少该特性的引擎会得到一个
 * 名为 `"undefined"` 的属性。挂载之后，连接可以用 `close()`、`using`、
 * `await using` 三种等价方式释放，其中只有 `close()` 在所有环境都可用。
 *
 * Attach `Symbol.dispose` / `Symbol.asyncDispose` to a connection.
 *
 * Defined as a helper rather than as two methods on each transport because the
 * symbols are *optional*: `esnext.disposable` is a recent addition, and an engine
 * that lacks them would otherwise end up with a property literally named
 * `"undefined"` if the keys were written inline.
 *
 * The result is that a connection can be released three equivalent ways —
 * `close()`, `using`, or `await using` — with `close()` staying the only one that
 * works everywhere.
 *
 * @param connection 目标连接对象 / Target connection object.
 * @returns 同一个连接实例，便于链式调用 / The same connection instance, for chaining.
 */
export function withDispose<T extends SnailConnection>(connection: T): T {
  const symbols = Symbol as unknown as { dispose?: symbol; asyncDispose?: symbol };
  const target = connection as unknown as Record<symbol, unknown>;

  if (typeof symbols.dispose === "symbol") {
    target[symbols.dispose] = (): void => {
      connection.close();
    };
  }

  if (typeof symbols.asyncDispose === "symbol") {
    target[symbols.asyncDispose] = async (): Promise<void> => {
      connection.close();
    };
  }

  return connection;
}
