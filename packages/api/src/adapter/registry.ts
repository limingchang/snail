import type { SnailStateAdapter, SnailStateRef } from "../typings/adapter";
import { plainStateAdapter } from "./plain";

/**
 * The active state adapter.
 *
 * Strategies never touch `ref()` or `useState()` directly — they ask this
 * registry. That is what lets one `useRequest` implementation serve Vue, React
 * and framework-free code without the core importing any of them.
 */
let active: SnailStateAdapter = plainStateAdapter;

/** Replace the active adapter. Called once by a framework entry point. */
export function setStateAdapter(adapter: SnailStateAdapter): void {
  if (!adapter || typeof adapter.create !== "function") {
    throw new TypeError(
      "[snail] setStateAdapter() expects an object with a create() method"
    );
  }
  active = adapter;
}

/** The active adapter. */
export function getStateAdapter(): SnailStateAdapter {
  return active;
}

/** `true` when an adapter other than the framework-free default is installed. */
export function hasFrameworkAdapter(): boolean {
  return active !== plainStateAdapter;
}

/** Create a tracked value with the active adapter. */
export function createState<T>(initial: T): SnailStateRef<T> {
  return active.create(initial);
}

/** Read a tracked value. */
export function readState<T>(ref: SnailStateRef<T>): T {
  return active.read(ref);
}

/** Write a tracked value. */
export function writeState<T>(ref: SnailStateRef<T>, value: T): void {
  active.write(ref, value);
}

/** Release a tracked value, if the adapter allocated anything. */
export function disposeState<T>(ref: SnailStateRef<T>): void {
  active.dispose?.(ref);
}
