import { t } from "../../locale";
import { POOL_ERROR_CODES, SnailPoolError } from "./type";

/**
 * 调度器用到的 `AbortSignal` 子集。
 *
 * 采用结构化类型，而不是直接声明为 `AbortSignal`，因为 axios 交给插件的是它自己的
 * `GenericAbortSignal`，并不满足 DOM 接口——它缺少 `reason`/`throwIfAborted`，甚至把
 * 监听方法声明为可选。实际上该对象就是真正的 `AbortSignal`，所以监听路径总是可用；
 * 可选方法仍被兼容处理，而一个无法监听的 signal 只意味着已排队的请求不会提前撤销——
 * 它仍会拿到槽位，然后被传输层拒绝。
 *
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
  /**
   * 信号是否已经被中止。
   *
   * Whether the signal has already been aborted.
   */
  readonly aborted: boolean;
  /**
   * 注册中止监听；实现不提供该方法时，排队的请求不会被提前撤销。
   *
   * Register an abort listener; when an implementation omits it, a queued request is
   * simply not withdrawn early.
   */
  addEventListener?(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  /**
   * 注销中止监听，用于清理队列自身的记账信息。
   *
   * Remove the abort listener, so the queue can drop its own bookkeeping.
   */
  removeEventListener?(type: "abort", listener: () => void): void;
}

/**
 * 请求池插件接受的选项。
 *
 * ## 为什么需要请求池
 *
 * 浏览器本来就会排队：HTTP/1.1 每个源大约允许六条连接，超出的部分都在网络栈里等待。
 * 但那个内置队列是先入先出、不可见且无优先级的——一次性发出五十个请求的应用既无法声明
 * 用户正在看的那个应该先走，也无法观察还有多少在等待，更无法避免一次爆发把页面其余部分
 * 饿死。
 *
 * HTTP/2 同样不能免除这个需求：多路复用把六连接上限换成了**流**上限（常见为 100），
 * 而服务端容量依旧有限。五百个请求的爆发走 HTTP/2 一样能把它打满。
 *
 * 请求池提供浏览器给不了的三样东西：两种协议下都成立的硬上限、一个优先级顺序，以及一个
 * 会快速失败而不是无声堆积的有界队列。
 *
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
   * 同时进行中的最大请求数。默认 `6`。
   *
   * 六是经典的 HTTP/1.1 单源连接上限，因此这是既不会在老服务端上让情况变糟、又能约束
   * HTTP/2 爆发的最大值。只有在确认后端扛得住时才值得调高。
   *
   * Maximum requests in flight at once. Defaults to `6`.
   *
   * Six is the classic HTTP/1.1 per-origin connection cap, so it is the largest
   * value that cannot make things worse on an old server while still bounding an
   * HTTP/2 burst. Raising it helps only when the backend is known to cope.
   */
  concurrency?: number;

  /**
   * 允许**等待**的最大请求数。默认 `Infinity`。
   *
   * 设一个有限值即可快速失败：队列满后，多出的请求立即被拒绝，而不是加入一条用户永远
   * 看不到结果的无限积压。
   *
   * Maximum requests allowed to *wait*. Defaults to `Infinity`.
   *
   * Set a finite value to fail fast: once the queue is full, an extra request
   * rejects immediately rather than joining an unbounded backlog the user will
   * never see resolved.
   */
  maxQueue?: number;

  /**
   * 排队请求最多可以等待多久，单位毫秒。默认 `0`，表示不限制。
   *
   * 一个用户已经不再等待的请求比一个失败的请求更糟——它终究会占用一个槽位，还可能覆盖
   * 更新的数据。
   *
   * How long a queued request may wait, in milliseconds. Defaults to `0`, meaning
   * no limit.
   *
   * A request the user has stopped waiting for is worse than a failed one — it
   * still consumes a slot eventually and may overwrite fresher data.
   */
  queueTimeout?: number;

  /**
   * 排队请求的排序权重。**数值越小越先执行**；相同权重保持到达顺序，而找到空闲槽位的
   * 请求根本不会入队。
   *
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

/**
 * {@link RequestPoolScheduler} 的实时计数。
 *
 * Live counters for a {@link RequestPoolScheduler}.
 */
