/**
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

/** The Captcha 2.0 V3 bundle on Alibaba's CDN. Not to be self-hosted. */
export const CAPTCHA2_SCRIPT_URL =
  "https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js";

/** Give up on a script after this long. */
export const DEFAULT_SCRIPT_TIMEOUT_MS = 10_000;

/**
 * The DOM work the pool needs, as a replaceable seam.
 *
 * `start` resolves when the script is *usable* (its global exists), not merely when
 * the tag fired `load`: the Captcha 2.0 bundle finishes defining
 * `window.initAliyunCaptcha` after its own top-level code runs, and treating
 * "tag loaded" as "SDK ready" is how a captcha ends up calling an undefined function.
 */
export interface ScriptLoaderEnvironment {
  /** Whether the key's script is already usable in this document. */
  isReady: (key: string) => boolean;
  /** Begin loading the key. Must reject with an {@link AliCaptchaError} on failure. */
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
 * A load-once-per-key pool with reference counting.
 *
 * `acquire` returns the *same* promise to every caller for a key, so five captchas on
 * one page still inject one tag and wait on one load. `release` drops the record once
 * it is ready and nobody holds it; a later `acquire` then short-circuits through
 * `isReady()` instead of loading again.
 */
export class ScriptPool {
  private readonly records = new Map<string, PoolRecord>();

  constructor(private readonly environment: ScriptLoaderEnvironment) {}

  /** Keys currently tracked by the pool. Zero after the last release of a ready key. */
  get size(): number {
    return this.records.size;
  }

  /** Borrow the key's script, starting the load if nobody has yet. */
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

  /** Give the key's script back. Safe to call more than once per lease. */
  release(key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    record.refs = Math.max(record.refs - 1, 0);
    if (record.refs === 0 && record.state === "ready") this.records.delete(key);
  }
}

/** A borrowed script; `release` returns it to the pool. */
export interface ScriptLease {
  /** Resolves when the script is usable. */
  promise: Promise<void>;
  /** Idempotent release. */
  release: () => void;
}

/** One acquire request. */
export interface ScriptRequest {
  /** Absolute or relative URL of the script. Doubles as the pool key. */
  src: string;
  /**
   * Whether the SDK global exists.
   *
   * The check is associated with the URL, so two callers asking for the same URL must
   * agree about which global it defines (they do: one URL, one product).
   */
  isReady: () => boolean;
  /** Override the default timeout. */
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
 * Borrow one of the captcha scripts for the whole page.
 *
 * Returns a rejected promise outside a browser rather than throwing, so a component
 * that initialises during server rendering can report an `error` event instead of
 * crashing the render.
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
