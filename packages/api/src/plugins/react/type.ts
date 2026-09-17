/**
 * Options accepted by the React adapter plugin.
 *
 * Deliberately empty: the adapter mirrors the envelope keys the server already
 * declares (`dataKey` / `codeKey` / `messageKey`) and adds the two fixed handles
 * `loading` and `error`. A per-plugin key option was avoided on purpose — the
 * companion `useMethodState` hook has to bind the same handles in a fixed order,
 * and a configurable key would have to be threaded through the hook to stay in
 * sync.
 */
export interface ReactAdapterOptions {}

/**
 * What {@link useMethodState} returns.
 *
 * Deliberately discriminated from a `SnailResult`: the values update over time and
 * each one is read live from its own state box, so `data` can be `undefined`
 * (nothing loaded yet) even though a successful send always has one.
 */
export interface ReactMethodState<TData = unknown> {
  /** Unwrapped payload of the most recent response. */
  data: TData | undefined;

  /** `true` between `send()` and settlement. */
  loading: boolean;

  /** Failure of the most recent send, cleared at the start of the next one. */
  error: unknown;

  /** Business code of the most recent response. */
  code: unknown;

  /** Business message of the most recent response. */
  message: unknown;
}
