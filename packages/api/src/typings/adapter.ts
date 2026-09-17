/**
 * Framework state abstraction used by the request strategies.
 *
 * A strategy needs to hand the caller values that update as the request
 * progresses. "Updates" means something different in every framework, so the
 * strategies never touch `ref()` or `useState()` directly — they go through a
 * {@link SnailStateAdapter}.
 *
 * A state handle is intentionally minimal: anything with a mutable `value`
 * property qualifies, which is exactly what a Vue `Ref<T>` is.
 */

/** A tracked value. Vue's `Ref<T>` structurally satisfies this. */
export interface SnailStateRef<T = unknown> {
  value: T;
}

/** Bridge between the strategies and one UI framework's reactivity system. */
export interface SnailStateAdapter {
  /** Identifier used in error messages, e.g. `"vue"`. */
  readonly name: string;

  /** Create a tracked value with an initial value. */
  create<T>(initial: T): SnailStateRef<T>;

  /** Read the current value. */
  read<T>(ref: SnailStateRef<T>): T;

  /** Write a new value. */
  write<T>(ref: SnailStateRef<T>, value: T): void;

  /**
   * Subscribe to changes.
   *
   * Required by frameworks that re-render on subscription (React). Vue's
   * `ref()` is tracked by the render effect itself, so its adapter omits this.
   */
  subscribe?<T>(ref: SnailStateRef<T>, listener: (value: T) => void): () => void;

  /**
   * Read a state during render, subscribing the current component.
   *
   * React's `useSyncExternalStore` lives here; Vue needs nothing.
   */
  useBind?<T>(ref: SnailStateRef<T>): T;

  /** `true` when a value already is a state handle of this framework. */
  isState?(value: unknown): boolean;

  /** Release whatever the adapter allocated for this state. */
  dispose?<T>(ref: SnailStateRef<T>): void;
}

/** Options shared by every request strategy. */
export interface SnailStrategyCommonOptions {
  /** Run the request as soon as the strategy is created. Defaults to `false`. */
  immediate?: boolean;

  /**
   * State adapter to use.
   *
   * Defaults to the globally registered adapter (Vue in the default entry).
   */
  adapter?: SnailStateAdapter;

  /** Called after a successful request. */
  onSuccess?: (data: unknown) => void;

  /** Called after a failed request. */
  onError?: (error: unknown) => void;

  /** Called once the request settles, successfully or not. */
  onFinish?: () => void;
}
