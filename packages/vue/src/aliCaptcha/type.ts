/**
 * Public types for `AliCaptcha`.
 *
 * The legacy `type.ts` covered exactly one product — 号码认证服务 (PNVS) 图形验证码,
 * whose loader (`ct4.js`) the package vendored — and typed its configuration as
 * `{ captchaId: string; product: "bind" }` with `desc: any` in its error callback.
 * The current mainstream product, 验证码 2.0 (Captcha 2.0) V3, is a different SDK with
 * different props, different callbacks and different instance methods.
 *
 * Both are supported, selected by an explicit `product` prop, and the props are a
 * **discriminated union**: `sceneId` does not exist on a PNVS captcha and `captchaId`
 * does not exist on a Captcha 2.0 one, so TypeScript rejects the mix rather than
 * letting the SDK fail at runtime.
 */

import type { AliCaptchaError } from "./error";

/** The two Aliyun products this component can drive. */
export type AliCaptchaProduct = "pnvs" | "captcha2";

/** Captcha 2.0 data-residency region. */
export type AliCaptchaRegion = "cn" | "sgp";

/** Captcha 2.0 rendering mode. */
export type AliCaptcha2Mode = "popup" | "embed";

/** PNVS: a plain callback. */
export type TCallBack = () => void;

/** PNVS: the error callback. `desc` is whatever the SDK attached. */
export type TErrorCallBack = (error?: { code: number; msg: string; desc: unknown }) => void;

/** PNVS: the second-step verification payload returned by `getValidate()`. */
export interface CaptchaSuccessResult {
  /** Verification id. */
  captcha_id: string;
  /** Verification serial number. */
  lot_number: string;
  /** Verification output. */
  captcha_output: string;
  /** Pass token, verified server-side. */
  pass_token: string;
  /** Timestamp of the successful verification. */
  gen_time: string;
}

/**
 * PNVS: the object handed to the `initAlicom4` callback.
 *
 * `onSuccess`/`getValidate`/`showCaptcha` are the documented core; the rest were
 * marked optional in the legacy source and are declared optional here too, because
 * the loader is a fork of a third-party library that the consumer hosts (and may
 * therefore be an older or newer build than the one this package was written
 * against). Every optional member is feature-detected before use.
 */
export interface CaptchaObj {
  /** Called when the challenge is solved. */
  onSuccess(callback: TCallBack): void;
  /** The result to send to the server for verification. */
  getValidate(): CaptchaSuccessResult;
  /** Open the challenge. */
  showCaptcha(): void;

  /** The button DOM is ready. */
  onReady?(callback: TCallBack): void;
  /** The next step's resources finished loading. */
  onNextReady?(callback: TCallBack): void;
  /** The challenge was failed by the user. */
  onFail?(callback: TCallBack): void;
  /** The challenge errored. */
  onError?(callback: TErrorCallBack): void;
  /** The user closed the challenge. */
  onClose?(callback: TCallBack): void;
  /** Reset the challenge state. */
  reset?(): void;
  /** Remove the instance. */
  destroy?(): void;

  /** Geetest-derived builds expose these instead of the PNVS names above. */
  hideCaptcha?(): void;
  hide?(): void;
  show?(): void;
  refresh?(): void;
}

/** PNVS: the configuration passed to `window.initAlicom4`. */
export interface CaptchaConfig {
  captchaId: string;
  product: "bind";
}

/** PNVS: receives the captcha object once it exists. */
export type CaptchaHandle = (captchaObj: CaptchaObj) => void;

/**
 * Captcha 2.0: the instance the SDK hands to `getInstance`.
 *
 * Every method is optional on purpose. Alibaba's own FAQ documents `show`, `hide`,
 * `refresh` and `destroyCaptcha` for the V2 client architecture and warns that the
 * traceless form supports neither `show` before its first check nor `refresh` at all;
 * there is no documented `destroy`. Declaring them optional and feature-detecting each
 * call is the only version-proof contract.
 */
export interface Captcha2Instance {
  /** Show the widget or mask. */
  show?(): void;
  /** Hide the widget or mask. */
  hide?(): void;
  /** Refresh the challenge. Not supported by the traceless form. */
  refresh?(): void;
  /** Destroy the instance and its elements (Alibaba's documented teardown). */
  destroyCaptcha?(): void;
  /** Some builds expose this name instead. */
  destroy?(): void;
}

/** Captcha 2.0: receives the instance once initialisation succeeded. */
export type Captcha2Handle = (instance: Captcha2Instance) => void;

/** Captcha 2.0: the configuration passed to `window.initAliyunCaptcha`. */
export interface Captcha2InitConfig {
  /** Scene id from the console. */
  SceneId: string;
  /** `popup` or `embed`. */
  mode: AliCaptcha2Mode;
  /**
   * Selector of the element the widget renders into.
   *
   * A selector, not an element: that is what the SDK documents. Passing an
   * `HTMLElement` to the component is converted to a selector internally.
   */
  element: string;
  /**
   * Selector of the element that triggers the widget. Required even in `embed` mode —
   * a hidden element is the documented way to satisfy it.
   */
  button: string;
  /** V3 success callback. Note: **not** V2's `captchaVerifyCallback`. */
  success: (captchaVerifyParam: string) => void;
  /** Verification failed; the widget refreshes itself. */
  fail?: (result: unknown) => void;
  /** The instance was created. */
  getInstance?: (instance: Captcha2Instance) => void;
  /** SDK-reported error. */
  onError?: (error: unknown) => void;
  /** The widget was closed by the user. */
  onClose?: () => void;
}

