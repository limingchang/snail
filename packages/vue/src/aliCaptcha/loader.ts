/**
 * 两种验证码产品的脚本加载。
 *
 * ## 契约
 *
 * 每个 URL 的 `<script>` 元素在**每个页面**上最多只能求值一次。阿里云验证码 2.0 的
 * 文档对此说得很明确（「请勿重复引入，重复引入可能导致验证失败」），并且建议动态加载
 * 而不是自行托管，因为该 bundle 会出于安全考虑在服务端更新。
 *
 * 旧包则完全没有契约：`AliCaptcha.vue` 每次挂载都调用 `initCaptcha(window)`（每次都
 * 重新定义 `window.initAlicom4`），而注入的脚本、它的 10 秒超时和它的监听器从未被
 * 清理。
 *
 * ## 拆分
 *
 * `ScriptPool` 是带引用计数、每个 key 只加载一次的状态机，它完全不了解 DOM —— 它把
 * 「是否可用」和「开始加载」委托给 {@link ScriptLoaderEnvironment}。正因如此，最有趣
 * 的部分（每个 key 只加载一次、共享 promise、失败后可重试、释放）才能用一个假环境在
 * 普通 Node 进程里做单元测试，而 DOM 相关的细节则留在
 * {@link createDomScriptEnvironment} 里。
 *
 * Script loading for both captcha products.
 *
 * ## The contract
 *
 * A `<script>` element must be evaluated **at most once per page**, per URL. Alibaba's
 * Captcha 2.0 documentation is explicit about it ("请勿重复引入，重复引入可能导致验证
 * 失败" — do not include it twice, doing so can make verification fail), and their
 * guidance is to load it dynamically rather than self-host it, because the bundle is
 * updated server-side for security.
 *
 * The legacy package had no contract at all: `AliCaptcha.vue` called `initCaptcha(window)`
 * on every mount (redefining `window.initAlicom4` each time) and the injected script,
 * its 10-second timeout and its listeners were never cleaned up.
 *
 * ## The split
 *
 * `ScriptPool` is the refcounted, load-once state machine and knows nothing about the
 * DOM — it delegates "is it usable?" and "start loading it" to a
 * {@link ScriptLoaderEnvironment}. That is what makes the interesting part (one load
 * per key, shared promise, retry after failure, release) unit-testable in a plain Node
 * process with a fake environment, while the DOM specifics live in
 * {@link createDomScriptEnvironment}.
 */

import { AliCaptchaError } from "./error";

/**
 * 阿里云 CDN 上的 Captcha 2.0 V3 bundle。不要自行托管。
 *
 * The Captcha 2.0 V3 bundle on Alibaba's CDN. Not to be self-hosted.
 */
export const CAPTCHA2_SCRIPT_URL =
  "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";

/** 脚本超过这个时长就放弃加载。 / Give up on a script after this long. */
export const DEFAULT_SCRIPT_TIMEOUT_MS = 10_000;

/**
 * 池所需的 DOM 操作，作为可替换的接缝。
 *
 * `start` 在脚本**可用**（其全局变量已存在）时兑现，而不只是在标签触发 `load` 时：
 * Captcha 2.0 bundle 会在自身顶层代码执行完之后才定义 `window.initAliyunCaptcha`，
 * 把「标签已加载」当成「SDK 就绪」，正是验证码最终调用一个未定义函数的原因。
 *
 * The DOM work the pool needs, as a replaceable seam.
 *
 * `start` resolves when the script is *usable* (its global exists), not merely when
 * the tag fired `load`: the Captcha 2.0 bundle finishes defining
 * `window.initAliyunCaptcha` after its own top-level code runs, and treating
 * "tag loaded" as "SDK ready" is how a captcha ends up calling an undefined function.
 */
export interface ScriptLoaderEnvironment {
  /**
   * 该 key 的脚本在当前文档里是否已经可用。
   *
   * Whether the key's script is already usable in this document.
   */
  isReady: (key: string) => boolean;
  /**
   * 开始加载该 key。失败时必须以 {@link AliCaptchaError} 拒绝。
   *
   * Begin loading the key. Must reject with an {@link AliCaptchaError} on failure.
   */
  start: (key: string) => Promise<void>;
}

