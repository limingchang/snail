/**
 * The captcha script pool.
 *
 * `src/aliCaptcha/loader.ts` keeps its DOM work behind a `ScriptLoaderEnvironment`, so
 * the load-once contract can be exercised here in Node with a fake environment. That
 * contract is not a nicety: Alibaba's Captcha 2.0 documentation forbids including
 * `AliyunCaptcha.js` twice ("请勿重复引入") or re-initialising the same scene, and the
 * legacy component injected the script again on every mount while leaking the tag, the
 * 10-second timeout and its listeners.
 *
 * Importing this module at all is part of the test: nothing here may touch `window`,
 * `document` or `navigator` at import time, which is what makes the component
 * server-renderable.
 */

import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { AliCaptchaError } from "../../src/aliCaptcha/error";
import { ScriptPool } from "../../src/aliCaptcha/loader";
import type { ScriptLoaderEnvironment } from "../../src/aliCaptcha/loader";

/** A tiny deferred, so a test can decide when a load settles. */
function deferred() {
  let resolve!: (value?: void | PromiseLike<void>) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface FakeEnvironment extends ScriptLoaderEnvironment {
  // Spelled out rather than left to `ReturnType<typeof vi.fn>`: without the explicit
  // signature the mock widens to `Mock<Procedure | Constructable>`, which is not
  // callable as `isReady(key)`.
  start: Mock<(key: string) => Promise<void>>;
  isReady: Mock<(key: string) => boolean>;
}

function createEnvironment(alreadyReady = false): FakeEnvironment {
  // Readiness is per key here, because the pool asks `isReady(key)`: a fake that went
  // ready globally would make every later key look already-loaded and hide the very
  // behaviour ("one load per key") these tests exist to pin down.
  const ready = new Set<string>();
  const environment: FakeEnvironment = {
    isReady: vi.fn<(key: string) => boolean>((key) => alreadyReady || ready.has(key)),
    start: vi.fn<(key: string) => Promise<void>>((key) => {
      ready.add(key);
      return Promise.resolve();
    })
  };
  return environment;
}

describe("ScriptPool", () => {
  it("starts one load per key, whoever asks", async () => {
    const environment = createEnvironment();
    const pool = new ScriptPool(environment);

    const first = pool.acquire("https://cdn.example/captcha.js");
    const second = pool.acquire("https://cdn.example/captcha.js");
    await Promise.all([first, second]);

    expect(environment.start).toHaveBeenCalledTimes(1);
    expect(pool.size).toBe(1);
  });

  it("keeps independent keys independent", async () => {
    const environment = createEnvironment();
    const pool = new ScriptPool(environment);

    await Promise.all([pool.acquire("a.js"), pool.acquire("b.js"), pool.acquire("a.js")]);

    expect(environment.start).toHaveBeenCalledTimes(2);
    expect(pool.size).toBe(2);
  });

  it("joins a load that is still in flight instead of starting another", async () => {
    const gate = deferred();
    const start = vi.fn(() => gate.promise);
    const pool = new ScriptPool({ isReady: () => false, start });

    const first = pool.acquire("captcha.js");
    const second = pool.acquire("captcha.js");
    gate.resolve();
    await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("short-circuits when the script is already on the page", async () => {
    const environment = createEnvironment(true);
    const pool = new ScriptPool(environment);

    await pool.acquire("captcha.js");

    expect(environment.start).not.toHaveBeenCalled();
    expect(pool.size).toBe(1);
  });

  it("releases a ready key once nobody holds it, and then does not reload it", async () => {
    const environment = createEnvironment();
    const pool = new ScriptPool(environment);

    await pool.acquire("captcha.js");
    pool.release("captcha.js");
    expect(pool.size).toBe(0);

    await pool.acquire("captcha.js");

    // The script is ready now, so the second acquire resolves without a second tag.
    expect(environment.start).toHaveBeenCalledTimes(1);
  });

  it("keeps an in-flight key at zero refs so the next acquirer joins it", async () => {
    const gate = deferred();
    const start = vi.fn(() => gate.promise);
    const pool = new ScriptPool({ isReady: () => false, start });

    const first = pool.acquire("captcha.js");
    pool.release("captcha.js");
    expect(pool.size).toBe(1);

    const second = pool.acquire("captcha.js");
    gate.resolve();
    await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("tolerates a release with no matching acquire", () => {
    const pool = new ScriptPool(createEnvironment());
    expect(() => pool.release("nothing.js")).not.toThrow();
  });

  it("never poisons a key: a failed load can be retried", async () => {
    const failure = new AliCaptchaError("script-load-failed", "network");
    const start = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const pool = new ScriptPool({ isReady: () => false, start });

    await expect(pool.acquire("captcha.js")).rejects.toBe(failure);
    expect(pool.size).toBe(0);

    await expect(pool.acquire("captcha.js")).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("rejects every holder of a failed load", async () => {
    const gate = deferred();
    const start = vi.fn(() => gate.promise);
    const pool = new ScriptPool({ isReady: () => false, start });

    const first = pool.acquire("captcha.js");
    const second = pool.acquire("captcha.js");
    gate.reject(new AliCaptchaError("script-timeout", "10s"));

    await expect(first).rejects.toBeInstanceOf(AliCaptchaError);
    await expect(second).rejects.toBeInstanceOf(AliCaptchaError);
  });
});

describe("AliCaptchaError", () => {
  it("carries a code, a name and a cause", () => {
    const cause = new Error("underlying");
    const error = new AliCaptchaError("script-load-failed", "could not load", { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AliCaptchaError");
    expect(error.code).toBe("script-load-failed");
    expect(error.message).toBe("could not load");
    expect(error.cause).toBe(cause);
  });
});
