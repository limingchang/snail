/**
 * `AliCaptcha` 的公共类型定义。
 *
 * 旧版 `type.ts` 只覆盖一个产品 —— 号码认证服务（PNVS）图形验证码，其加载脚本
 * `ct4.js` 由本包内置 —— 并把配置声明为 `{ captchaId: string; product: "bind" }`，
 * 错误回调里的 `desc` 是 `any`。当前主流产品「验证码 2.0（Captcha 2.0）V3」是另一套
 * SDK，props、回调和实例方法都不相同。
 *
 * 两者都受支持，由显式的 `product` prop 选择；props 是一个**可辨识联合**：`sceneId`
 * 不存在于 PNVS 验证码上，`captchaId` 也不存在于 Captcha 2.0 验证码上，因此
 * TypeScript 会拒绝混用，而不是让 SDK 在运行时失败。
 *
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

/**
 * 本组件可以驱动的两种阿里云产品。
 *
 * The two Aliyun products this component can drive.
 */
export type AliCaptchaProduct = "pnvs" | "captcha2";

/** Captcha 2.0 的数据驻留地域。 / Captcha 2.0 data-residency region. */
export type AliCaptchaRegion = "cn" | "sgp";

/** Captcha 2.0 的渲染模式。 / Captcha 2.0 rendering mode. */
export type AliCaptcha2Mode = "popup" | "embed";

/** PNVS：一个无参回调。 / PNVS: a plain callback. */
export type TCallBack = () => void;

/**
 * PNVS：错误回调。`desc` 是 SDK 附加的任意值。
 *
 * PNVS: the error callback. `desc` is whatever the SDK attached.
 */
export type TErrorCallBack = (error?: { code: number; msg: string; desc: unknown }) => void;

/**
 * PNVS：`getValidate()` 返回的第二步校验载荷。
 *
 * PNVS: the second-step verification payload returned by `getValidate()`.
 */
export interface CaptchaSuccessResult {
  /** 验证 id。 / Verification id. */
  captcha_id: string;
  /** 验证流水号。 / Verification serial number. */
  lot_number: string;
  /** 验证输出。 / Verification output. */
  captcha_output: string;
  /** 通过令牌，由服务端校验。 / Pass token, verified server-side. */
  pass_token: string;
  /** 验证成功时的时间戳。 / Timestamp of the successful verification. */
  gen_time: string;
}

/**
 * PNVS：传给 `initAlicom4` 回调的对象。
 *
 * `onSuccess`/`getValidate`/`showCaptcha` 是文档化的核心方法；其余成员在旧源码里
 * 就是可选的，这里也声明为可选，因为该加载脚本是使用方自行托管的第三方库分支
 * （它的构建版本可能比本包编写时更新或更旧）。每个可选成员在使用前都会做特性检测。
 *
 * PNVS: the object handed to the `initAlicom4` callback.
 *
 * `onSuccess`/`getValidate`/`showCaptcha` are the documented core; the rest were
 * marked optional in the legacy source and are declared optional here too, because
 * the loader is a fork of a third-party library that the consumer hosts (and may
 * therefore be an older or newer build than the one this package was written
 * against). Every optional member is feature-detected before use.
 */
export interface CaptchaObj {
  /** 通过验证挑战时调用。 / Called when the challenge is solved. */
  onSuccess(callback: TCallBack): void;
  /**
   * 需要发送给服务端校验的结果。
   *
   * The result to send to the server for verification.
   */
  getValidate(): CaptchaSuccessResult;
  /** 打开验证挑战。 / Open the challenge. */
  showCaptcha(): void;

  /** 按钮 DOM 已就绪。 / The button DOM is ready. */
  onReady?(callback: TCallBack): void;
  /** 下一步所需资源加载完成。 / The next step's resources finished loading. */
  onNextReady?(callback: TCallBack): void;
  /** 用户未通过验证挑战。 / The challenge was failed by the user. */
  onFail?(callback: TCallBack): void;
  /** 验证挑战发生错误。 / The challenge errored. */
  onError?(callback: TErrorCallBack): void;
  /** 用户关闭了验证挑战。 / The user closed the challenge. */
  onClose?(callback: TCallBack): void;
  /** 重置验证挑战的状态。 / Reset the challenge state. */
  reset?(): void;
  /** 移除实例。 / Remove the instance. */
  destroy?(): void;

