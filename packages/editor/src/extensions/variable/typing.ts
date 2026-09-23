/**
 * 变量扩展自己的类型。
 *
 * *模型*——{@link VariableAttrs}、九种类型的可判别联合、{@link VariableData}——位于
 * `typings/variable.ts`，并从那里重新导出，而不是在这里重新声明：同一份契约的两处声明会
 * 逐渐分叉，而那个文件存在的全部意义就是类型与它的载荷不能互相矛盾。
 *
 * 这里放的是只有扩展自己知道的东西：它的选项、它的 storage、它的文案表，以及节点视图收到的
 * 参数。
 *
 * The variable extension's own types.
 *
 * The *model* — {@link VariableAttrs}, the nine-type discriminated union,
 * {@link VariableData} — lives in `typings/variable.ts` and is re-exported from
 * here rather than redeclared: two declarations of the same contract drift, and
 * the whole point of that file is that the type and its payload cannot disagree.
 *
 * What belongs here is what only the extension knows: its options, its storage,
 * its locale table and the argument its node view receives.
 */

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Decoration, NodeView } from "@tiptap/pm/view";

import type {
  InnerVariableNode,
  VariableAttrs,
  VariableFillData
} from "../../typings/variable";

import type { VariableMode, VariableStore } from "./store";

// The node view and the resolver are the consumers, but a UI host importing from
// the extension's folder should not have to know that. Re-export the model too.
export type {
  BooleanVariableData,
  DateVariableData,
  FormulaFunction,
  FormulaVariableData,
  ImageVariableData,
  InnerVariableNode,
  MoneyVariableData,
  NumberVariableData,
  ResolvedVariable,
  SelectVariableData,
  SystemVariableData,
  SystemVariableKey,
  TextVariableData,
  VariableAttrs,
  VariableData,
  VariableFillData,
  VariableIssue,
  VariableOption,
  VariableType,
  VariableValue
} from "../../typings/variable";

export {
  FORMULA_FUNCTIONS,
  VARIABLE_TYPES
} from "../../typings/variable";

/**
 * 文档如何使用。从拥有该值的 store 重新导出。
 *
 * How the document is being used. Re-exported from the store, which owns the value.
 */
export type { VariableMode };

/**
 * 文档里找到的一个变量，以及它所在的位置。
 *
 * 声明在这里而不是 `index.ts`，这样 `VariableStorage` 可以引用它而不必反过来导入扩展。
 *
 * A variable found in a document, with the position it sits at.
 *
 * Declared here rather than in `index.ts` so `VariableStorage` can name it without
 * importing the extension back.
 */
export interface DocumentVariable {
  /**
   * 节点的位置，按 ProseMirror 报告的值。
   *
   * The node's position, as ProseMirror reports it.
   */
  pos: number;

  /** 节点的属性。 / The node's attributes. */
  attrs: VariableAttrs;
}

/**
 * 用户可见的文案，让扩展不必依赖任何 UI 库。
 *
 * 默认值是中文，与 `@snail-js/api` 的 locale 模式一致：想要英文的宿主传入自己的文案表，
 * 两者都不想要的宿主也照样能用。
 *
 * User-visible strings, so the extension stays free of a UI library.
 *
 * Chinese defaults, mirroring the `@snail-js/api` locale pattern: a host that
 * wants English passes its own table, and a host that wants neither keeps working.
 */
export interface VariableLocale {
  /**
   * 填写模式下值为空的节点视图所画的文本。默认 `"(未填写)"`。
   *
   * Text painted by a node view whose value is empty in fill mode. Default `"(未填写)"`.
   */
  empty: string;

  /**
   * 悬停提示里「描述」一行的标题。默认 `"描述"`。
   *
   * The label of the tip's description row. Default `"描述"`.
   */
  tipDescription: string;

  /**
   * 悬停提示里「默认值」一行的标题。默认 `"默认值"`。
   *
   * The label of the tip's default-value row. Default `"默认值"`.
   */
  tipDefault: string;

  /**
   * 悬停提示里 key 一行的标题。默认 `"key"`（它是标识符，不翻译）。
   *
   * The label of the tip's key row. Default `"key"` — an identifier, deliberately not translated.
   */
  tipKey: string;