/** Either product's instance. */
export type AliCaptchaInstance = CaptchaObj | Captcha2Instance;

/** Props every product shares. */
export interface AliCaptchaCommonProps {
  /** Disables the built-in trigger button. */
  disabled?: boolean;
}

/**
 * PNVS props.
 *
 * The component does **not** bundle `ct4.js`. The legacy package shipped a frozen
 * 14.9 KB third-party (Geetest-derived) fork inside the npm tarball with no
 * attribution and no update path; `scriptSrc` makes the consumer choose and host it,
 * and the component fails loudly when it is missing.
 */
export interface AliCaptchaPnvsProps extends AliCaptchaCommonProps {
  product: "pnvs";
  /** Captcha id from the 号码认证服务 console. */
  captchaId: string;
  /**
   * URL of the `ct4.js` loader (which defines `window.initAlicom4`).
   *
   * Required: there is no default, because every deployment hosts it somewhere
   * different and a wrong default would fail silently.
   */
  scriptSrc?: string;
  /** Legacy callback, invoked once the captcha object exists. `ready` does the same. */
  handle?: CaptchaHandle;
}

/** Captcha 2.0 props. */
export interface AliCaptchaCaptcha2Props extends AliCaptchaCommonProps {
  product: "captcha2";
  /** Scene id (`SceneId`) from the Captcha 2.0 console. */
  sceneId: string;
  /**
   * Identity prefix (身份标) from the console's overview page.
   *
   * This is **not** an asset base path: the SDK reads it to build its own request
   * hosts, and passing a path here breaks verification in a way that looks like a
   * network failure.
   */
  prefix: string;
  /** Data residency. Defaults to `"cn"`. */
  region?: AliCaptchaRegion;
  /** `popup` (default) or `embed`. Traceless verification only supports `popup`. */
  mode?: AliCaptcha2Mode;
  /**
   * Where the widget renders. Defaults to the component's own mount element; a
   * selector string is passed through, an element gets a generated id.
   */
  element?: string | HTMLElement;
  /**
   * What triggers the widget. Defaults to the component's own button (hidden in
   * `embed` mode). The SDK requires this parameter even when the instance's `show()`
   * is used instead of a click.
   */
  button?: string | HTMLElement;
  /** Overrides the Aliyun CDN URL. Only useful behind a proxy. */
  scriptSrc?: string;
  /** Label of the built-in trigger button. */
  triggerLabel?: string;
  /** Legacy-style callback, invoked once the instance exists. `ready` does the same. */
  handle?: Captcha2Handle;
}

/** Props of `AliCaptcha`, discriminated by `product`. */
export type AliCaptchaProps = AliCaptchaPnvsProps | AliCaptchaCaptcha2Props;

/** Payload of the `success` event. */
export type AliCaptchaSuccessPayload =
  | { product: "pnvs"; result: CaptchaSuccessResult }
  | { product: "captcha2"; captchaVerifyParam: string };

/** Payload of the `fail` event. */
export type AliCaptchaFailPayload =
  | { product: "pnvs" }
  | { product: "captcha2"; result: unknown };

/** Events emitted by `AliCaptcha`. */
export interface AliCaptchaEmits {
  /** Verification passed. */
  success: [payload: AliCaptchaSuccessPayload];
  /** Verification failed (the user got it wrong, or the SDK rejected it). */
  fail: [payload: AliCaptchaFailPayload];
  /** Anything else that went wrong, always typed. */
  error: [error: AliCaptchaError];
  /** The user closed the widget. */
  close: [];
  /** The SDK instance exists; the imperative methods are usable from here on. */
  ready: [instance: AliCaptchaInstance];
}

/** Imperative handle exposed by the component. */
export interface AliCaptchaExposed {
  /**
   * Open the challenge.
   *
   * Maps to `showCaptcha()` on PNVS and `show()` on Captcha 2.0.
   */
  show: () => void;
  /**
   * Hide the challenge.
   *
   * Maps to `hideCaptcha()`/`hide()` on PNVS and `hide()` on Captcha 2.0.
   */
  hide: () => void;
  /**
   * Re-arm the challenge.
   *
   * Maps to `reset()` on PNVS and `refresh()` on Captcha 2.0.
   */
  reset: () => void;
  /**
   * Refresh the challenge.
   *
   * Maps to `refresh()` on Captcha 2.0 and `reset()` on PNVS, which has no separate
   * refresh.
   */
  refresh: () => void;
  /** The live SDK instance, or `null` before it exists / after unmount. */
  readonly instance: AliCaptchaInstance | null;
}

declare global {
  interface Window {
    /** Defined by whichever `ct4.js` the consumer hosts. */
    initAlicom4?: (config: CaptchaConfig, handler: CaptchaHandle) => void;
    /** Defined by Aliyun's `AliyunCaptcha.js`. */
    initAliyunCaptcha?: (config: Captcha2InitConfig) => void;
    /** Must be set *before* `AliyunCaptcha.js` is evaluated. */
    AliyunCaptchaConfig?: { region: AliCaptchaRegion; prefix: string };
  }
}
