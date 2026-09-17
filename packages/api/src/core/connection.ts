import type { SnailConnection } from "../typings/stream";

/**
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
