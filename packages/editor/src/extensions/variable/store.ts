import type { VariableFillData } from "../../typings/variable";

/**
 * 文档正在被怎样使用。
 *
 * 声明在这里而不是 `typing.ts`，这样两个模块都能引用它而不产生循环：store 拥有这个模式，
 * 选项类型则从那里借用它。
 *
 * How the document is being used.
 *
 * Declared here rather than in `typing.ts` so both modules can name it without a cycle:
 * the store owns the mode, and the options type borrows it from there.
 */
export type VariableMode = "design" | "fill";

/**
 * 填写值所在的那个可观察对象。
 *
 * ## 为什么要有它
 *
 * 在旧版包里，填好的合同是*重写文档*产生的：`variableParser` 遍历 JSON，把每个变量换成文本
 * 节点，再把结果通过 `setTimeout(() => setContent(...))` 推回去。这丢掉了选区、与输入竞争，
 * 并且让设计模式无路可回（缺陷 25–26）。
 *
 * 这里文档从不被触碰。节点视图画的是解析后的值，所以用户提供新数据时唯一需要变化的就是节点
 * 视图——而它们需要被告知。一个监听器的 `Map` 是能通知它们的最小东西，而且与编辑器事务不同，
 * 没有订阅者时它不花任何代价。
 *
 * ## 为什么不能只用 Tiptap 的 `storage`
 *
 * Tiptap 就地修改 `this.storage`；ProseMirror 的 `update` 事件只为*文档与选区*事务触发，所以
 * 一句普通的 `editor.storage.variable.values = …` 到达不了任何节点视图。Storage 仍然保持同步
 * （普通使用方会读它），但通知走的是这里。
 *
 * ## 为什么订阅用递增的 id 作为键
 *
 * 一个回调的 `Set` 无法区分恰好共用同一个函数引用的两个节点视图，而按函数身份退订会把两个都
 * 移除。用 id 给每个订阅者各自的令牌。
 *
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
  /**
   * 每一个还在生效的监听器，按订阅顺序。
   *
   * Every live listener, in subscription order.
   */
  private readonly listeners = new Map<number, () => void>();

  /**
   * 下一个令牌。单调递增，所以令牌永不复用。
   *
   * Next token. Monotonic so a token is never reused.
   */
  private nextId = 0;

  /**
   * 当前填写数据。永远是对象，从不为 `null`，所以读取方不需要守卫。
   *
   * The current fill data. Always an object, never `null`, so readers need no guard.
   */
  private currentValues: VariableFillData;

  /**
   * 当前模式。
   *
   * 除了放在扩展选项上，这里也保存一份，这样节点视图可以从它已经订阅的那一个对象里读到它的
   * 两半输入。
   *
   * The current mode.
   *
   * Kept here as well as on the extension's options so a node view can read both halves
   * of its input from the one object it already subscribes to.
   */
  private currentMode: VariableMode;

  /**
   * 构造一个 store，并把传入的填写数据浅拷贝一份。
   *
   * Construct a store, shallow-copying the fill data it is given.
   */
  constructor(values: VariableFillData, mode: VariableMode = "design") {
    // A defensive copy: the caller keeps its own object and mutating it later must
    // not silently change what the editor renders.
    this.currentValues = { ...values };
    this.currentMode = mode;
  }

  /**
   * 当前填写数据。
   *
   * 为速度而按引用返回——节点视图在每次文档变化时都要解析——所以请把它当作只读。
   *
   * The current fill data.
   *
   * Returned by reference for speed — node views resolve on every document
   * change — so treat it as read-only.
   */
  getValues(): VariableFillData {
    return this.currentValues;
  }

  /** 当前模式。 / The current mode. */
  getMode(): VariableMode {
    return this.currentMode;
  }

  /**
   * 切换模式并通知每个订阅者。
   *
   * 模式变化不是文档变化，所以 ProseMirror 没有对应的事件：没有这个通知，节点视图会一直画着
   * 旧模式，直到下一次按键。
   *
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

  /**
   * 替换填写数据并通知每个订阅者。写入时拷贝让快照保持稳定。
   *
   * Replace the fill data and tell every subscriber. Copying on write keeps the snapshot stable.
   */
  setValues(values: VariableFillData): void {
    this.currentValues = { ...values };
    this.emit();
  }

  /**
   * {@link setValues} 的别名，供按「改了一个字段」思考的调用方使用。
   *
   * Alias of {@link setValues}, for callers that think in terms of one changed field.
   */
  set(values: VariableFillData): void {
    this.setValues(values);
  }

  /**
   * 监听值的变化。
   *
   * Listen for value changes.
   *
   * @returns 交回给 {@link unsubscribe} 的令牌。返回令牌而不是一个退订闭包，让 `destroy()`
   *   保持一行，并且能与 `noImplicitThis` 一起工作 /
   *   the token to hand back to {@link unsubscribe}. Returning the token
   *   rather than an unsubscribe closure keeps `destroy()` a one-liner and works
   *   with `noImplicitThis`.
   */
  subscribe(listener: () => void): number {
    const id = this.nextId++;
    this.listeners.set(id, listener);
    return id;
  }

  /**
   * 停止监听。未知的令牌会被忽略，所以重复退订无害。
   *
   * Stop listening. Unknown tokens are ignored, so a double unsubscribe is harmless.
   */
  unsubscribe(id: number): void {
    this.listeners.delete(id);
  }

  /**
   * 通知每一个监听器。公开，这样改过模式的调用方可以强制重绘。
   *
   * Notify every listener. Public so a caller that changed a mode can force a repaint.
   */
  emit(): void {
    // Iterate over a copy: a listener is allowed to unsubscribe (or subscribe)
    // while it runs, and mutating the map mid-iteration would skip entries.
    for (const listener of [...this.listeners.values()]) listener();
  }

  /**
   * 当前挂载了多少个节点视图。供测试与可用性检查使用。
   *
   * How many node views are currently attached. Used by tests and availability checks.
   */
  get size(): number {
    return this.listeners.size;
  }
}
