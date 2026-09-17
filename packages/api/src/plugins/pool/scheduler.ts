import { t } from "../../locale";
import { POOL_ERROR_CODES, SnailPoolError } from "./type";

/**
 * The slice of `AbortSignal` the scheduler uses.
 *
 * Structurally typed rather than declared as `AbortSignal` because axios hands the
 * plugin its own `GenericAbortSignal`, which does not satisfy the DOM interface —
 * it lacks `reason`/`throwIfAborted` and even types the listener methods as
 * optional. In practice the object is a real `AbortSignal`, so the listener path is
 * always available; the optional methods are handled anyway, and a signal that
 * cannot be listened to simply means an already-queued request is not withdrawn
 * early — it still gets its slot and is rejected by the transport.
 */
export interface AbortLike {
  readonly aborted: boolean;
  addEventListener?(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener?(type: "abort", listener: () => void): void;
}

/**
 * Options accepted by the request-pool plugin.
 *
 * ## Why a pool exists at all
 *
 * A browser already queues requests: HTTP/1.1 allows about six connections per
 * origin, and everything beyond that waits inside the network stack. That built-in
 * queue is FIFO, invisible, and unprioritised — an application that fires fifty
 * requests from one screen cannot say that the one the user is looking at should
 * go first, cannot observe how many are waiting, and cannot avoid a burst that
 * starves the rest of the page.
 *
 * HTTP/2 does not remove the need either: multiplexing replaces the six-connection
 * cap with a *stream* limit (commonly 100), and the server still has a finite
 * capacity. A burst of five hundred requests over HTTP/2 will happily saturate it.
 *
 * A pool gives three things the browser cannot: a hard ceiling that holds on both
 * protocols, a priority order, and a bounded queue that fails fast instead of
 * silently piling up.
 */
export interface RequestPoolOptions {
  /**
   * Maximum requests in flight at once. Defaults to `6`.
   *
   * Six is the classic HTTP/1.1 per-origin connection cap, so it is the largest
   * value that cannot make things worse on an old server while still bounding an
   * HTTP/2 burst. Raising it helps only when the backend is known to cope.
   */
  concurrency?: number;

  /**
   * Maximum requests allowed to *wait*. Defaults to `Infinity`.
   *
   * Set a finite value to fail fast: once the queue is full, an extra request
   * rejects immediately rather than joining an unbounded backlog the user will
   * never see resolved.
   */
  maxQueue?: number;

  /**
   * How long a queued request may wait, in milliseconds. Defaults to `0`, meaning
   * no limit.
   *
   * A request the user has stopped waiting for is worse than a failed one — it
   * still consumes a slot eventually and may overwrite fresher data.
   */
  queueTimeout?: number;

  /**
   * Ordering weight for a queued request. **Lower runs first**; ties keep arrival
   * order, and a request that finds a free slot never queues at all.
   *
   * @example
   * ```ts
   * // Requests the user is looking at jump ahead of background prefetches.
   * priority: (ctx) => (ctx.state.get("prefetch") ? 100 : 0)
   * ```
   */
  priority?: (ctx: unknown) => number;
}

/** Live counters for a {@link RequestPoolScheduler}. */
export interface RequestPoolStats {
  /** Requests currently holding a slot. */
  active: number;
  /** Requests waiting for a slot. */
  queued: number;
  /** Configured ceiling. */
  concurrency: number;
}

/** A resolve/reject pair plus the bookkeeping the queue needs to drop it. */
export interface PoolTicket {
  /** Give the slot back. Idempotent. */
  readonly release: () => void;
}

interface Waiter {
  readonly priority: number;
  readonly sequence: number;
  settle(ticket: PoolTicket): void;
  fail(error: unknown): void;
  /** Remove the queue's own bookkeeping (timer, abort listener). */
  dispose(): void;
}

/**
 * The scheduling core of the request pool.
 *
 * Deterministic and free of any request or plugin concept: it hands out `release`
 * callbacks and knows nothing about what they guard. That makes the hard part —
 * ordering, fairness and the guarantee that a slot is always returned — testable
 * on its own, without a server or a network.
 *
 * ## Messages come from the plugin
 *
 * The refusal messages are contributed by `RequestPool`'s `setup`, following the
 * plugin-owned-strings convention. Using this class **standalone** therefore yields
 * the raw message keys rather than translated text — the `code` on each
 * {@link SnailPoolError} is always correct, and that is what callers should branch
 * on. Registering a catalogue yourself is enough if you want the text too.
 *
 * ## The invariant that matters
 *
 * `active` must never drift from the number of outstanding tickets. Every failure
 * path (a queue that is full, a wait that times out, a request that is aborted,
 * a waiter dropped by `clear`) either never increments `active` or has already
 * been counted, and `release()` is idempotent so a double release from a `finally`
 * plus an abort listener cannot leak a slot. A leaked slot is invisible until the
 * pool permanently deadlocks at its ceiling, at which point every later request
 * hangs — which is why it is enforced here rather than at the call site.
 */
export class RequestPoolScheduler {
  private concurrency: number;
  private readonly maxQueue: number;
  private readonly queueTimeout: number;
  private readonly priorityOf: ((ctx: unknown) => number) | undefined;