  /**
   * 填写值被 `maxLength` 截断时的 `textContent`。默认 `"已超出长度限制"`。
   *
   * `textContent` when a fill value was cut off at `maxLength`. Default `"已超出长度限制"`.
   */
  textOverflow: string;

  /** 默认 `"必填项未填写"`。 / Default `"必填项未填写"`. */
  required: string;

  /** 默认 `"超出允许范围"`。 / Default `"超出允许范围"`. */
  outOfRange: string;

  /** 默认 `"选项不在允许的范围内"`。 / Default `"选项不在允许的范围内"`. */
  selectInvalid: string;

  /** 默认 `"图片体积超出限制"`。 / Default `"图片体积超出限制"`. */
  imageTooLarge: string;

  /** 默认 `"图片地址为空"`。 / Default `"图片地址为空"`. */
  imageEmpty: string;

  /** 默认 `"公式语法错误"`。 / Default `"公式语法错误"`. */
  formulaSyntax: string;

  /** 默认 `"公式引用了循环依赖"`。 / Default `"公式引用了循环依赖"`. */
  formulaCycle: string;

  /** 默认 `"公式引用了不存在的变量"`。 / Default `"公式引用了不存在的变量"`. */
  formulaUnknown: string;

  /** 默认 `"公式计算结果无效"`。 / Default `"公式计算结果无效"`. */
  formulaInvalid: string;
}

/**
 * 调用方可以配置的内容。
 *
 * 每个字段都有默认值，所以 `Variable.configure({ mode: "fill" })` 就是一份完整配置。
 *
 * What a caller may configure.
 *
 * Every field has a default, so `Variable.configure({ mode: "fill" })` is a complete
 * configuration.
 */
export interface VariableOptions {
  /**
   * `"design"` 把每个变量的标签画成徽章，并允许点击打开设计对话框；`"fill"` 把解析后的值画成
   * 普通内联文本。
   *
   * 实时读取，从不复制，所以在 `new Editor()` 之后再翻转它的宿主也照样能用。受支持的方式是
   * `setVariableMode(editor, mode)`，它还会重绘。
   *
   * `"design"` paints each variable's label as a badge and lets a click open the
   * design dialog; `"fill"` paints the resolved value as ordinary inline text.
   *
   * Read live, never copied, so a host that flips it after `new Editor()` still works.
   * The supported way is `setVariableMode(editor, mode)`, which also repaints.
   */
  mode: VariableMode;

  /**
   * 填写数据，按变量键索引。优先用 `setVariableValues`，而不是直接改它。
   *
   * Fill data, keyed by variable key. Prefer `setVariableValues` over mutating this.
   */
  values: VariableFillData;

  /**
   * 调用方的变量目录——旧版的 `innerVariable` 树。
   *
   * 它作为一种*输入方式*保留（`keySource: "inner"`），而不是一种变量类型：它决定用户怎样
   * 挑键，而不是值长什么样。
   *
   * The caller's variable catalogue — the legacy `innerVariable` tree.
   *
   * Kept as an *input method* (`keySource: "inner"`), not as a variable type: it
   * decides how the user picks a key, not what a value looks like.
   */
  innerVariable: InnerVariableNode[];

  /**
   * 文案表。
   *
   * 是完整的表而不是部分的：`addOptions` 会把调用方的覆盖合并到中文默认值之上，而把它标注
   * 为完整，正是让每个使用方读文案时都不必写兜底的原因（在二十个字符串上写 `??` 正是文案表
   * 腐烂的方式）。
   *
   * The message table.
   *
   * A complete table rather than a partial one: `addOptions` merges the caller's
   * overrides over the Chinese defaults, and typing it as complete is what lets every
   * consumer read a message without a fallback (`??` on twenty strings is how a locale
   * table rots).
   */
  locale: VariableLocale;

