import { noop } from "../../utils/object";

/**
 * A bounded-concurrency queue of asynchronous tasks.
 *
 * `useUploader` needs this for one reason: a user dropping 200 files must not open
 * 200 sockets. The queue also owns the "is everything finished?" question, so
 * `upload()` can hand back a promise that resolves when the batch drains instead
 * of making the caller poll the file list.
 */
export interface TaskQueue {
  /** Enqueue a task; it starts as soon as a slot is free. */
  add(task: () => Promise<void>): void;

  /** Resolves once nothing is running and nothing is waiting. */
  drain(): Promise<void>;

  /** Drop every task that has not started yet. Running tasks are untouched. */
  clear(): void;

  /** Number of tasks currently running. */
  readonly active: number;

  /** Number of tasks waiting for a slot. */
  readonly pending: number;
}

/**
 * Create a queue that runs at most `concurrency` tasks at a time.
 *
 * A task that rejects is swallowed rather than failing the queue: one broken
 * upload must not stall the remaining ones, and the caller observes the failure
 * through per-file state anyway. `concurrency` is clamped to at least 1, because a
 * queue with zero slots would never drain and `drain()` would never resolve.
 */
export function createTaskQueue(concurrency = 1): TaskQueue {
  const limit = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  const waiting: Array<() => Promise<void>> = [];
  let active = 0;
  let idleWaiters: Array<() => void> = [];

  const settleIdle = (): void => {
    if (active > 0 || waiting.length > 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const waiter of waiters) waiter();
  };

  const pump = (): void => {
    while (active < limit && waiting.length > 0) {
      const task = waiting.shift()!;
      active += 1;
      void Promise.resolve()
        .then(task)
        .catch(noop)
        .then(() => {
          active -= 1;
          pump();
          settleIdle();
        });
    }
    settleIdle();
  };

  return {
    get active(): number {
      return active;
    },

    get pending(): number {
      return waiting.length;
    },

    add(task: () => Promise<void>): void {
      waiting.push(task);
      // Deferred by one microtask: `add()` is often called in a loop, and pumping
      // synchronously would start the first task before the loop finished queueing
      // the rest — observable as an out-of-order start when tasks log or abort.
      queueMicrotask(pump);
    },

    drain(): Promise<void> {
      if (active === 0 && waiting.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    },

    clear(): void {
      waiting.length = 0;
      settleIdle();
    }
  };
}
