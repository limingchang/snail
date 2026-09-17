import { SnailCancelledError } from "../../error/request";

/**
 * Sleep for `ms`, rejecting with a {@link SnailCancelledError} the moment the
 * signal aborts.
 *
 * A plain `setTimeout` promise is the wrong primitive for a backoff: `abort()`
 * during a 30 second retry delay would leave the loop asleep and the caller's
 * promise pending long after it cancelled. The listener is `{ once: true }` and
 * removed on either outcome so a long-lived signal cannot accumulate handlers.
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
 * Detach a Node timer from the event loop, when it has an `unref`.
 *
 * A polling strategy that is never stopped would otherwise keep a Node process
 * (or a test worker) alive forever. In a browser `setTimeout` returns a number,
 * which has no `unref` — hence the optional call rather than a feature test.
 */
export function unrefTimer(timer: unknown): void {
  (timer as { unref?: () => void } | undefined)?.unref?.();
}

/** Scheduler contract used by `useWatcher`. */
export interface RequestScheduler {
  /** Queue `task` for the next allowed run. The latest task always wins. */
  schedule(task: () => void): void;

  /** `true` while a run is still pending on a timer. */
  readonly pending: boolean;

  /** Drop a pending run without executing it. */
  cancel(): void;
}

/** Timing options accepted by {@link createRequestScheduler}. */
export interface SchedulerOptions {
  /** Wait for quiet before running. Wins over `throttle` when both are set. */
  debounce?: number;
  /** Run at most once per window, on the leading edge. */
  throttle?: number;
}

/**
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