  /**
   * 用户在设计模式下点击一个变量时调用。
   *
   * 位置在点击时解析（从不提前捕获），因为一个会移动的变量——文档在它上方每敲一个键就会
   * 移动——否则会在过期的地址上被编辑。这种过期正是旧版编辑路径变成静默空操作的原因
   * （缺陷 22）。
   *
   * Called when the user clicks a variable in design mode.
   *
   * The position is resolved at click time (never captured), because a variable
   * that moves — and documents move on every keystroke above it — would otherwise
   * be edited at a stale address. That staleness is what made the legacy edit path
   * a silent no-op (defect 22).
   */
  onRequestEdit?: (attrs: VariableAttrs, pos: number) => void;
}

/**
 * 扩展在运行时保存的内容。
 *
 * 这些都不是 `readonly`：`onCreate` 会填好它们，而 Tiptap 把同一个对象交给每个使用方，所以
 * 扩展负责写，其他人通过 `getVariableMode` / `getVariableValues` / `getVariableStore` 读。
 *
 * What the extension keeps at runtime.
 *
 * None of these are `readonly`: `onCreate` fills them in, and Tiptap hands the same
 * object to every consumer, so the extension writes and everyone else reads through
 * `getVariableMode` / `getVariableValues` / `getVariableStore`.
 */
export interface VariableStorage {
  /**
   * 当前模式；与 store 保持一致，这样普通使用方无需强转。
   *
   * The current mode; kept in step with the store so a plain consumer needs no cast.
   */
  mode: VariableMode;

  /**
   * 当前填写数据；保持一致，这样普通使用方永远不需要 store。
   *
   * The current fill data; kept in step so plain consumers never need the store.
   */
  values: VariableFillData;

  /**
   * 节点视图订阅的那个可观察对象。
   *
   * 由扩展拥有：它在 `onCreate` 里创建，替换它会让现存节点视图持有的每个订阅都失去归属。
   *
   * The observable the node views subscribe to.
   *
   * Owned by the extension: it is created in `onCreate`, and replacing it would orphan
   * every subscription an existing node view holds.
   */
  store: VariableStore;

  /**
   * 文档里的每一个变量，按文档顺序。
   *
   * 放在 storage 上而不只是命令上，是因为 Tiptap 的 `RawCommands` 要求每个命令返回
   * `boolean`，所以列表无法通过命令带回来。等价的自由函数是 `collectDocumentVariables(editor)`。
   *
   * Every variable in the document, in document order.
   *
   * On storage rather than only on the command because Tiptap's `RawCommands` requires
   * every command to return `boolean`, so a list cannot travel back through one. The
   * equivalent free function is `collectDocumentVariables(editor)`.
   */
  getVariables: () => DocumentVariable[];
}

/**
 * `VariableNodeView` 会收到什么。
 *
 * 会变化的值通过函数读取而不是提前捕获：`getMode` 与 `getValues` 是因为捕获到的对象只是
 * 快照，而填写值在文档打开期间一直在变；`getPos` 是因为 ProseMirror 只保证可以在事件处理器
 * 或节点视图回调里调用它，所以位置必须在用到的当下索要。`attrs` 是唯一被捕获的值，视图会在
 * `update` 里刷新它。
 *
 * What a `VariableNodeView` is handed.
 *
 * The changing values are read through functions rather than captured: `getMode` and
 * `getValues` because a captured object is a snapshot, and fill values change constantly
 * while a document is open; `getPos` because ProseMirror only guarantees that it may be
 * called from an event handler or a node view callback, so the position must be asked for
 * at the moment it is used. `attrs` is the one captured value, and the view refreshes it
 * in `update`.
 */
export interface VariableNodeViewContext {
  /**
   * 变量节点所在的编辑器。
   *
   * 是 `Editor` 而不是 `Node` 扩展：节点视图需要属于编辑器的 `view` 与 `state`。读取扩展
   * 自己的选项走的是 {@link VariableNodeViewOptions}，而不是 `editor.options`——后者的类型
   * 是 Tiptap 为它声明的泛型 `Record<string, unknown>`。
   *
   * The editor the variable node lives in.
   *
   * An `Editor`, not the `Node` extension: the node view needs `view` and `state`, which
   * belong to the editor. Reading the extension's own options goes through
   * {@link VariableNodeViewOptions} rather than `editor.options`, whose type is the
   * generic `Record<string, unknown>` Tiptap declares for it.
   */
  editor: Editor;

