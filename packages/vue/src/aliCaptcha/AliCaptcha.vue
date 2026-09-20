<template>
  <div class="s-ali-captcha">
    <!--
      A real mount target, with a real id. The legacy component rendered
      `<div class="captcha"></div>` with no ref at all, so `initAliyunCaptcha` had
      nowhere to render into even if the product had been supported.
    -->
    <div v-if="showMount" :id="mountId" ref="mountRef" class="s-ali-captcha__mount"></div>

    <!--
      Captcha 2.0 requires a `button` in every mode — Alibaba's FAQ is explicit that it
      may not be omitted even when `instance.show()` is used instead. In `embed` mode
      ours is hidden; a hidden element still receives the SDK's programmatic click.
    -->
    <button
      v-if="showTrigger"
      :id="triggerId"
      ref="triggerRef"
      class="s-ali-captcha__trigger"
      :class="{ 'is-hidden': triggerHidden }"
      type="button"
      :disabled="disabled"
    >
      <slot name="trigger">{{ triggerLabel }}</slot>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { AliCaptchaError } from "./error";
import type { CaptchaErrorCode } from "./error";
import { CAPTCHA2_SCRIPT_URL, acquireScript } from "./loader";
import type { ScriptLease } from "./loader";
import type {
  AliCaptcha2Mode,
  AliCaptchaCaptcha2Props,
  AliCaptchaEmits,
  AliCaptchaExposed,
  AliCaptchaInstance,
  AliCaptchaPnvsProps,
  AliCaptchaProps,
  AliCaptchaRegion,
  Captcha2Handle,
  CaptchaHandle,
  CaptchaObj
} from "./type";

/**
 * `AliCaptcha` — Aliyun captcha, for **both** products behind one `product` prop.
 *
 * | | `product: "pnvs"` | `product: "captcha2"` |
 * | --- | --- | --- |
 * | Product | 号码认证服务 图形验证码 | 验证码 2.0 (V3 架构) |
 * | Loader | `ct4.js`, hosted by the caller | `AliyunCaptcha.js` from Alibaba's CDN |
 * | Config global | — | `window.AliyunCaptchaConfig = { region, prefix }`, set **before** the tag |
 * | Entry point | `window.initAlicom4(config, handler)` | `window.initAliyunCaptcha(config)` |
 * | Success | `onSuccess` + `getValidate()` | `success(captchaVerifyParam)` |
 * | Methods | `showCaptcha`/`reset`/`destroy` | `show`/`hide`/`refresh`/`destroyCaptcha` |
 *
 * ## What the legacy component did
 *
 * It targeted PNVS only, bundled a frozen 14.9 KB third-party `ct4.js` in the npm
 * tarball (no attribution, no update path), redefined `window.initAlicom4` on every
 * mount, never removed the injected script, its 10-second timeout or its listeners,
 * never gave the SDK a mount target, and reported network failures with an unhandled
 * `throw new Error("网络错误")` inside an async callback.
 *
 * ## Notes
 *
 * - **SSR-safe.** Nothing here touches `window`/`document` at import time, and setup is
 *   a no-op until mount: both captcha bundles dereference `navigator` as they
 *   evaluate, so they are only ever loaded from `onMounted`.
 * - **Props are read once, at mount.** Alibaba forbids re-initialising the same scene,
 *   so a changed `sceneId`/`captchaId` does not re-init; remount with a `:key` when the
 *   scene genuinely changes.
 * - **Mount/unmount repeatedly is safe**: unmount hides and destroys the instance as
 *   far as the product supports it and releases the shared script lease.
 */
defineOptions({ name: "AliCaptcha" });

const props = defineProps<AliCaptchaProps>();

/**
 * The narrowed view of the props.
 *
 * `defineProps`' return type is a mapped type over the *union*'s keys, which is not a
 * shape worth depending on for product-specific members (`captchaId`, `sceneId`, …).
 * The declared type — and therefore the type a consumer is checked against — stays
 * `AliCaptchaProps`, the discriminated union; this is the one place the two are
 * bridged.
 */
