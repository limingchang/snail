import { SnailCancelledError } from "../../error/request";

/**
 * 休眠 `ms` 毫秒，并在信号中止的瞬间以 {@link SnailCancelledError} 拒绝。
 *
 * 对退避来说，裸的 `setTimeout` promise 是错误的原语：在 30 秒重试延迟期间 `abort()`
 * 会让循环继续沉睡，调用方的 promise 在取消之后很久仍然挂着。监听器以 `{ once: true }`
 * 注册，并在两种结果下都移除，因此长寿命的信号不会累积处理器。
 *
 * Sleep for `ms`, rejecting with a {@link SnailCancelledError} the moment the
 * signal aborts.
 *
 * A plain `setTimeout` promise is the wrong primitive for a backoff: `abort()`
 * during a 30 second retry delay would leave the loop asleep and the caller's
 * promise pending long after it cancelled. The listener is `{ once: true }` and
 * removed on either outcome so a long-lived signal cannot accumulate handlers.
 *
 * @param ms 等待毫秒数 / Milliseconds to wait.
 * @param signal 可选中止信号 / Optional abort signal.
 * @returns 等待结束后兑现 / Resolves once the wait is over.
 * @throws 信号中止时抛出 {@link SnailCancelledError} /
 *   {@link SnailCancelledError} when the signal aborts.
 */
export function cancellableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SnailCancelledError("wait cancelled before it started"));
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new SnailCancelledError("wait cancelled"));
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 把 Node 定时器从事件循环中分离（当它带 `unref` 时）。
 *
 * 轮询策略如果从不停止，会让 Node 进程（或测试 worker）永远活着。浏览器里 `setTimeout`
 * 返回数字，没有 `unref`——因此这里用可选调用而不是特性检测。
 *
 * Detach a Node timer from the event loop, when it has an `unref`.
 *
 * A polling strategy that is never stopped would otherwise keep a Node process
 * (or a test worker) alive forever. In a browser `setTimeout` returns a number,
 * which has no `unref` — hence the optional call rather than a feature test.
 *
 * @param timer `setTimeout` 的返回值 / The value `setTimeout` returned.
 */
export function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

/**
 * `useWatcher` 使用的调度器契约。
 *
 * Scheduler contract used by `useWatcher`.
 */
export interface RequestScheduler {
  /**
   * 把 `task` 排入下一次允许的运行。最新的任务总是胜出。
   *
   * Queue `task` for the next allowed run. The latest task always wins.
   */
  schedule(task: () => void): void;

  /**
   * 仍有一次运行挂在定时器上时为 `true`。
   *
   * `true` while a run is still pending on a timer.
   */
  readonly pending: boolean;

  /**
   * 丢弃尚未执行的那次运行。
   *
   * Drop a pending run without executing it.
   */
  cancel(): void;
}

/**
 * {@link createRequestScheduler} 接受的时间选项。
 *
 * Timing options accepted by {@link createRequestScheduler}.
 */
export interface SchedulerOptions {
  /**
   * 先等待安静下来再运行。两者都设置时优先于 `throttle`。
   *
   * Wait for quiet before running. Wins over `throttle` when both are set.
   */
  debounce?: number;
  /**
   * 每个窗口最多运行一次，在前沿触发。
   *
   * Run at most once per window, on the leading edge.
   */
  throttle?: number;
}

/**
 * 把一串 `schedule()` 调用折叠成至多一次请求。
 *
 * 两种模式，一条规则——**最新的任务胜出**，因为请求必须带最新参数发出，绝不能带突发开始
 * 时捕获的那一份：
 *
 * - `debounce` 等待 `debounce` 毫秒的安静期。每次新调用都会把运行往后推，因此十次按键
 *   只产生一次请求，而不是十次。
 * - `throttle` 在前沿运行，然后每个窗口只预约一次尾随运行。没有尾随运行，突发中的最后
 *   一次变更会被静默丢弃——一个会忽略最后一个字符的搜索框。
 *
 * 两者都配置时 `debounce` 优先（见 `useWatcher`）：两者表达互相矛盾的意图，确定性地选
 * 一个，胜过没人能推理的「半防抖、半节流」混合体。
 *
 * Collapse a burst of `schedule()` calls into at most one request.
 *
 * Two modes, one rule — **the most recent task wins**, because a request must be
 * sent with the latest arguments, never with the ones captured when the burst
 * started:
 *
 * - `debounce` waits for `debounce` ms of quiet. Every new call pushes the run
 *   back, so ten keystrokes produce one request, not ten.
 * - `throttle` runs on the leading edge and then books exactly one trailing run
 *   per window. Without the trailing run the last change in a burst would be
 *   silently dropped — a search box that ignores the final character.
 *
 * `debounce` is preferred when both are configured (see `useWatcher`): the two
 * express contradictory intents, and picking one deterministically beats a
 * half-debounced, half-throttled hybrid nobody can reason about.
 *
 * @param options 时间选项 / The timing options.
 * @returns 请求调度器 / The request scheduler.
 */
export function createRequestScheduler(options: SchedulerOptions = {}): RequestScheduler {
  const debounce = options.debounce && options.debounce > 0 ? options.debounce : 0;
  const throttle = options.throttle && options.throttle > 0 ? options.throttle : 0;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: (() => void) | undefined;
  let lastRunAt = 0;
  // A flag rather than `lastRunAt === 0`: a fake clock can legitimately report
  // time zero, and then every call would look like the free first one.
  let ran = false;

  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const runNow = (): void => {
    const task = latest;
    latest = undefined;
    clear();
    lastRunAt = Date.now();
    ran = true;
    task?.();
  };

  return {
    get pending(): boolean {
      return latest !== undefined;
    },

    schedule(task: () => void): void {
      latest = task;

      if (debounce > 0) {
        clear();
        timer = setTimeout(runNow, debounce);
        return;
      }

      if (throttle > 0) {
        // A trailing run is already booked; replacing `latest` is enough.
        if (timer !== undefined) return;

        const elapsed = Date.now() - lastRunAt;
        if (!ran || elapsed >= throttle) {
          runNow();
          return;
        }
        timer = setTimeout(runNow, throttle - elapsed);
        return;
      }

      runNow();
    },

    cancel(): void {
      clear();
      latest = undefined;
    }
  };
}