interface PoolRecord {
  /** Number of live leases. */
  refs: number;
  /** `pending` records are kept even at zero refs so a second acquirer joins them. */
  state: "pending" | "ready";
  promise: Promise<void>;
}

/**
 * 每个 key 只加载一次、带引用计数的池。
 *
 * 对同一个 key，`acquire` 返回给每个调用者的都是**同一个** promise，所以一个页面上
 * 五个验证码仍然只注入一个标签、只等待一次加载。当记录已就绪且无人持有时，`release`
 * 会把它删除；之后的 `acquire` 会走 `isReady()` 短路，而不是再次加载。
 *
 * A load-once-per-key pool with reference counting.
 *
 * `acquire` returns the *same* promise to every caller for a key, so five captchas on
 * one page still inject one tag and wait on one load. `release` drops the record once
 * it is ready and nobody holds it; a later `acquire` then short-circuits through
 * `isReady()` instead of loading again.
 */
export class ScriptPool {
  private readonly records = new Map<string, PoolRecord>();

  /**
   * 用给定的环境接缝创建池；池本身不直接接触 DOM。
   *
   * Creates the pool around the given environment seam; the pool touches no DOM itself.
   */
  constructor(private readonly environment: ScriptLoaderEnvironment) {}

  /**
   * 池当前跟踪的 key 数量。已就绪的 key 在最后一次 release 之后归零。
   *
   * Keys currently tracked by the pool. Zero after the last release of a ready key.
   */
  get size(): number {
    return this.records.size;
  }

  /**
   * 借用该 key 的脚本；如果还没有人加载，就由本次调用发起加载。
   *
   * Borrow the key's script, starting the load if nobody has yet.
   *
   * @param key 脚本的池键，通常是脚本 URL / The pool key, normally the script URL.
   * @returns 脚本可用时兑现的 promise / Resolves when the script is usable.
   */
  acquire(key: string): Promise<void> {
    const existing = this.records.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.promise;
    }

    if (this.environment.isReady(key)) {
      const ready: PoolRecord = { refs: 1, state: "ready", promise: Promise.resolve() };
      this.records.set(key, ready);
      return ready.promise;
    }

    const record: PoolRecord = { refs: 1, state: "pending", promise: Promise.resolve() };
    record.promise = this.environment.start(key).then(
      () => {
        record.state = "ready";
      },
      (error: unknown) => {
        // Never poison the key: a failed load must be retryable, which means dropping
        // the record so the next `acquire` calls `start` again.
        this.records.delete(key);
        throw error;
      }
    );
    this.records.set(key, record);
    return record.promise;
  }

  /**
   * 归还该 key 的脚本。对同一份租约重复调用是安全的。
   *
   * Give the key's script back. Safe to call more than once per lease.
   *
   * @param key 脚本的池键，通常是脚本 URL / The pool key, normally the script URL.
   */
  release(key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    record.refs = Math.max(record.refs - 1, 0);
    if (record.refs === 0 && record.state === "ready") this.records.delete(key);
  }
}

/**
 * 一份借来的脚本；`release` 把它还回池中。
 *
 * A borrowed script; `release` returns it to the pool.
 */
export interface ScriptLease {
  /** 脚本可用时兑现。 / Resolves when the script is usable. */
  promise: Promise<void>;
  /** 幂等的释放。 / Idempotent release. */
  release: () => void;
}

/** 一次 acquire 请求。 / One acquire request. */
export interface ScriptRequest {
  /**
   * 脚本的绝对或相对 URL。它同时充当池键。
   *
   * Absolute or relative URL of the script. Doubles as the pool key.
   */
  src: string;
  /**
   * SDK 全局变量是否存在。
   *
   * 该检查与 URL 绑定，所以请求同一个 URL 的两个调用者必须对「它定义了哪个全局变量」
   * 保持一致（事实上确实一致：一个 URL 对应一个产品）。
   *
   * Whether the SDK global exists.
   *
   * The check is associated with the URL, so two callers asking for the same URL must
   * agree about which global it defines (they do: one URL, one product).
   */
  isReady: () => boolean;
  /** 覆盖默认超时。 / Override the default timeout. */
  timeoutMs?: number;
}

/** Requests by URL, so the pool's key-based environment can reach the right check. */
const pageRequests = new Map<string, ScriptRequest>();