const view = props as unknown as AliCaptchaPnvsProps | AliCaptchaCaptcha2Props;

const emit = defineEmits<AliCaptchaEmits>();

const uid = useId();
const mountId = `${uid}-captcha`;
const triggerId = `${uid}-captcha-trigger`;

const mountRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);

/** The props of whichever product is selected, with defaults resolved. */
type ActiveConfig =
  | { product: "pnvs"; captchaId: string; scriptSrc: string | undefined; handle: CaptchaHandle | undefined }
  | {
      product: "captcha2";
      sceneId: string;
      prefix: string;
      region: AliCaptchaRegion;
      mode: AliCaptcha2Mode;
      element: string | HTMLElement | undefined;
      button: string | HTMLElement | undefined;
      scriptSrc: string;
      triggerLabel: string;
      handle: Captcha2Handle | undefined;
    };

const config = computed<ActiveConfig>(() => {
  if (view.product === "captcha2") {
    return {
      product: "captcha2",
      sceneId: view.sceneId,
      prefix: view.prefix,
      region: view.region ?? "cn",
      mode: view.mode ?? "popup",
      element: view.element,
      button: view.button,
      // The CDN URL is the documented, non-self-hostable location; `scriptSrc` only
      // exists for a proxy.
      scriptSrc: view.scriptSrc ?? CAPTCHA2_SCRIPT_URL,
      triggerLabel: view.triggerLabel ?? "点击验证",
      handle: view.handle
    };
  }
  return {
    product: "pnvs",
    captchaId: view.captchaId,
    scriptSrc: view.scriptSrc,
    handle: view.handle
  };
});

const showMount = computed(() => {
  const value = config.value;
  return value.product === "captcha2" && value.element === undefined;
});

const showTrigger = computed(() => {
  const value = config.value;
  return value.product === "captcha2" && value.button === undefined;
});

const triggerHidden = computed(() => {
  const value = config.value;
  return value.product === "captcha2" && value.mode === "embed";
});

const triggerLabel = computed(() => {
  const value = config.value;
  return value.product === "captcha2" ? value.triggerLabel : "";
});

/**
 * The live SDK instance.
 *
 * Deliberately not a `ref`: it is never rendered and never read from a template, so
 * making it reactive would only add tracking to a value that never changes shape.
 */
let instance: AliCaptchaInstance | null = null;
let lease: ScriptLease | null = null;
let destroyed = false;

/**
 * Call the first method that exists on the instance.
 *
 * Both products are third-party bundles with overlapping-but-different method names,
 * and the PNVS loader is a Geetest-derived fork the consumer hosts, so the exact build
 * is not knowable at compile time. Feature detection is the only correct contract —
 * and it is why the method lists below read as alternatives.
 *
 * @returns whether anything was called.
 */
function callMethod(target: object | null, names: readonly string[]): boolean {
  if (!target) return false;
  const record = target as unknown as Record<string, unknown>;
  for (const name of names) {
    const method = record[name];
    if (typeof method === "function") {
      (method as (this: object) => void).call(target);
      return true;
    }
  }
  return false;
}

/**
 * Resolve a target prop to the selector the SDK documents.
 *
 * An `HTMLElement` is given a generated id (only if it has none) and passed as
 * `#id` — the SDK reads `element`/`button` as selectors, and silently rendering into
 * nothing is the failure mode this avoids.
 */
function resolveTarget(
  target: string | HTMLElement | undefined,
  fallback: HTMLElement | null,
  suffix: string
): string | undefined {
  if (typeof target === "string") return target;
  if (target instanceof HTMLElement) {
    if (!target.id) target.id = `${uid}-${suffix}`;
    return `#${target.id}`;
  }
  if (fallback) return `#${fallback.id}`;
  return undefined;
}

