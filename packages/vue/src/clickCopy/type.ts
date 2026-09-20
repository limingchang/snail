/**
 * Public types for `SClickCopy`.
 *
 * The legacy component declared its props inline with the runtime object form and
 * exported nothing at all, so a consumer could not type a wrapper component around
 * it. Everything a consumer can pass, receive or read back lives here.
 */

/**
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
 * The feedback state of the control.
 *
 * All three states render through the **same** root element. The legacy component
 * had two `v-if` roots, so switching state destroyed the node the user had just
 * clicked (and with it the focus, which fell back to `<body>`).
 */
export type ClickCopyState = "idle" | "success" | "error";

/** Props accepted by `SClickCopy`. */
export interface ClickCopyProps {
  /**
   * Text to copy. Preferred over the slot, and required unless the default slot
   * renders something whose text should be copied instead.
   */
  text?: string;

  /**
   * Optional `text/html` flavour of the same content.
   *
   * Used only when the platform exposes `ClipboardItem` and the rich write succeeds;
   * every other path copies plain text, so passing `html` can never make copying
   * *less* likely to work. That is a deliberate change from "all or nothing".
   */
  html?: string;

  /** Which of the two sources to read. Defaults to `"text"`. */
  source?: ClickCopySource;

  /** Idle label, also used as the accessible name. Defaults to `"复制"`. */
  label?: string;

  /** Message shown *in place of* the label after a successful copy. */
  successMessage?: string;

  /** Message shown in place of the label when copying fails. */
  errorMessage?: string;

  /** How long the success/error message stays on screen, in milliseconds. */
  duration?: number;

  /** Disables activation and removes the control from the tab order. */
  disabled?: boolean;
}

/** Payload of the `success` event. */
export interface ClickCopySuccessPayload {
  /** The text that was copied. */
  text: string;
  /** The rich flavour that was copied, when one was written. */
  html?: string;
  /** Which source `text` came from. */
  source: ClickCopySource;
}

/** Payload of the `error` event. */
export interface ClickCopyErrorPayload {
  /**
   * The underlying failure — a `DOMException` from the clipboard, a synthetic
   * `Error` when no API was available at all, or the thrown value from a failing
   * `execCommand`.
   */
  error: unknown;
  /** The text that could not be copied, for retry or logging. */
  text: string;
}

/** Events emitted by `SClickCopy`. */
export interface ClickCopyEmits {
  /** The clipboard write succeeded. */
  success: [payload: ClickCopySuccessPayload];
  /** Every copy path failed, or there was nothing to copy. */
  error: [payload: ClickCopyErrorPayload];
}

/** Scope of the default slot. */
export interface ClickCopySlotProps {
  /** Current feedback state, so a slotted label can style itself. */
  state: ClickCopyState;
  /** The label/message that should currently be visible. */
  label: string;
  /** Run a copy from inside the slot. */
  copy: () => Promise<boolean>;
}

/**
 * Imperative handle exposed by the component (reachable through a template ref).
 *
 * The legacy component exposed nothing, so a parent could only fake a click on its
 * DOM node.
 */
export interface ClickCopyExposed {
  /**
   * Copy now, exactly as a primary click would.
   *
   * Resolves `true` only when one of the clipboard strategies genuinely succeeded —
   * never merely because a promise resolved.
   */
  copy: () => Promise<boolean>;
  /** Current feedback state. Vue unwraps the ref on the public instance. */
  readonly state: ClickCopyState;
}