  private active = 0;
  private sequence = 0;
  private readonly waiters: Waiter[] = [];

  constructor(options: RequestPoolOptions = {}) {
    const concurrency = Number.isFinite(options.concurrency)
      ? Math.floor(options.concurrency as number)
      : 6;
    this.concurrency = Math.max(1, concurrency);
    this.maxQueue = Number.isFinite(options.maxQueue)
      ? Math.max(0, Math.floor(options.maxQueue as number))
      : Number.POSITIVE_INFINITY;
    this.queueTimeout = Math.max(0, options.queueTimeout ?? 0);
    this.priorityOf = options.priority;
  }

  /** Current counters. */
  get stats(): RequestPoolStats {
    return { active: this.active, queued: this.waiters.length, concurrency: this.concurrency };
  }

  /** Change the ceiling at runtime; raising it immediately admits queued work. */
  setConcurrency(value: number): void {
    if (!Number.isFinite(value)) return;
    this.concurrency = Math.max(1, Math.floor(value));
    this.pump();
  }

  /**
   * Take a slot, or wait for one.
   *
   * Resolves with a ticket whose `release()` returns the slot. Rejects when the
   * queue is full or the wait exceeds `queueTimeout`. `signal` lets an abandoned
   * request leave the queue instead of holding a place it will never use.
   */
  acquire(ctx: unknown, signal?: AbortLike): Promise<PoolTicket> {
    if (signal?.aborted) {
      return Promise.reject(this.abortError());
    }

    if (this.active < this.concurrency) {
      return Promise.resolve(this.issue());
    }

    if (this.waiters.length >= this.maxQueue) {
      return Promise.reject(
        new SnailPoolError(
          t("error.pool.queueFull", this.waiters.length),
          POOL_ERROR_CODES.queueFull
        )
      );
    }

    return new Promise<PoolTicket>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      let done = false;

      const waiter: Waiter = {
        priority: this.priorityOfFor(ctx),
        sequence: this.sequence++,
        settle: (ticket) => {
          if (done) return;
          done = true;
          waiter.dispose();
          resolve(ticket);
        },
        fail: (error) => {
          if (done) return;
          done = true;
          waiter.dispose();
          reject(error);
        },
        dispose: () => {
          if (timer) clearTimeout(timer);
          if (onAbort) signal?.removeEventListener?.("abort", onAbort);
        }
      };

      if (this.queueTimeout > 0) {
        timer = setTimeout(() => {
          remove(this.waiters, waiter);
          waiter.fail(
            new SnailPoolError(
              t("error.pool.queueTimeout", this.queueTimeout),
              POOL_ERROR_CODES.queueTimeout
            )
          );
        }, this.queueTimeout);
        // A pending queue timer must not hold a Node process open.
        (timer as unknown as { unref?: () => void }).unref?.();
      }

      if (signal && typeof signal.addEventListener === "function") {
        onAbort = () => {
          remove(this.waiters, waiter);
          waiter.fail(this.abortError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }

      this.waiters.push(waiter);
      this.sort();
    });
  }

  /**
   * Drop every waiter, rejecting each with `reason`.
   *
   * Used on uninstall: a queued request must not sit forever waiting for a pool
   * that will never admit it.
   */
  clear(reason?: unknown): void {
    const pending = this.waiters.splice(0, this.waiters.length);
    for (const waiter of pending) {
      waiter.fail(
        reason ??
          new SnailPoolError(t("error.pool.cleared"), POOL_ERROR_CODES.cleared)
      );
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Hand out one slot. */
  private issue(): PoolTicket {
    this.active += 1;
    let released = false;

    return {
      release: () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        this.pump();
      }
    };
  }

  /** Admit as many waiters as there are free slots. */
  private pump(): void {
    while (this.active < this.concurrency && this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.settle(this.issue());
    }
  }

  /** Lowest priority number first, then arrival order. */
  private sort(): void {
    this.waiters.sort((a, b) =>
      a.priority === b.priority ? a.sequence - b.sequence : a.priority - b.priority
    );
  }

  private priorityOfFor(ctx: unknown): number {
    if (!this.priorityOf) return 0;
    try {
      const value = this.priorityOf(ctx);
      return Number.isFinite(value) ? value : 0;
    } catch {
      // A throwing priority function is a caller bug, but it must not take down the
      // queue: fall back to the default rather than leaving the request unstoppable.
      return 0;
    }
  }

  private abortError(): unknown {
    return new SnailPoolError(t("error.pool.aborted"), POOL_ERROR_CODES.aborted);
  }
}

/** Remove one waiter by identity, wherever it sits in the queue. */
function remove(waiters: Waiter[], waiter: Waiter): void {
  const index = waiters.indexOf(waiter);
  if (index !== -1) waiters.splice(index, 1);
}