  /**
   * 节点类型的名字，用于 `data-type` 属性。
   *
   * The node type's name, used for the `data-type` attribute.
   */
  name: string;

  /** 合并后的文案表。 / Merged locale table. */
  locale: VariableLocale;

  /**
   * 视图构建时该节点的属性。
   *
   * 视图保留自己的副本，并在 `update` 里刷新它；没有别的东西读这个节点，所以不存在第二个
   * 可能与之失步的访问器。
   *
   * The node's attributes at the time the view was built.
   *
   * The view keeps its own copy and refreshes it in `update`; nothing else reads the
   * node, so there is no second accessor to fall out of step with it.
   */
  attrs: VariableAttrs;

  /** 当前模式。 / The current mode. */
  getMode: () => VariableMode;

  /** 当前的填写数据。 / The current fill data. */
  getValues: () => VariableFillData;

  /**
   * 节点当前的位置。
   *
   * 只在点击处理器里调用，从不保存。
   *
   * The node's current position.
   *
   * Called from the click handler only, never stored.
   */
  getPos: () => number | undefined;

  /**
   * 宿主的设计模式编辑钩子，已经从扩展选项里取好。
   *
   * 它是被传进来的，而不是通过 `editor.options` 去拿，这样节点视图永远不必假定 Tiptap 泛型
   * `options` 袋子的形状。
   *
   * The host's design-mode edit hook, already read off the extension's options.
   *
   * Passed in rather than reached through `editor.options` so the node view never has to
   * assume a shape for Tiptap's generic `options` bag.
   */
  onRequestEdit?: (attrs: VariableAttrs, pos: number) => void;

  /** 要订阅的 store。 / The store to subscribe to. */
  store: VariableStore;
}

/**
 * `index.ts` 构建视图时所对的接口面。
 *
 * `NodeView` 唯一必填的成员是 `dom`，其余在那里都是可选的，所以在这里要求它们，正是让
 * `nodeView.ts` 的返回值成为一份*可检查的*实现、而不是一袋可有可无的方法的原因。`update`
 * 被收窄成实际用到的那一个参数（`decorationSources` 只对绘制装饰的视图有意义，而本视图不
 * 绘制）——参数更少的函数在 `addNodeView()` 处满足更宽的签名，而那里本来就会把这个值按
 * ProseMirror 真正的 `NodeView` 标注类型。
 *
 * The surface `index.ts` builds a view to.
 *
 * `NodeView`'s only required member is `dom`; everything else is optional there, so
 * requiring them here is what makes `nodeView.ts`'s return value a *checkable*
 * implementation instead of a bag of maybe-methods. `update` is narrowed to the
 * one argument that is actually used (`decorationSources` matters only to views
 * that paint decorations, which this one does not) — a function taking fewer
 * parameters satisfies the wider signature at `addNodeView()`, which types the
 * value against ProseMirror's real `NodeView` anyway.
 */
export interface VariableNodeView extends NodeView {
  /** 视图的元素。 / The view's element. */
  dom: HTMLElement;
  /**
   * 节点变化时刷新视图；已处理时返回 `true`。
   *
   * Refresh the view for a changed node; returns `true` when handled.
   */
  update: (node: ProseMirrorNode, decorations: readonly Decoration[]) => boolean;
  /** 节点被选中时调用。 / Called when the node is selected. */
  selectNode: () => void;
  /** 节点取消选中时调用。 / Called when the node is deselected. */
  deselectNode: () => void;
  /**
   * `true` 时事件不进入 ProseMirror 的输入处理。
   *
   * When `true` the event stays out of ProseMirror's input handling.
   */
  stopEvent: (event: Event) => boolean;
  /**
   * `true` 时 DOM 变更不会被读回文档。
   *
   * When `true` a DOM mutation is not read back into the document.
   */
  ignoreMutation: () => boolean;
  /**
   * 视图销毁时调用，用于清理监听器与订阅。
   *
   * Called when the view is destroyed, to release listeners and subscriptions.
   */
  destroy: () => void;
}