/** Turn anything the SDK throws or reports into an {@link AliCaptchaError}. */
function toCaptchaError(error: unknown, code: CaptchaErrorCode, fallbackMessage: string): AliCaptchaError {
  if (error instanceof AliCaptchaError) return error;
  if (error instanceof Error) return new AliCaptchaError(code, error.message, { cause: error });
  if (error === undefined || error === null) return new AliCaptchaError(code, fallbackMessage);
  return new AliCaptchaError(code, describe(error), { cause: error });
}

/** Readable text out of an arbitrary SDK error value. */
function describe(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  try {
    return JSON.stringify(error) ?? Object.prototype.toString.call(error);
  } catch {
    // Circular or otherwise unserialisable.
    return Object.prototype.toString.call(error);
  }
}

function report(error: unknown, code: CaptchaErrorCode, fallbackMessage: string): void {
  emit("error", toCaptchaError(error, code, fallbackMessage));
}

/** Wire the PNVS callbacks onto the legacy `CaptchaObj`. */
function bindPnvs(captchaObj: CaptchaObj): void {
  captchaObj.onSuccess?.(() => {
    try {
      emit("success", { product: "pnvs", result: captchaObj.getValidate() });
    } catch (error) {
      // `getValidate()` is the only way to read the result on PNVS, and it can throw
      // if the SDK's state was reset between the callback and this call.
      report(error, "init-failed", "the PNVS captcha succeeded but its result could not be read");
    }
  });
  captchaObj.onFail?.(() => emit("fail", { product: "pnvs" }));
  captchaObj.onError?.((error) =>
    report(error, "init-failed", "the PNVS captcha reported an internal error")
  );
  captchaObj.onClose?.(() => emit("close"));
  // `onReady` is not subscribed: `ready` is emitted as soon as the instance exists,
  // which is strictly earlier.
}

/**
 * Load the script and initialise the selected product.
 *
 * Every failure path ends in an `error` event; nothing is thrown into a callback the
 * caller cannot see.
 */
async function initialise(): Promise<void> {
  const value = config.value;

  try {
    if (value.product === "pnvs") {
      if (!value.captchaId) {
        throw new AliCaptchaError(
          "invalid-props",
          "product=\"pnvs\" requires `captchaId` (from the 号码认证服务 console)"
        );
      }
      if (!value.scriptSrc) {
        throw new AliCaptchaError(
          "missing-script-src",
          "product=\"pnvs\" requires `scriptSrc`: this package does not bundle ct4.js. " +
            "Host the loader yourself and pass its URL, e.g. " +
            "scriptSrc=\"/vendor/aliyun/ct4.js\". The legacy package shipped a frozen " +
            "third-party copy inside the npm tarball, which is why it is no longer included."
        );
      }

      lease = acquireScript({
        src: value.scriptSrc,
        isReady: () => typeof window.initAlicom4 === "function"
      });
      await lease.promise;
      if (destroyed) return;

      const init = window.initAlicom4;
      if (typeof init !== "function") {
        throw new AliCaptchaError(
          "script-load-failed",
          `${value.scriptSrc} did not define window.initAlicom4`
        );
      }
      init({ captchaId: value.captchaId, product: "bind" }, (captchaObj) => {
        if (destroyed) return;
        instance = captchaObj;
        bindPnvs(captchaObj);
        emit("ready", captchaObj);
        value.handle?.(captchaObj);
      });
      return;
    }

    if (!value.sceneId || !value.prefix) {
      throw new AliCaptchaError(
        "invalid-props",
        "product=\"captcha2\" requires both `sceneId` and `prefix` from the 验证码 2.0 console"
      );
    }

    // Must be set before the script is evaluated: the bundle reads it at module scope
    // to build its request hosts.
    window.AliyunCaptchaConfig = { region: value.region, prefix: value.prefix };

    lease = acquireScript({
      src: value.scriptSrc,
      isReady: () => typeof window.initAliyunCaptcha === "function"
    });
    await lease.promise;
    if (destroyed) return;

    const init = window.initAliyunCaptcha;
    if (typeof init !== "function") {
      throw new AliCaptchaError(
        "script-load-failed",
        `${value.scriptSrc} did not define window.initAliyunCaptcha`
      );
    }

    const element = resolveTarget(value.element, mountRef.value, "element");
    const button = resolveTarget(value.button, triggerRef.value, "button");
    if (!element || !button) {
      throw new AliCaptchaError(
        "init-failed",
        "Captcha 2.0 needs both an `element` (render target) and a `button` (trigger); " +
          "pass them explicitly, or render this component without overriding them"
      );
    }

    init({
      SceneId: value.sceneId,
      mode: value.mode,
      element,
      button,
      // V3 callbacks. V2's single `captchaVerifyCallback` does not exist here.
      success: (captchaVerifyParam) => emit("success", { product: "captcha2", captchaVerifyParam }),
      fail: (result) => emit("fail", { product: "captcha2", result }),
      getInstance: (captcha) => {
        if (destroyed) return;
        instance = captcha;
        emit("ready", captcha);
        value.handle?.(captcha);
      },
      onError: (error) =>
        report(error, "init-failed", "the Captcha 2.0 SDK reported an error"),
      onClose: () => emit("close")
    });
  } catch (error) {
    // Nothing to report if the component is already gone.
    if (destroyed) return;
    report(error, "init-failed", "the captcha could not be initialised");
  }
}

