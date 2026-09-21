/**
 * `SClickCopy` 的公开类型定义。
 *
 * 旧组件用运行时对象形式内联声明 props，并且完全没有导出任何类型，使用方因此无法
 * 为它写一个带类型的包装组件。使用方能传入、接收或读回的一切都定义在这里。
 *
 * Public types for `SClickCopy`.
 *
 * The legacy component declared its props inline with the runtime object form and
 * exported nothing at all, so a consumer could not type a wrapper component around
 * it. Everything a consumer can pass, receive or read back lives here.
 */

/**
 * 被复制的文本从哪里读取。
 *
 * - `"text"` —— 读取 `text` prop（推荐）。
 * - `"slot"` —— 读取默认插槽渲染出的 `textContent`。
 *
 * 当 `source` 保持默认值而 `text` 为空时，仍会回退到插槽，因此只写插槽的调用方
 * 不需要知道这个 prop 的存在。
 *
 * Where the copied text comes from.
 *
 * - `"text"` — the `text` prop (preferred).
 * - `"slot"` — the default slot's rendered `textContent`.
 *
 * When `source` is left at its default and `text` is empty, the slot is used anyway,
 * so a slot-only call site works without knowing this prop exists.
 */
export type ClickCopySource = "text" | "slot";

/**
 * 控件的反馈状态。
 *
 * 三种状态都渲染在**同一个**根元素上。旧组件用了两个 `v-if` 根节点，因此每次切换
 * 状态都会销毁用户刚刚点击的那个节点（焦点也随之丢回 `<body>`）。
 *
 * The feedback state of the control.
 *
 * All three states render through the **same** root element. The legacy component
 * had two `v-if` roots, so switching state destroyed the node the user had just
 * clicked (and with it the focus, which fell back to `<body>`).
 */
export type ClickCopyState = "idle" | "success" | "error";

/**
 * `SClickCopy` 接受的 props。
 *
 * Props accepted by `SClickCopy`.
 */
export interface ClickCopyProps {
  /**
   * 要复制的文本。优先于插槽；除非默认插槽渲染的内容就是应该被复制的文本，
   * 否则这个 prop 是必填的。
   *
   * Text to copy. Preferred over the slot, and required unless the default slot
   * renders something whose text should be copied instead.
   */
  text?: string;

  /**
   * 同一份内容可选的 `text/html` 形式。
   *
   * 只在平台提供 `ClipboardItem` 且富文本写入成功时使用；其他所有路径都会退回复制
   * 纯文本，所以传入 `html` 绝不会让复制变得*更*容易失败。这是对「全有或全无」的
   * 一次有意改动。
   *
   * Optional `text/html` flavour of the same content.
   *
   * Used only when the platform exposes `ClipboardItem` and the rich write succeeds;
   * every other path copies plain text, so passing `html` can never make copying
   * *less* likely to work. That is a deliberate change from "all or nothing".
   */
  html?: string;

  /**
   * 从两个来源中读取哪一个。默认为 `"text"`。
   *
   * Which of the two sources to read. Defaults to `"text"`.
   */
  source?: ClickCopySource;

  /**
   * 空闲状态下的文案，同时用作无障碍名称。默认为 `"复制"`。
   *
   * Idle label, also used as the accessible name. Defaults to `"复制"`.
   */
  label?: string;

  /**
   * 复制成功后**替换**标签显示的消息。
   *
   * Message shown *in place of* the label after a successful copy.
   */
  successMessage?: string;

  /**
   * 复制失败时替换标签显示的消息。
   *
   * Message shown in place of the label when copying fails.
   */
  errorMessage?: string;

  /**
   * 成功 / 失败消息在屏幕上停留的时长，单位为毫秒。
   *
   * How long the success/error message stays on screen, in milliseconds.
   */
  duration?: number;

  /**
   * 禁用激活，并把控件从 Tab 键顺序中移除。
   *
   * Disables activation and removes the control from the tab order.
   */
  disabled?: boolean;
}

/**
 * `success` 事件的载荷。
 *
 * Payload of the `success` event.
 */
export interface ClickCopySuccessPayload {
  /** 被复制的文本。 / The text that was copied. */
  text: string;
  /**
   * 一起被写入的富文本形式，如果确实写入过。
   *
   * The rich flavour that was copied, when one was written.
   */
  html?: string;
  /** `text` 来自哪个来源。 / Which source `text` came from. */
  source: ClickCopySource;
}

/**
 * `error` 事件的载荷。
 *
 * Payload of the `error` event.
 */
export interface ClickCopyErrorPayload {
  /**
   * 底层失败原因 —— 来自剪贴板的 `DOMException`、完全没有可用 API 时合成的
   * `Error`，或者失败的 `execCommand` 抛出的值。
   *
   * The underlying failure — a `DOMException` from the clipboard, a synthetic
   * `Error` when no API was available at all, or the thrown value from a failing
   * `execCommand`.
   */
  error: unknown;
  /**
   * 未能复制的文本，可用于重试或记录日志。
   *
   * The text that could not be copied, for retry or logging.
   */
  text: string;
}

/**
 * `SClickCopy` 抛出的事件。
 *
 * Events emitted by `SClickCopy`.
 */
export interface ClickCopyEmits {
  /** 剪贴板写入成功。 / The clipboard write succeeded. */
  success: [payload: ClickCopySuccessPayload];
  /**
   * 所有复制路径都失败，或者根本没有可复制的内容。
   *
   * Every copy path failed, or there was nothing to copy.
   */
  error: [payload: ClickCopyErrorPayload];
}

/**
 * 默认插槽的作用域参数。
 *
 * Scope of the default slot.
 */
export interface ClickCopySlotProps {
  /**
   * 当前的反馈状态，方便插槽内的文案自行决定样式。
   *
   * Current feedback state, so a slotted label can style itself.
   */
  state: ClickCopyState;
  /**
   * 当前应该显示的标签 / 消息。
   *
   * The label/message that should currently be visible.
   */
  label: string;
  /** 在插槽内部触发一次复制。 / Run a copy from inside the slot. */
  copy: () => Promise<boolean>;
}

/**
 * 组件对外暴露的命令式句柄（可通过模板 ref 访问）。
 *
 * 旧组件什么都不暴露，父组件只能对它的 DOM 节点伪造一次点击。
 *
 * Imperative handle exposed by the component (reachable through a template ref).
 *
 * The legacy component exposed nothing, so a parent could only fake a click on its
 * DOM node.
 */
export interface ClickCopyExposed {
  /**
   * 立刻执行一次复制，效果与直接点击一次完全相同。
   *
   * 只有当某一种剪贴板策略确实成功时才 resolve 为 `true` —— 绝不会仅仅因为一个
   * Promise 被 resolve 就返回 `true`。
   *
   * Copy now, exactly as a primary click would.
   *
   * Resolves `true` only when one of the clipboard strategies genuinely succeeded —
   * never merely because a promise resolved.
   */
  copy: () => Promise<boolean>;
  /**
   * 当前的反馈状态。Vue 会在公开实例上自动解包这个 ref。
   *
   * Current feedback state. Vue unwraps the ref on the public instance.
   */
  readonly state: ClickCopyState;
}
