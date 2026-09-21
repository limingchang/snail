import { noop } from "../../utils/object";

/**
 * 一个有界并发的异步任务队列。
 *
 * `useUploader` 需要它只为一个原因：用户一次拖入 200 个文件时，不能打开 200 个 socket。
 * 队列同时负责「是否全部结束？」这个问题，因此 `upload()` 可以交回一个在整批任务排空时
 * 兑现的 promise，而不必让调用方轮询文件列表。
 *
 * A bounded-concurrency queue of asynchronous tasks.
 *
 * `useUploader` needs this for one reason: a user dropping 200 files must not open
 * 200 sockets. The queue also owns the "is everything finished?" question, so
 * `upload()` can hand back a promise that resolves when the batch drains instead
 * of making the caller poll the file list.
 */
export interface TaskQueue {
  /**
   * 把任务入队；一旦有空位就开始执行。
   *
   * Enqueue a task; it starts as soon as a slot is free.
   */
  add(task: () => Promise<void>): void;

  /**
   * 在没有任务运行、也没有任务等待时兑现。
   *
   * Resolves once nothing is running and nothing is waiting.
   */
  drain(): Promise<void>;

  /**
   * 丢弃所有尚未开始的任务。正在运行的任务不受影响。
   *
   * Drop every task that has not started yet. Running tasks are untouched.
   */
  clear(): void;

  /**
   * 当前正在运行的任务数。
   *
   * Number of tasks currently running.
   */
  readonly active: number;

  /**
   * 正在等待空位的任务数。
   *
   * Number of tasks waiting for a slot.
   */
  readonly pending: number;
}

/**
 * 创建一个至多同时运行 `concurrency` 个任务的队列。
 *
 * 被拒绝的任务会被吞掉，而不是让整个队列失败：一个上传出错不该卡住其余上传，调用方本来
 * 就能通过每个文件的状态观察到失败。`concurrency` 会被钳制到至少 1，因为零槽位的队列
 * 永远不会排空，`drain()` 也就永远不会兑现。
 *
 * Create a queue that runs at most `concurrency` tasks at a time.
 *
 * A task that rejects is swallowed rather than failing the queue: one broken
 * upload must not stall the remaining ones, and the caller observes the failure
 * through per-file state anyway. `concurrency` is clamped to at least 1, because a
 * queue with zero slots would never drain and `drain()` would never resolve.
 *
 * @param concurrency 并发上限。默认 `1` / Maximum concurrency. `1` by default.
 * @returns 新建的任务队列 / The new task queue.
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