/**
 * The environment every component shares.
 *
 * Built once, at module scope, but it touches nothing: `isReady`/`start` only run when
 * something actually calls `acquire`, which is why importing this module in Node (or
 * during server rendering) is harmless.
 */
function createDomScriptEnvironment(): ScriptLoaderEnvironment {
  return {
    isReady: (key) => pageRequests.get(key)?.isReady() ?? false,
    start: (key) => {
      const request = pageRequests.get(key);
      if (!request) {
        return Promise.reject(
          new AliCaptchaError("script-load-failed", `no script request registered for ${key}`)
        );
      }
      return injectScript(request);
    }
  };
}

const pagePool = new ScriptPool(createDomScriptEnvironment());

/**
 * 为整个页面借用其中一个验证码脚本。
 *
 * 在浏览器之外返回一个已拒绝的 promise 而不是抛出异常，这样在服务端渲染期间初始化的
 * 组件可以上报 `error` 事件，而不是让渲染崩溃。
 *
 * Borrow one of the captcha scripts for the whole page.
 *
 * Returns a rejected promise outside a browser rather than throwing, so a component
 * that initialises during server rendering can report an `error` event instead of
 * crashing the render.
 *
 * @param request 要借用的脚本请求 / The script request to borrow.
 * @returns 一份带幂等 `release` 的租约 / A lease with an idempotent `release`.
 */
export function acquireScript(request: ScriptRequest): ScriptLease {
  if (typeof document === "undefined" || !document.head) {
    // Reject lazily: a promise that is already rejected when it is returned can trip
    // the unhandled-rejection hook before the caller's `await` attaches.
    const promise = Promise.resolve().then(() => {
      throw new AliCaptchaError(
        "unsupported-environment",
        "a captcha script cannot be loaded outside a browser document"
      );
    });
    return { promise, release: () => undefined };
  }

  pageRequests.set(request.src, request);
  let released = false;
  return {
    promise: pagePool.acquire(request.src),
    release: () => {
      if (released) return;
      released = true;
      pagePool.release(request.src);
    }
  };
}

/** Find a script tag for `src` that is already in the document. */
function findScriptTag(src: string): HTMLScriptElement | undefined {
  const tags = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  const wanted = absoluteUrl(src);
  return tags.find((tag) => absoluteUrl(tag.src) === wanted);
}

/** Resolve a URL against the document base, tolerating a relative or invalid value. */
function absoluteUrl(value: string): string {
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return value;
  }
}

/**
 * Inject (or join) the script tag and wait until its global exists.
 *
 * - A tag that is already in the document is **joined**, never duplicated, even if it
 *   was added by hand in the host page's HTML.
 * - `load` is not trusted as "usable": the global is re-checked, and a tag that loads
 *   without defining it is a failure, not a success.
 * - A **failed** tag is removed, so a retry can inject a fresh one. A successful one
 *   stays for the life of the page — one tag per URL, which is exactly what Alibaba
 *   requires, and not the per-mount leak the legacy component produced.
 * - The timeout is cleared on every settle path, so it cannot fire after unmount.
 */
function injectScript(request: ScriptRequest): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeoutMs = request.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
    const existing = findScriptTag(request.src);
    const script = existing ?? document.createElement("script");
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (error?: AliCaptchaError): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (error) {
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        if (!existing) script.remove();
        reject(error);
        return;
      }
      resolve();
    };

    const onLoad = (): void => {
      if (request.isReady()) settle();
      else {
        settle(
          new AliCaptchaError(
            "script-load-failed",
            `${request.src} loaded but did not define the expected global`
          )
        );
      }
    };

    const onError = (): void => {
      settle(
        new AliCaptchaError(
          "script-load-failed",
          `the captcha script could not be loaded from ${request.src} — check the network, the URL, and any CSP that restricts script-src`
        )
      );
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);

    // A tag that already executed will never fire `load` again, so re-check on the
    // next microtask instead of waiting for the timeout.
    queueMicrotask(() => {
      if (request.isReady()) settle();
    });

    timer = setTimeout(() => {
      settle(
        new AliCaptchaError(
          "script-timeout",
          `the captcha script at ${request.src} did not become usable within ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    if (!existing) {
      script.type = "text/javascript";
      script.async = true;
      script.src = request.src;
      document.head.appendChild(script);
    }
  });
}