export interface RequestPoolStats {
  /**
   * 当前持有槽位的请求数。
   *
   * Requests currently holding a slot.
   */
  active: number;
  /**
   * 正在等待槽位的请求数。
   *
   * Requests waiting for a slot.
   */
  queued: number;
  /**
   * 配置的并发上限。
   *
   * Configured ceiling.
   */
  concurrency: number;
}

/**
 * 一张票据：一个 resolve/reject 组合，外加队列丢弃它所需的记账信息。
 *
 * A resolve/reject pair plus the bookkeeping the queue needs to drop it.
 */
export interface PoolTicket {
  /**
   * 归还槽位。幂等。
   *
   * Give the slot back. Idempotent.
   */
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
 * 请求池的调度内核。
 *
 * 它是确定性的，并且完全不含请求或插件的概念：只发放 `release` 回调，并不知道这些回调
 * 在保护什么。因此最难的部分——排序、公平性，以及「槽位一定会归还」的保证——可以脱离
 * 服务端与网络单独测试。
 *
 * ## 提示文案来自插件
 *
 * 拒绝时的提示由 `RequestPool` 的 `setup` 提供，遵循插件自有文案的约定。因此**单独**
 * 使用这个类得到的是原始文案键而不是译文——每个 {@link SnailPoolError} 上的 `code`
 * 始终正确，调用方应以它为准；想要译文时自行注册一份文案表即可。
 *
 * ## 真正重要的不变量
 *
 * `active` 绝不能与未归还的票据数量发生偏离。每条失败路径（队列已满、等待超时、请求被
 * 中止、`clear` 丢弃排队者）要么从不递增 `active`，要么已经计过数；而 `release()` 是
 * 幂等的，所以 `finally` 与中止监听导致的重复释放不会泄漏槽位。槽位泄漏在请求池于上限处
 * 永久死锁之前都不可见，届时后续每个请求都会挂起——这正是把这条保证放在这里而不是调用方
 * 的原因。
 *
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

  /**
   * 创建调度器，并把选项规整为运行期使用的默认值。
   *
   * Create the scheduler, normalising the options once.
   *
   * @param options 请求池选项 / Request pool options.
   */
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

  /**
   * 当前计数。
   *
   * Current counters.
   */
  get stats(): RequestPoolStats {
    return { active: this.active, queued: this.waiters.length, concurrency: this.concurrency };
  }

  /**
   * 在运行时修改并发上限；调大会立即放行排队中的工作。
   *
   * Change the ceiling at runtime; raising it immediately admits queued work.
   *
   * @param value 新的上限；非有限值会被忽略 / The new ceiling; a non-finite value is ignored.
   */
  setConcurrency(value: number): void {
    if (!Number.isFinite(value)) return;
    this.concurrency = Math.max(1, Math.floor(value));
    this.pump();
  }

  /**
   * 取得一个槽位，或等待一个槽位。
   *
   * resolve 出的票据，其 `release()` 会归还槽位。队列已满或等待超过 `queueTimeout` 时
   * reject。`signal` 让被放弃的请求离开队列，而不是继续占着一个它永远不会用到的位置。
   *
   * Take a slot, or wait for one.
   *
   * Resolves with a ticket whose `release()` returns the slot. Rejects when the
   * queue is full or the wait exceeds `queueTimeout`. `signal` lets an abandoned
   * request leave the queue instead of holding a place it will never use.
   *
   * @param ctx 传给 `priority` 回调的上下文 / The context handed to the `priority` callback.
   * @param signal 请求的取消信号 / The request's cancellation signal.
   * @returns 持有槽位的票据 / A ticket that holds the slot.
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
   * 丢弃全部排队者，并以 `reason` 逐个拒绝。
   *
   * 用于卸载时：排队的请求不能永远等着一个再也不会放行它的请求池。
   *
   * Drop every waiter, rejecting each with `reason`.
   *
   * Used on uninstall: a queued request must not sit forever waiting for a pool
   * that will never admit it.
   *
   * @param reason 拒绝原因；省略时使用「请求池已清空」错误 / The rejection reason; defaults
   *   to the cleared-pool error.
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