  /**
   * 由 Geetest 派生的构建改用这些名称，而不是上面的 PNVS 名称。
   *
   * Geetest-derived builds expose these instead of the PNVS names above.
   */
  /** 隐藏挑战（Geetest 派生命名）。 / Hide the challenge (Geetest-derived name). */
  hideCaptcha?(): void;
  /** 隐藏挑战。 / Hide the challenge. */
  hide?(): void;
  /** 显示挑战。 / Show the challenge. */
  show?(): void;
  /** 刷新挑战。 / Refresh the challenge. */
  refresh?(): void;
}

/**
 * PNVS：传给 `window.initAlicom4` 的配置。
 *
 * PNVS: the configuration passed to `window.initAlicom4`.
 */
export interface CaptchaConfig {
  /** 号码认证服务控制台中的验证码 id。 / Captcha id from the 号码认证服务 console. */
  captchaId: string;
  /** 固定为字面量 `"bind"`。 / The literal `"bind"` discriminator. */
  product: "bind";
}

/**
 * PNVS：验证码对象创建后接收它。
 *
 * PNVS: receives the captcha object once it exists.
 */
export type CaptchaHandle = (captchaObj: CaptchaObj) => void;

/**
 * Captcha 2.0：SDK 传给 `getInstance` 的实例。
 *
 * 每个方法都刻意声明为可选。阿里云官方 FAQ 为 V2 客户端架构记录了 `show`、`hide`、
 * `refresh` 和 `destroyCaptcha`，并提醒无痕形态既不支持首次校验前的 `show`，也完全
 * 不支持 `refresh`；官方没有记录 `destroy`。把它们都声明为可选、每次调用都做特性
 * 检测，是唯一不受版本影响的契约。
 *
 * Captcha 2.0: the instance the SDK hands to `getInstance`.
 *
 * Every method is optional on purpose. Alibaba's own FAQ documents `show`, `hide`,
 * `refresh` and `destroyCaptcha` for the V2 client architecture and warns that the
 * traceless form supports neither `show` before its first check nor `refresh` at all;
 * there is no documented `destroy`. Declaring them optional and feature-detecting each
 * call is the only version-proof contract.
 */
export interface Captcha2Instance {
  /** 显示挂件或遮罩。 / Show the widget or mask. */
  show?(): void;
  /** 隐藏挂件或遮罩。 / Hide the widget or mask. */
  hide?(): void;
  /**
   * 刷新验证挑战。无痕形态不支持。
   *
   * Refresh the challenge. Not supported by the traceless form.
   */
  refresh?(): void;
  /**
   * 销毁实例及其元素（阿里云文档给出的拆除方式）。
   *
   * Destroy the instance and its elements (Alibaba's documented teardown).
   */
  destroyCaptcha?(): void;
  /** 某些构建改用这个名称。 / Some builds expose this name instead. */
  destroy?(): void;
}

/**
 * Captcha 2.0：初始化成功后接收实例。
 *
 * Captcha 2.0: receives the instance once initialisation succeeded.
 */
export type Captcha2Handle = (instance: Captcha2Instance) => void;

/**
 * Captcha 2.0：传给 `window.initAliyunCaptcha` 的配置。
 *
 * Captcha 2.0: the configuration passed to `window.initAliyunCaptcha`.
 */
export interface Captcha2InitConfig {
  /** 控制台中的场景 id。 / Scene id from the console. */
  SceneId: string;
  /** `popup` 或 `embed`。 / `popup` or `embed`. */
  mode: AliCaptcha2Mode;
  /**
   * 挂件渲染目标的元素选择器。
   *
   * 是选择器而不是元素：这是 SDK 文档的规定。向组件传入 `HTMLElement` 时，内部会把
   * 它转换成选择器。
   *
   * Selector of the element the widget renders into.
   *
   * A selector, not an element: that is what the SDK documents. Passing an
   * `HTMLElement` to the component is converted to a selector internally.
   */
  element: string;
  /**
   * 触发挂件的元素选择器。即使在 `embed` 模式下也是必填的 —— 一个隐藏元素是满足
   * 它的文档化做法。
   *
   * Selector of the element that triggers the widget. Required even in `embed` mode —
   * a hidden element is the documented way to satisfy it.
   */
  button: string;
  /**
   * V3 的成功回调。注意：**不是** V2 的 `captchaVerifyCallback`。
   *
   * V3 success callback. Note: **not** V2's `captchaVerifyCallback`.
   */
  success: (captchaVerifyParam: string) => void;
  /**
   * 验证失败；挂件会自行刷新。
   *
   * Verification failed; the widget refreshes itself.
   */
  fail?: (result: unknown) => void;
  /** 实例已创建。 / The instance was created. */
  getInstance?: (instance: Captcha2Instance) => void;
  /** SDK 上报的错误。 / SDK-reported error. */
  onError?: (error: unknown) => void;
  /** 用户关闭了挂件。 / The widget was closed by the user. */
  onClose?: () => void;
}