/**
 * Release the instance best effort.
 *
 * "Best effort" is not laziness: `destroyCaptcha` is documented for the V2 client
 * architecture and there is no documented `destroy` for V3, so both names are tried
 * and neither is required. The script lease is always released, which is the part the
 * legacy component got wrong — it leaked the injected tag, the timeout and the
 * listeners on every unmount.
 */
function release(): void {
  const current = instance;
  instance = null;
  if (current) {
    // Hide first: a popup must not survive the component that opened it.
    callMethod(current, ["hide", "hideCaptcha"]);
    callMethod(current, ["destroyCaptcha", "destroy"]);
  }
  lease?.release();
  lease = null;
}

function resolveInstance(): object | null {
  if (!instance) {
    emit(
      "error",
      new AliCaptchaError(
        "not-ready",
        "the captcha instance is not available yet — wait for the `ready` event before calling show()"
      )
    );
    return null;
  }
  return instance;
}

/**
 * Show the challenge (`showCaptcha()` on PNVS, `show()` on Captcha 2.0).
 *
 * Reports a `not-ready` error when the instance does not exist yet: unlike `hide`,
 * `show` promises a visible effect, and silently doing nothing is the failure mode the
 * legacy component specialised in.
 */
function show(): void {
  const target = resolveInstance();
  if (target) callMethod(target, ["showCaptcha", "show"]);
}

/**
 * Hide the challenge (`hideCaptcha()`/`hide()` on PNVS, `hide()` on Captcha 2.0).
 *
 * A no-op before the instance exists: hiding something that was never shown is not an
 * error worth reporting.
 */
function hide(): void {
  if (instance) callMethod(instance, ["hideCaptcha", "hide"]);
}

/** Re-arm the challenge (`reset()` on PNVS, `refresh()` on Captcha 2.0). */
function reset(): void {
  if (instance) callMethod(instance, ["reset", "refresh"]);
}

/** Refresh the challenge (`refresh()` on Captcha 2.0, `reset()` on PNVS). */
function refresh(): void {
  if (instance) callMethod(instance, ["refresh", "reset"]);
}

onMounted(() => {
  void initialise();
});

onBeforeUnmount(() => {
  destroyed = true;
  release();
});

defineExpose<AliCaptchaExposed>({
  show,
  hide,
  reset,
  refresh,
  get instance(): AliCaptchaInstance | null {
    return instance;
  }
});
</script>
