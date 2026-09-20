import type { VariableFillData } from "../../typings/variable";

/**
 * How the document is being used.
 *
 * Declared here rather than in `typing.ts` so both modules can name it without a cycle:
 * the store owns the mode, and the options type borrows it from there.
 */
export type VariableMode = "design" | "fill";

/**
 * The observable the fill values live in.
 *
 * ## Why this exists at all
 *
 * In the legacy package a filled contract was produced by *rewriting the
 * document*: `variableParser` walked the JSON, swapped every variable for a text
 * node and pushed the result back through `setTimeout(() => setContent(...))`.
 * That lost the selection, raced with typing and left no way back to design mode
 * (defects 25–26).
 *
 * Here the document is never touched. The node view paints the resolved value, so
 * the only thing that has to change when the user supplies new data is the node
 * views — and they need to be told. A `Map` of listeners is the smallest thing
 * that can tell them, and unlike an editor transaction it costs nothing when
 * nothing is subscribed.
 *
 * ## Why not Tiptap's `storage` alone
 *
 * Tiptap mutates `this.storage` in place; ProseMirror's `update` event fires only
 * for *document and selection* transactions, so a plain `editor.storage.variable.values = …`
 * reaches no node view. Storage is still kept in step (plain consumers read it),
 * but the notification travels through here.
 *
 * ## Why subscriptions are keyed by an incremented id
 *
 * A `Set` of callbacks cannot distinguish two node views that happen to share a
 * function reference, and unsubscribing by function identity would remove both.
 * An id hands each subscriber its own token.
 */
export class VariableStore {
  /** Every live listener, in subscription order. */
  private readonly listeners = new Map<number, () => void>();

  /** Next token. Monotonic so a token is never reused. */
  private nextId = 0;

  /** The current fill data. Always an object, never `null`, so readers need no guard. */
  private currentValues: VariableFillData;

  /**
   * The current mode.
   *
   * Kept here as well as on the extension's options so a node view can read both halves
   * of its input from the one object it already subscribes to.
   */
  private currentMode: VariableMode;

  constructor(values: VariableFillData, mode: VariableMode = "design") {
    // A defensive copy: the caller keeps its own object and mutating it later must
    // not silently change what the editor renders.
    this.currentValues = { ...values };
    this.currentMode = mode;
  }

  /**
   * The current fill data.
   *
   * Returned by reference for speed — node views resolve on every document
   * change — so treat it as read-only.
   */
  getValues(): VariableFillData {
    return this.currentValues;
  }

  /** The current mode. */
  getMode(): VariableMode {
    return this.currentMode;
  }

  /**
   * Switch mode and tell every subscriber.
   *
   * A mode change is not a document change, so ProseMirror has no event for it: without
   * this notification the node views would keep painting the old mode until the next
   * keystroke.
   */
  setMode(mode: VariableMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.emit();
  }

  /** Replace the fill data and tell every subscriber. Copying on write keeps the snapshot stable. */
  setValues(values: VariableFillData): void {
    this.currentValues = { ...values };
    this.emit();
  }

  /** Alias of {@link setValues}, for callers that think in terms of one changed field. */
  set(values: VariableFillData): void {
    this.setValues(values);
  }

  /**
   * Listen for value changes.
   *
   * @returns the token to hand back to {@link unsubscribe}. Returning the token
   * rather than an unsubscribe closure keeps `destroy()` a one-liner and works
   * with `noImplicitThis`.
   */
  subscribe(listener: () => void): number {
    const id = this.nextId++;
    this.listeners.set(id, listener);
    return id;
  }

  /** Stop listening. Unknown tokens are ignored, so a double unsubscribe is harmless. */
  unsubscribe(id: number): void {
    this.listeners.delete(id);
  }

  /** Notify every listener. Public so a caller that changed a mode can force a repaint. */
  emit(): void {
    // Iterate over a copy: a listener is allowed to unsubscribe (or subscribe)
    // while it runs, and mutating the map mid-iteration would skip entries.
    for (const listener of [...this.listeners.values()]) listener();
  }

  /** How many node views are currently attached. Used by tests and availability checks. */
  get size(): number {
    return this.listeners.size;
  }
}