/** 任一产品的实例。 / Either product's instance. */
export type AliCaptchaInstance = CaptchaObj | Captcha2Instance;

/** 两种产品共有的 props。 / Props every product shares. */
export interface AliCaptchaCommonProps {
  /** 禁用内置的触发按钮。 / Disables the built-in trigger button. */
  disabled?: boolean;
}

/**
 * PNVS 的 props。
 *
 * 本组件**不**内置 `ct4.js`。旧包在 npm 压缩包里塞了一份 14.9 KB 的第三方
 * （Geetest 派生）冻结分支，既无署名也无升级途径；`scriptSrc` 让使用方自行选择并
 * 托管它，缺失时组件会明确报错。
 *
 * PNVS props.
 *
 * The component does **not** bundle `ct4.js`. The legacy package shipped a frozen
 * 14.9 KB third-party (Geetest-derived) fork inside the npm tarball with no
 * attribution and no update path; `scriptSrc` makes the consumer choose and host it,
 * and the component fails loudly when it is missing.
 */
export interface AliCaptchaPnvsProps extends AliCaptchaCommonProps {
  /** 产品判别值 `"pnvs"`。 / The `"pnvs"` discriminator. */
  product: "pnvs";
  /** 号码认证服务控制台中的验证码 id。 / Captcha id from the 号码认证服务 console. */
  captchaId: string;
  /**
   * `ct4.js` 加载脚本的 URL（它定义 `window.initAlicom4`）。
   *
   * 必填：没有默认值，因为每次部署托管它的位置都不同，错误的默认值只会导致静默
   * 失败。
   *
   * URL of the `ct4.js` loader (which defines `window.initAlicom4`).
   *
   * Required: there is no default, because every deployment hosts it somewhere
   * different and a wrong default would fail silently.
   */
  scriptSrc?: string;
  /**
   * 旧版回调，在验证码对象创建后调用；`ready` 事件作用相同。
   *
   * Legacy callback, invoked once the captcha object exists. `ready` does the same.
   */
  handle?: CaptchaHandle;
}

/** Captcha 2.0 的 props。 / Captcha 2.0 props. */
export interface AliCaptchaCaptcha2Props extends AliCaptchaCommonProps {
  /** 产品判别值 `"captcha2"`。 / The `"captcha2"` discriminator. */
  product: "captcha2";
  /**
   * 验证码 2.0 控制台中的场景 id（`SceneId`）。
   *
   * Scene id (`SceneId`) from the Captcha 2.0 console.
   */
  sceneId: string;
  /**
   * 控制台概览页中的身份标（`prefix`）。
   *
   * 这**不是**静态资源的基础路径：SDK 会读取它来构造自己的请求域名，在这里传路径会
   * 导致验证失败，且现象看起来像网络故障。
   *
   * Identity prefix (身份标) from the console's overview page.
   *
   * This is **not** an asset base path: the SDK reads it to build its own request
   * hosts, and passing a path here breaks verification in a way that looks like a
   * network failure.
   */
  prefix: string;
  /** 数据驻留地域。默认 `"cn"`。 / Data residency. Defaults to `"cn"`. */
  region?: AliCaptchaRegion;
  /**
   * `popup`（默认）或 `embed`。无痕验证只支持 `popup`。
   *
   * `popup` (default) or `embed`. Traceless verification only supports `popup`.
   */
  mode?: AliCaptcha2Mode;
  /**
   * 挂件渲染的位置。默认为组件自身的挂载元素；选择器字符串会原样传入，元素则会被
   * 生成一个 id。
   *
   * Where the widget renders. Defaults to the component's own mount element; a
   * selector string is passed through, an element gets a generated id.
   */
  element?: string | HTMLElement;
  /**
   * 触发挂件的方式。默认为组件自身的按钮（在 `embed` 模式下隐藏）。即使改用实例的
   * `show()` 而不是点击，SDK 也要求传入这个参数。
   *
   * What triggers the widget. Defaults to the component's own button (hidden in
   * `embed` mode). The SDK requires this parameter even when the instance's `show()`
   * is used instead of a click.
   */
  button?: string | HTMLElement;
  /**
   * 覆盖阿里云 CDN 的 URL。只有走代理时才有用。
   *
   * Overrides the Aliyun CDN URL. Only useful behind a proxy.
   */
  scriptSrc?: string;
  /** 内置触发按钮的文案。 / Label of the built-in trigger button. */
  triggerLabel?: string;
  /**
   * 旧版风格的回调，在实例创建后调用；`ready` 事件作用相同。
   *
   * Legacy-style callback, invoked once the instance exists. `ready` does the same.
   */
  handle?: Captcha2Handle;
}

/**
 * `AliCaptcha` 的 props，按 `product` 可辨识。
 *
 * Props of `AliCaptcha`, discriminated by `product`.
 */
export type AliCaptchaProps = AliCaptchaPnvsProps | AliCaptchaCaptcha2Props;

/** `success` 事件的载荷。 / Payload of the `success` event. */
export type AliCaptchaSuccessPayload =
  | { product: "pnvs"; result: CaptchaSuccessResult }
  | { product: "captcha2"; captchaVerifyParam: string };

/** `fail` 事件的载荷。 / Payload of the `fail` event. */
export type AliCaptchaFailPayload =
  | { product: "pnvs" }
  | { product: "captcha2"; result: unknown };

/** `AliCaptcha` 发出的事件。 / Events emitted by `AliCaptcha`. */
export interface AliCaptchaEmits {
  /** 验证通过。 / Verification passed. */
  success: [payload: AliCaptchaSuccessPayload];
  /**
   * 验证失败（用户答错，或被 SDK 拒绝）。
   *
   * Verification failed (the user got it wrong, or the SDK rejected it).
   */
  fail: [payload: AliCaptchaFailPayload];
  /**
   * 其他任何出错的场景，始终是强类型的。
   *
   * Anything else that went wrong, always typed.
   */
  error: [error: AliCaptchaError];
  /** 用户关闭了挂件。 / The user closed the widget. */
  close: [];
  /**
   * SDK 实例已存在；从此之后命令式方法可以使用。
   *
   * The SDK instance exists; the imperative methods are usable from here on.
   */
  ready: [instance: AliCaptchaInstance];
}

/** 组件暴露的命令式句柄。 / Imperative handle exposed by the component. */
export interface AliCaptchaExposed {
  /**
   * 打开验证挑战。
   *
   * 在 PNVS 上映射为 `showCaptcha()`，在 Captcha 2.0 上映射为 `show()`。
   *
   * Open the challenge.
   *
   * Maps to `showCaptcha()` on PNVS and `show()` on Captcha 2.0.
   */
  show: () => void;
  /**
   * 隐藏验证挑战。
   *
   * 在 PNVS 上映射为 `hideCaptcha()`/`hide()`，在 Captcha 2.0 上映射为 `hide()`。
   *
   * Hide the challenge.
   *
   * Maps to `hideCaptcha()`/`hide()` on PNVS and `hide()` on Captcha 2.0.
   */
  hide: () => void;
  /**
   * 重新武装验证挑战。
   *
   * 在 PNVS 上映射为 `reset()`，在 Captcha 2.0 上映射为 `refresh()`。
   *
   * Re-arm the challenge.
   *
   * Maps to `reset()` on PNVS and `refresh()` on Captcha 2.0.
   */
  reset: () => void;
  /**
   * 刷新验证挑战。
   *
   * 在 Captcha 2.0 上映射为 `refresh()`，在 PNVS 上映射为 `reset()`；PNVS 没有独立
   * 的刷新。
   *
   * Refresh the challenge.
   *
   * Maps to `refresh()` on Captcha 2.0 and `reset()` on PNVS, which has no separate
   * refresh.
   */
  refresh: () => void;
  /**
   * 当前的 SDK 实例；实例出现之前或卸载之后为 `null`。
   *
   * The live SDK instance, or `null` before it exists / after unmount.
   */
  readonly instance: AliCaptchaInstance | null;
}

declare global {
  interface Window {
    /**
     * 由使用方自行托管的 `ct4.js` 定义。
     *
     * Defined by whichever `ct4.js` the consumer hosts.
     */
    initAlicom4?: (config: CaptchaConfig, handler: CaptchaHandle) => void;
    /**
     * 由阿里云的 `AliyunCaptcha.js` 定义。
     *
     * Defined by Aliyun's `AliyunCaptcha.js`.
     */
    initAliyunCaptcha?: (config: Captcha2InitConfig) => void;
    /**
     * 必须在 `AliyunCaptcha.js` 求值*之前*设置。
     *
     * Must be set *before* `AliyunCaptcha.js` is evaluated.
     */
    AliyunCaptchaConfig?: { region: AliCaptchaRegion; prefix: string };
  }
}
