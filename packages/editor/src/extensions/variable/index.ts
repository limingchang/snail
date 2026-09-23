/**
 * `variable` 节点。
 *
 * ## 一个扩展，两种模式
 *
 * 旧版包有一个用于设计模式的 `Variable` 扩展，以及一个用于填写模式的独立
 * `VariableParser` 扩展；解析器会重写文档，这两半几乎在一切事情上都不一致（缺陷 22–29）。
 * 这里没有解析器。变量是一个内联的**原子**，它的属性始终存在，而 `mode` 只决定节点视图
 * 画什么——标签，还是解析后的值。两种模式下文档 JSON 都是模板，所以在两者之间切换没有代价，
 * 也没有任何东西需要撤销。
 *
 * ## 存了什么
 *
 * 六个属性都被声明，且六个都能熬过一次 HTML 往返。旧版的 `renderHTML` 对 `key`、`desc`、
 * `defaultValue` 与 `data` 返回 `{}`，于是在编辑器内复制一个变量——或导出再重新导入
 * HTML——都会丢掉类型专属配置，而且它从来熬不过一次保存（缺陷 25）。
 *
 * The `variable` node.
 *
 * ## One extension, two modes
 *
 * The legacy package had a `Variable` extension for design mode and a separate
 * `VariableParser` extension for fill mode; the parser rewrote the document and the
 * two halves disagreed about almost everything (defects 22–29). There is no parser
 * here. A variable is an inline **atom** whose attributes are always present, and
 * `mode` decides only what the node view paints — its label, or its resolved value.
 * The document JSON is the template in both modes, so switching between them is free
 * and nothing has to be undone.
 *
 * ## What is stored
 *
 * All six attributes are declared and all six survive an HTML round-trip. The legacy
 * `renderHTML` returned `{}` for `key`, `desc`, `defaultValue` and `data`, so copying
 * a variable inside the editor — or exporting and re-importing HTML — lost the
 * type-specific configuration, and it never survived a save (defect 25).
 */

import { mergeAttributes, Node } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import type {
  VariableAttrs,
  VariableData,
  VariableValue
} from "../../typings/variable";

import { createVariableNodeView } from "./nodeView";
import { createVariableLocale } from "./resolver";
import { VariableStore } from "./store";
import type { VariableMode } from "./store";
import type {
  DocumentVariable,
  VariableLocale,
  VariableOptions,
  VariableStorage
} from "./typing";

/**
 * 重新导出扩展自己的契约，让宿主只从一个地方导入。
 *
 * Re-export the extension's own contract, so a host imports from one place.
 */
export type {
  DocumentVariable,
  VariableLocale,
  VariableNodeViewContext,
  VariableOptions,
  VariableStorage
} from "./typing";
export type { VariableMode } from "./store";
export type {
  ResolvedVariable,
  VariableAttrs,
  VariableData,
  VariableFillData,
  VariableIssue,
  VariableType,
  VariableValue
} from "../../typings/variable";
export { FORMULA_FUNCTIONS, VARIABLE_TYPES } from "../../typings/variable";
export { VariableStore } from "./store";
export {
  createVariableLocale,
  DEFAULT_VARIABLE_LOCALE,
  flattenInnerVariables,
  formulaDependencies,
  resolveDocumentVariables,
  resolveVariable,
  validateFill
} from "./resolver";
export type { PositionedVariable, SystemContext } from "./resolver";
export { evaluateFormula, referencedKeys } from "./formula";
export { renderChineseMoney, applyDatePattern, formatNumber } from "./format";

/**
 * {@link Variable} 的 `renderHTML` 使用的 `data-*` 编码。
 *
 * 下表列出了每个属性承载的内容：`data-type` 是 `parseHTML` 匹配的标记，`data-variable-type`
 * 是为 CSS 与使用方复制的判别字段，`data-variable-label` / `data-variable-key` 对应
 * {@link VariableAttrs.label} / {@link VariableAttrs.key}，`data-variable-desc` 在缺失时不
 * 写出，`data-variable-default` 是 JSON 编码的默认值，`data-variable-key-source` 为
 * `"manual"` 时不写出，`data-variable-config` 是整个 {@link VariableData} 的 JSON。
 *
 * 唯一的结构化属性是 `data-variable-config`：九种变量类型除 `type` 之外没有任何共同点，
 * 所以一个 JSON blob 既更小，也不可能与判别字段失步（不像旧版包里那个姐妹 `type` 属性，
 * 没有任何东西让它保持同步）。`defaultValue` 同样是 JSON，因为它是 `string | number | boolean`，
 * 而 `"false"` 不能读回成 `true`；那些始终是字符串的标量则保持
 * 为普通属性，这样 CSS 选择器或第三方使用方无需解析 JSON 就能读到标签与键。
 *
 * 用 `data-variable-` 前缀而不是 ProseMirror 自动生成的 `data-<attr>`：它让导出的 HTML 带
 * 上命名空间，也意味着重命名某个属性时不会让此前导出的文档失效。
 *
 * The `data-*` encoding used by {@link Variable}'s `renderHTML`.
 *
 * | attribute | carries |
 * | --- | --- |
 * | `data-type` | `"variable"` — the marker `parseHTML` matches on |
 * | `data-variable-type` | the discriminant, duplicated for CSS and for consumers |
 * | `data-variable-label` | {@link VariableAttrs.label} |
 * | `data-variable-key` | {@link VariableAttrs.key} |
 * | `data-variable-desc` | {@link VariableAttrs.desc}, dropped when absent |
 * | `data-variable-default` | {@link VariableAttrs.defaultValue}, JSON-encoded |
 * | `data-variable-key-source` | {@link VariableAttrs.keySource}, dropped when `"manual"` |
 * | `data-variable-config` | the whole {@link VariableData}, JSON-encoded |
 *
 * The one structured attribute is `data-variable-config`: the nine variable types have
 * nothing in common beyond `type`, so one JSON blob is both smaller and impossible to
 * get out of step with the discriminant (unlike the legacy package's sibling `type`
 * attribute, which nothing kept in sync). `defaultValue` is JSON too, because it is a
 * `string | number | boolean` and `"false"` must not read back as `true`; the scalars
 * that are always strings stay as plain attributes so a CSS selector or a third-party
 * consumer can read the label and key without a JSON parse.
 *
 * The `data-variable-` prefix rather than ProseMirror's generated `data-<attr>`: it
 * keeps the exported HTML namespaced, and it means an attribute may be renamed without
 * invalidating previously exported documents.
 */
const ATTR_LABEL = "data-variable-label";
const ATTR_KEY = "data-variable-key";
const ATTR_DESC = "data-variable-desc";
const ATTR_DEFAULT = "data-variable-default";
const ATTR_KEY_SOURCE = "data-variable-key-source";
const ATTR_CONFIG = "data-variable-config";

/**
 * 默认标签。中文默认值，与产品其余部分一致。
 *
 * The default label. A Chinese default, matching the rest of the product.
 */
const DEFAULT_LABEL = "新变量";

/** 默认键。 / The default key. */
const DEFAULT_KEY = "key";

/**
 * 解码一个 JSON 属性。
 *
 * 手工编辑过的文档，或旧版本生成的文档，可能在这些属性里带任何东西。解析失败会回退而不是
 * 抛错：打开一个模板不能因为某个属性格式错误而失败。
 *
 * Decode a JSON attribute.
 *
 * A document edited by hand, or produced by an older version, can carry anything in
 * these attributes. Parsing failures fall back rather than throwing: opening a
 * template must not be able to fail because one attribute is malformed.
 */
function parseJSONAttribute<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Tiptap 交给 `parseHTML` 的元素或字符串参数。
 *
 * 它是 `HTMLElement | string`，因为一条规则也可能针对原始文本匹配。这些属性只会出现在元素
 * 上，所以下面的读取器用 `typeof` 收窄而不是强转：字符串不携带任何属性，这与属性缺失是
 * 同一个答案。
 *
 * The element-or-string argument Tiptap hands `parseHTML`.
 *
 * It is `HTMLElement | string` because a rule may also be matched against raw text.
 * These attributes only ever live on an element, so the readers below narrow on
 * `typeof` rather than casting: a string carries no attribute, which is the same
 * answer as an absent one.
 */
type ParseSource = HTMLElement | string;

/** 读取其中一个纯字符串属性。 / Read one of the plain string attributes. */
const readString =
  (name: string) =>
  (element: ParseSource): string | undefined =>
    typeof element === "string" ? undefined : element.getAttribute(name) ?? undefined;

/**
 * 读取 `defaultValue`，保留它的 JSON 类型。
 *
 * `"0"`、`"false"` 与 `0` 不能互相塌缩成同一个值：默认值是字符串 `"否"` 的 `boolean` 变量
 * 与默认值是 `false` 的变量今天渲染结果相同，但仍然必须往返成它们本来的样子。
 *
 * Read `defaultValue`, preserving its JSON type.
 *
 * `"0"`, `"false"` and `0` must not collapse into each other: a `boolean` variable
 * whose default is the string `"否"` and one whose default is `false` render the same
 * today but must still round-trip as what they were.
 */
const readDefaultValue = (element: ParseSource): VariableValue | undefined => {
  if (typeof element === "string") return undefined;
  const raw = element.getAttribute(ATTR_DEFAULT);
  if (raw === null) return undefined;
  const parsed: unknown = parseJSONAttribute<unknown>(raw, undefined);
  if (parsed === undefined) return undefined;
  if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
    return parsed;
  }
  // A non-scalar default is meaningless for every type in the union; dropping it is
  // better than handing the resolver something it cannot render.
  return undefined;
};

/**
 * 读取类型专属配置，回退到纯文本。
 *
 * Read the type-specific configuration, falling back to plain text.
 */
const readConfig = (element: ParseSource): VariableData => {
  if (typeof element === "string") return { type: "text" };
  const parsed = parseJSONAttribute<VariableData | null>(element.getAttribute(ATTR_CONFIG), null);
  // The discriminant is the contract's own guard: a `data` blob without a known `type`
  // is not usable, and a `text` variable is always a safe reading of "unknown".
  if (parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string") {
    return parsed;
  }
  return { type: "text" };
};

/**
 * 读取 `keySource`。
 *
 * 任何不是 `"inner"` 的值都读作 `"manual"`：来自更新版本的值必须退化为默认值，而不是变成
 * 无法识别的第三种状态。
 *
 * Read `keySource`.
 *
 * Anything that is not `"inner"` reads as `"manual"`: a value from a newer version
 * must degrade to the default rather than become an unrecognised third state.
 */
const readKeySource = (element: ParseSource): "manual" | "inner" => {
  if (typeof element === "string") return "manual";
  return element.getAttribute(ATTR_KEY_SOURCE) === "inner" ? "inner" : "manual";
};

/**
 * 某个属性的 `renderHTML`，其类型使对象字面量保持可检查。
 *
 * The `renderHTML` of an attribute, typed so the object literal stays checkable.
 */
type RenderAttribute = (attributes: Record<string, unknown>) => Record<string, unknown>;

/** 文档中的变量，按文档顺序排列。 / Variables found in a document, in document order. */

/**
 * 每个编辑器各自的 store。
 *
 * 用按编辑器索引的 `WeakMap`，而不是在编辑器上挂一个属性：这个映射不持有强引用，所以被销毁
 * 的编辑器可以被回收，公开的 `Editor` 对象上也没有任何东西被遮蔽。节点视图在构造时通过这个
 * 映射找到自己的 store，这是安全的，因为 Tiptap 会先完成 `createStorage`——因此也完成
 * `onCreate`——再构建视图。
 *
 * The store each editor owns.
 *
 * A `WeakMap` keyed by the editor rather than a property on it: the map holds no
 * strong reference, so a destroyed editor is collectable, and nothing on the public
 * `Editor` object is shadowed. A node view resolves its store through this map at
 * construction, which is safe because Tiptap finishes `createStorage` — and therefore
 * `onCreate` — before it builds the view.
 */
const editorStores = new WeakMap<Editor, VariableStore>();

/**
 * 某个编辑器的 store；扩展未注册时为 `undefined`。
 *
 * The store for an editor, or `undefined` when the extension is not registered.
 */
export function getVariableStore(editor: Editor): VariableStore | undefined {
  return editorStores.get(editor);
}

/**
 * 找到实时的 `variable` 扩展实例。
 *
 * 通过 `extensionManager` 读取，而不是在每个调用点都直接对着
 * `editor.extensionManager.extensions` 取类型，这样唯一需要了解 Tiptap 内部形状的地方
 * 就是这里。
 *
 * Find the live `variable` extension instance.
 *
 * Read through `extensionManager` rather than typed against `editor.extensionManager.extensions`
 * directly at every call site, so the one place that has to know Tiptap's internal shape
 * is here.
 */
function findVariableExtension(editor: Editor): Node<VariableOptions, VariableStorage> | undefined {
  for (const extension of editor.extensionManager.extensions) {
    if (extension.name === "variable") {
      return extension as unknown as Node<VariableOptions, VariableStorage>;
    }
  }
  return undefined;
}

/**
 * 实时扩展里允许辅助函数写入的那几部分。
 *
 * 尽管 Tiptap 会在运行时给它们赋值，而且两个类型都说这些字段可变，
 * `Node<Options, Storage>` 仍把 `options` 与 `storage` 都标成了 `readonly`。这里没有通过
 * 强转成 `any` 来改它们，而是恰好点出会被写入的这两个位置，不多不少。
 *
 * The parts of the live extension the helpers are allowed to write.
 *
 * `Node<Options, Storage>` marks both `options` and `storage` as `readonly`, even though
 * Tiptap assigns into them at runtime and both types say the fields are mutable. Rather
 * than mutating through a cast to `any`, this names exactly the two places that are
 * written and nothing else.
 */
interface MutableVariableExtension {
  options: VariableOptions;
  storage: VariableStorage;
}

/**
 * 实时扩展实例，被看作辅助函数会写入的那几部分。
 *
 * The live extension, viewed as the parts the helpers write.
 */
function mutableVariableExtension(editor: Editor): MutableVariableExtension | undefined {
  const extension = findVariableExtension(editor);
  return extension as unknown as MutableVariableExtension | undefined;
}

/**
 * 当前模式，从 storage 读取，写入方会与之保持一致。
 *
 * The current mode, read from storage, which is what the writers keep in step.
 */
function currentMode(editor: Editor): VariableMode {
  return findVariableExtension(editor)?.storage.mode ?? "design";
}

/**
 * 当前的填写数据，从 storage 读取。
 *
 * `Record<string, VariableValue>` 与 `VariableFillData` 是同一个类型；更窄的写法让「填写
 * 键是标量，不是嵌套对象」这一决定保持可见。
 *
 * The current fill data, read from storage.
 *
 * `Record<string, VariableValue>` and `VariableFillData` are the same type; the narrower
 * spelling keeps the "a fill key is a scalar, not a nested object" decision visible.
 */
function currentValues(editor: Editor): Record<string, VariableValue> {
  return findVariableExtension(editor)?.storage.values ?? {};
}

/**
 * 切换模式并重绘。
 *
 * 只写选项不会重绘任何东西：ProseMirror 只为文档与选区变化派发 `update` 事件，所以必须
 * 通知节点视图。store 的 `emit` 就是那个通知，节点视图在重绘时读取新的模式。
 *
 * Switch modes and repaint.
 *
 * Writing the option alone would not repaint anything: ProseMirror dispatches an
 * `update` event only for document and selection changes, so a node view has to be
 * told. The store's `emit` is that notification, and the node views read the new mode
 * when they repaint.
 *
 * @param editor 配置了 `variable` 扩展的编辑器 /
 *   - the editor whose `variable` extension is configured.
 * @param mode `"design"` 画标签，`"fill"` 画取值 /
 *   - `"design"` paints labels, `"fill"` paints values.
 * @returns 扩展未注册时返回 `false`，与 Tiptap 的命令约定一致，调用方据此可以区分「无事可做」
 *   与「已完成」 /
 *   `false` when the extension is not registered, mirroring Tiptap's command
 *   convention so a caller can tell "nothing to do" from "done".
 */
export function setVariableMode(editor: Editor, mode: VariableMode): boolean {
  const extension = mutableVariableExtension(editor);
  if (!extension) return false;
  extension.options.mode = mode;
  extension.storage.mode = mode;
  // `setMode` is what actually reaches the node views. Writing the option alone would
  // not: ProseMirror dispatches an `update` event only for document and selection
  // changes, and a mode change is neither.
  editorStores.get(editor)?.setMode(mode);
  return true;
}

/**
 * 替换填写数据并重绘。
 *
 * 理由与 {@link setVariableMode} 相同：每个节点视图都实时读取这些值，所以只需要把通知送出去。
 *
 * Replace the fill data and repaint.
 *
 * Same reasoning as {@link setVariableMode}: the values are read live by every node
 * view, so only the notification has to travel.
 *
 * @param editor 配置了 `variable` 扩展的编辑器 /
 *   - the editor whose `variable` extension is configured.
 * @param values 完整的填写数据。它是替换而不是合并：一个清空过字段的对话框必须能把它清掉 /
 *   - the complete fill data. It replaces, not merges: a dialog that has
 *   cleared a field must be able to clear it.
 */
export function setVariableValues(editor: Editor, values: Record<string, VariableValue>): boolean {
  const extension = mutableVariableExtension(editor);
  if (!extension) return false;
  extension.options.values = values;
  extension.storage.values = values;
  editorStores.get(editor)?.setValues(values);
  return true;
}

/**
 * 当前模式，供需要渲染开关的宿主使用。
 *
 * The current mode, for a host that needs to render a toggle.
 */
export function getVariableMode(editor: Editor): VariableMode {
  return currentMode(editor);
}

/**
 * 当前的填写数据，供需要把它交给表单的宿主使用。
 *
 * The current fill data, for a host that needs to hand it to a form.
 */
export function getVariableValues(editor: Editor): Record<string, VariableValue> {
  return currentValues(editor);
}

/**
 * 收集文档里的每一个变量。
 *
 * 它既是命令也是自由函数，因为填写对话框需要在任何事务运行之前就拿到这份列表。
 *
 * Collect every variable in the document.
 *
 * A free function as well as a command, because the fill dialog needs the list before
 * any transaction has run.
 */
export function collectDocumentVariables(editor: Editor): DocumentVariable[] {
  const collected: DocumentVariable[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "variable") {
      collected.push({ pos, attrs: node.attrs as VariableAttrs });
    }
    return true;
  });
  return collected;
}

/**
 * `pos` 位于一个内容表达式接受该变量的节点内部时返回 `true`。
 *
 * `NodeType.validContent` 是 schema 在问自己这个问题，这也是唯一与插入接下来要做的事
 * 一致的答案。`doc` 由外部传入，因此检查针对的是正在构建的事务，而不是已提交的状态。
 *
 * `true` when `pos` sits inside a node whose content expression accepts the variable.
 *
 * `NodeType.validContent` is the schema asking itself the question, which is the only
 * answer that agrees with what the insertion will do next. `doc` is passed in so the
 * check is made against the transaction being built rather than the committed state.
 */
function canInsertInlineAt(editor: Editor, pos: number, doc: ProseMirrorNode): boolean {
  try {
    // The probe is created without attributes: `validContent` checks types, and the
    // real node is created once, at the position that was chosen.
    const probe = editor.schema.nodes.variable?.create();
    if (!probe) return false;
    return doc.resolve(pos).parent.type.validContent(Fragment.from(probe));
  } catch {
    return false;
  }
}

/**
 * `pos` 处或之后最近的、可以接受内联节点的位置。
 *
 * 旧版缺陷 29：当选区是一个块级 `NodeSelection`（图片、水平分割线）时，`insertVariable`
 * 会抛错，因为内联节点无法存在于块级原子内部。向两侧扫描出最近合法槽位，可以让插入停留在
 * 用户原本所在的位置附近，而不是直接失败。
 *
 * The nearest position at or after `pos` that accepts an inline node.
 *
 * Legacy defect 29: `insertVariable` threw when the selection was a block
 * `NodeSelection` (an image, a horizontal rule), because an inline node cannot live
 * inside a block atom. Scanning outward for the nearest legal slot keeps the insertion
 * near where the user was instead of failing.
 */
function findInsertPosition(editor: Editor, pos: number, doc: ProseMirrorNode): number | undefined {
  // A paragraph may hold the inserted content, so `pos` directly is tried first: it is
  // the exact place the user asked for.
  if (canInsertInlineAt(editor, pos, doc)) return pos;

  // Then outward, forward before backward: a user who selected a block node and asked
  // for a variable more plausibly means "after it" than "before it".
  for (let distance = 1; distance <= doc.content.size; distance++) {
    const forward = pos + distance;
    const backward = pos - distance;
    if (forward <= doc.content.size && canInsertInlineAt(editor, forward, doc)) return forward;
    if (backward >= 1 && canInsertInlineAt(editor, backward, doc)) return backward;
  }

  return undefined;
}

/**
 * 文档最后一个文本块的末尾，用于没有更好去处的插入。
 *
 * The end of the document's last text block, for an insertion with nowhere better to go.
 */
function documentEnd(editor: Editor): number | undefined {
  let found: number | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock) found = pos + 1 + node.content.size;
    return true;
  });
  return found;
}

/** `variable` 节点扩展。 / The `variable` node extension. */
export const Variable = Node.create<VariableOptions, VariableStorage>({
  name: "variable",

  /**
   * 内联，而且是一个**原子**。
   *
   * `atom: true` 是旧版缺陷 24 的修复。旧节点是 `content: "text*"` 且没有 `contentDOM`，
   * 于是光标可能停在一个不可见的节点里，Backspace 删掉隐藏的内容，节点获得了内容，解析器
   * 随后把它误认成容器而不再做替换。原子根本没有内容，所以那种状态不可能存在——光标也无法
   * 进入它，这一点由 {@link createVariableNodeView} 的 `stopEvent` 在输入层强化。
   *
   * Inline, and an **atom**.
   *
   * `atom: true` is the fix for legacy defect 24. The legacy node was `content: "text*"`
   * with no `contentDOM`, so a caret could be parked inside an invisible node, Backspace
   * deleted hidden content, the node gained content, and the parser then mistook it for a
   * container and stopped substituting it. An atom has no content at all, so that state
   * cannot exist — and the caret cannot enter it, which is what
   * {@link createVariableNodeView}'s `stopEvent` reinforces at the input layer.
   */
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  /**
   * 不可拖拽。
   *
   * 拖拽正是变量跑到 schema 允许、但合同不允许的位置的方式，而旧节点让一次拖拽悄悄把签名
   * 变量移出它所在的条款。选中再重新插入则是显式的。
   *
   * Not draggable.
   *
   * Dragging is how a variable ends up somewhere the schema allows but the contract does
   * not, and the legacy node let a drag silently move a signature variable out of its
   * clause. Selecting and re-inserting is explicit.
   */
  draggable: false,

  /**
   * 没有内容，所以这个节点恰好占一个位置——这正是分页偏移与 `descendants` 位置能和渲染出的
   * 文本一致的原因。
   *
   * No content, so the node is exactly one position — which is what makes pagination
   * offsets and `descendants` positions agree with the rendered text.
   */
  // `atom` implies an empty content expression; stating it keeps the schema readable.

  addOptions() {
    return {
      mode: "design",
      values: {},
      innerVariable: [],
      // Merged eagerly so no consumer has to remember that the table is partial.
      locale: createVariableLocale(),
      onRequestEdit: undefined
    };
  },

  addStorage() {
    /**
     * 实时扩展实例。
     *
     * `addStorage` 自己的 `this` 在 Tiptap 的类型里是 `{ name, options, parent }` 这个
     * 形状，但在运行时它*就是*扩展对象，而该对象稍后会在 `createExtension` 里获得 `editor`
     * 属性。`Node<Options, Storage>` 没有声明那个属性，所以这里把 Tiptap 唯一没有标注类型的
     * 结构事实点明一次。
     *
     * The live extension instance.
     *
     * `addStorage`'s own `this` is Tiptap's declared `{ name, options, parent }` shape,
     * but at runtime it *is* the extension object, which acquires the `editor` property a
     * moment later in `createExtension`. `Node<Options, Storage>` does not declare that
     * property, so the one structural fact Tiptap does not type is named here, once.
     */
    const extension = this as unknown as { editor: Editor };

    /**
     * 三份初值都直接取扩展的配置，存值对象也在这里建好。
     *
     * `storage.mode` 是节点视图判断当前处于设计模式还是填写模式的唯一来源，而
     * `setVariableMode` 是它唯一的写入者。编辑器创建时那条命令不会运行，所以如果这里写死
     * `"design"`，一个以 `Variable.configure({ mode: "fill" })` 建起来的编辑器就会一直把
     * 自己报告成设计模式。
     *
     * 存值对象必须在这里建、并且被 `onCreate` 原样沿用，而不是在 `onCreate` 里重建：Tiptap
     * 的 `create` 事件是从一个零延时定时器里发出来的，而节点视图在挂载时就已建好并订阅了
     * 当时读到的那一个 store。若 `onCreate` 换一个新的，这些节点视图就会订阅到一个再也不会
     * 被通知的对象——填写值与模式的变化都到不了它们那里。
     *
     * All three initial values come from the extension options, and the store is built here.
     *
     * `storage.mode` is the single source of truth the node view reads to tell design mode from fill
     * mode, and `setVariableMode` is its only writer. That command does not run while the editor is
     * being created, so hardcoding `"design"` here would leave an editor built from
     * `Variable.configure({ mode: "fill" })` reporting itself as design mode.
     *
     * The store has to be built here and reused as-is by `onCreate` rather than rebuilt there:
     * Tiptap emits its `create` event from a zero-delay timer, while node views are built at mount
     * time and subscribe to whichever store they read then. A fresh instance in `onCreate` would
     * leave those node views subscribed to an object nothing ever notifies — neither fill values
     * nor mode changes would reach them.
     */
    const mode = this.options.mode ?? "design";
    const values = this.options.values ?? {};

    return {
      mode,
      values,
      store: new VariableStore(values, mode),
      /**
       * 文档里的每一个变量，实时读取。
       *
       * 用扩展自己的访问器而不是命令，因为 Tiptap 的 `RawCommands` 要求命令返回 `boolean`，
       * 而这份列表必须以别的方式带回来。在调用时读取 `extension.editor`，意味着它跟随的是
       * 编辑器本身，而不是创建时拍下的快照。
       *
       * Every variable in the document, read live.
       *
       * The extension's own accessor rather than the command, because Tiptap's
       * `RawCommands` requires a command to return `boolean` and the list has to come
       * back some other way. Reading `extension.editor` at call time means this follows
       * the editor rather than a snapshot taken at creation.
       */
      getVariables: (): DocumentVariable[] => collectDocumentVariables(extension.editor)
    };
  },

  onCreate() {
    const editor = this.editor;
    const extension = this;

    // The store is the single notification channel for both value and mode changes. It is the
    // one `addStorage` built — reusing it, not replacing it, is what keeps the node views built
    // at mount time subscribed to the object that gets notified (see `addStorage`). It writes
    // back into storage so plain consumers (`editor.storage.variable.values`) never read a
    // stale copy.
    const store = this.storage.store;
    const originalSetValues = store.setValues.bind(store);
    store.setValues = (values) => {
      const fill = { ...values };
      originalSetValues(fill);
      extension.storage.values = fill;
      extension.options.values = fill;
    };

    this.storage.mode = this.options.mode;
    this.storage.values = { ...(this.options.values ?? {}) };
    // A no-op when the mode already matches; it only repaints if something raced ahead.
    store.setMode(this.storage.mode);

    editorStores.set(editor, store);
  },

  addAttributes() {
    return {
      /**
       * 在文档里和变量列表里显示的文本。
       *
       * Shown in the document and in the variable list.
       */
      label: {
        default: DEFAULT_LABEL,
        parseHTML: readString(ATTR_LABEL),
        renderHTML: ((attributes) => ({ [ATTR_LABEL]: attributes.label })) satisfies RenderAttribute
      },

      /**
       * 填写数据据此查找的键。
       *
       * The key the fill data is looked up by.
       */
      key: {
        default: DEFAULT_KEY,
        parseHTML: readString(ATTR_KEY),
        renderHTML: ((attributes) => ({ [ATTR_KEY]: attributes.key })) satisfies RenderAttribute
      },

      /**
       * 可选备注。缺失就保持缺失，所以空的描述不会添加任何属性。
       *
       * Optional note. Absent stays absent, so an empty description adds no attribute.
       */
      desc: {
        default: undefined,
        parseHTML: readString(ATTR_DESC),
        renderHTML: ((attributes) =>
          attributes.desc === undefined ? {} : { [ATTR_DESC]: attributes.desc }) satisfies RenderAttribute
      },

      /**
       * 填写数据没有提供值时使用的值。
       *
       * Value used when the fill data supplies none.
       */
      defaultValue: {
        default: undefined,
        parseHTML: readDefaultValue,
        renderHTML: ((attributes) =>
          attributes.defaultValue === undefined
            ? {}
            : { [ATTR_DEFAULT]: JSON.stringify(attributes.defaultValue) }) satisfies RenderAttribute
      },

      /**
       * 类型及其配置，作为一个 JSON blob。
       *
       * `type` 放在它内部而不是旁边：契约把配置做成可判别联合，所以单独的类型属性只能成为
       * 第二个真相来源。
       *
       * The type and its configuration, as one JSON blob.
       *
       * The `type` lives inside it rather than beside it: the contract makes the
       * configuration a discriminated union, so a separate type attribute could only
       * ever be a second source of truth.
       */
      data: {
        default: { type: "text" } as VariableData,
        parseHTML: readConfig,
        renderHTML: ((attributes) => ({
          [ATTR_CONFIG]: JSON.stringify(attributes.data ?? { type: "text" })
        })) satisfies RenderAttribute
      },

      /**
       * 键是如何选定的。`"manual"` 是默认值，不会被写出。
       *
       * How the key was chosen. `"manual"` is the default and is not written out.
       */
      keySource: {
        default: "manual",
        parseHTML: readKeySource,
        renderHTML: ((attributes) =>
          attributes.keySource === "inner" ? { [ATTR_KEY_SOURCE]: "inner" } : {}) satisfies RenderAttribute
      }
    };
  },

  parseHTML() {
    return [
      {
        // `span` with the marker attribute, rather than the CSS selector
        // `span[data-type='variable']`: the attribute check is what actually decides the
        // match, and keeping the tag simple means the rule works with a plain
        // `document.createElement("span")` stub as well as with a real DOM.
        tag: "span",
        getAttrs: (element: ParseSource) =>
          typeof element !== "string" && element.getAttribute("data-type") === "variable" ? {} : false
      }
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as VariableAttrs;

    /**
     * 一个**叶子**节点的 spec 里不能有内容占位符。
     *
     * 中文：`variable` 是 `atom: true` 的内联原子，也就是说它没有内容 —— 而 `0` 的含义正是「节点的内容
     * 放这里」。ProseMirror 的 `DOMSerializer.serializeNodeInner` 看到叶子带占位符就直接抛
     * `RangeError: Content hole not allowed in a leaf node spec`，于是**任何含变量的文档**
     * `getHTML()` 都会失败 —— 也就是 `onChange` / `update:modelValue` / 导出 HTML 的保存路径全都断在
     * 这里。这里改为渲染出与节点视图一致的标签文本（嵌一层元素，不是占位符），导出的文档因此既有意义
     * 又合法。
     *
     * A **leaf** node's spec may not contain a content hole.
     *
     * `variable` is an `atom: true` inline node, i.e. it has no content — while `0` means "the node's content
     * goes here". ProseMirror's `DOMSerializer.serializeNodeInner` throws
     * `RangeError: Content hole not allowed in a leaf node spec` when a leaf carries one, so `getHTML()`
     * failed for **every document containing a variable** — which is the whole `onChange` /
     * `update:modelValue` / export-to-HTML save path. This renders the same label the node view paints
     * (as a nested element, not a hole), so an exported document is both meaningful and valid.
     *
     * `data-variable-type` is duplicated out of the config blob for CSS and for a consumer that wants to
     * style by type without parsing JSON — see the table above for the whole encoding.
     */
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "variable",
        "data-variable-type": attrs.data.type
      }),
      ["span", { class: "s-editor-variable-content" }, attrs.label]
    ];
  },

  addNodeView() {
    return (props) => {
      // `props.editor` is the `Editor`, which is what the node view needs for `view` and
      // `state`; the extension instance is found separately for its options and storage.
      const host = props.editor as unknown as Editor;
      const extension = findVariableExtension(host);
      const locale: VariableLocale = extension?.options.locale ?? createVariableLocale();
      const store = editorStores.get(host) ?? extension?.storage.store;

      // A node view cannot be built without a store to subscribe to. Refusing loudly is
      // better than a view that never repaints: the only way to get here is a host that
      // somehow created a view before `onCreate`.
      if (!store) throw new Error("[snail] the variable store is unavailable; the extension was not initialised");

      return createVariableNodeView({
        editor: host,
        name: "variable",
        locale,
        attrs: props.node.attrs as VariableAttrs,
        getMode: () => currentMode(host),
        getValues: () => currentValues(host),
        getPos: () => props.getPos(),
        onRequestEdit: extension?.options.onRequestEdit,
        store
      });
    };
  },

  addCommands() {
    return {
      /**
       * 在选区处插入一个变量。
       *
       * 没有合法位置放置内联节点时返回 `false` 而不是抛错——旧版缺陷 29：块级
       * `NodeSelection` 让 ProseMirror 抛出 `ReplaceError`，最终以「插入失败」呈现给用户。
       * 拿到 `false` 的宿主可以改为告诉用户该点哪里。
       *
       * Insert a variable at the selection.
       *
       * Returns `false` instead of throwing when there is nowhere legal to put an inline
       * node — legacy defect 29, where a block `NodeSelection` made ProseMirror raise a
       * `ReplaceError` that surfaced to the user as "插入失败". A host that gets `false`
       * can tell the user where to click instead.
       */
      insertVariable:
        (attrs: Partial<VariableAttrs>) =>
        ({ tr, dispatch, editor }) => {
          const type = tr.doc.type.schema.nodes.variable ?? editor.schema.nodes.variable;
          if (!type) return false;

          const node = type.create(attrs);
          // `tr.selection`, not `state.selection`: the transaction is the authoritative
          // view of the selection at the moment of the insert.
          const insertAt = findInsertPosition(editor, tr.selection.from, tr.doc);
          const target = insertAt ?? documentEnd(editor);
          if (target === undefined) return false;

          if (dispatch) {
            // The transaction is used rather than `insertContent` because the position
            // has already been chosen and validated, and `insertContent` would re-apply
            // its own "setTextSelection" behaviour on an atom.
            tr.insert(target, node);
            tr.setSelection(NodeSelection.create(tr.doc, target));
          }
          return true;
        },

      /**
       * 替换一个变量的属性。
       *
       * 按位置寻址，而不是按选区——旧版缺陷 22：除非 `NodeSelection` 恰好正落在该节点上，
       * `updateAttributes("variable", …)` 会悄无声息地什么都不做，而且会把同样的属性应用到
       * 一个区间内的每一个变量上。
       *
       * Replace a variable's attributes.
       *
       * Addressed by position, not by the selection — legacy defect 22, where
       * `updateAttributes("variable", …)` silently did nothing unless a `NodeSelection`
       * happened to sit exactly on the node, and applied the same attributes to every
       * variable in a range.
       */
      updateVariable:
        (pos: number, attrs: Partial<VariableAttrs>) =>
        ({ state, tr, dispatch }) => {
          const current = state.doc.nodeAt(pos);
          if (!current || current.type.name !== "variable") return false;

          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs });
          }
          return true;
        },

      /**
       * 按位置删除一个变量。位置不是变量时返回 `false`。
       *
       * Delete a variable by position. Returns `false` for a position that is not one.
       */
      removeVariable:
        (pos: number) =>
        ({ state, tr, dispatch }) => {
          const current = state.doc.nodeAt(pos);
          if (!current || current.type.name !== "variable") return false;

          if (dispatch) tr.delete(pos, pos + current.nodeSize);
          return true;
        },

      /**
       * 报告变量列表是可以取到的。
       *
       * Tiptap 的 `RawCommands` 要求每个命令返回 `boolean`，所以列表本身无法通过返回值带回。
       * 命令运行时编辑器已经存在，所以 `true` 是老实的答案，而不是一个桩。请用
       * {@link collectDocumentVariables} 或扩展自己的 `storage.getVariables()` 读取列表。
       *
       * Report that the variable list is reachable.
       *
       * Tiptap's `RawCommands` requires every command to return `boolean`, so the list
       * itself cannot travel back through the return value. At the time a command runs
       * the editor exists, so `true` is the honest answer rather than a stub. Read the
       * list with {@link collectDocumentVariables} or the extension's
       * `storage.getVariables()`.
       */
      getVariables:
        () =>
        () =>
          true
    };
  }
});

/**
 * 扩展添加的命令。
 *
 * 声明在这里而不是 `typings/variable.ts`，因为 Tiptap 的模块增强是 `@tiptap/core` 模块图上
 * 一个没有任何运行时代码的副作用，它应当紧挨着实现它的 `addCommands`。
 *
 * The commands the extension adds.
 *
 * Declared here rather than in `typings/variable.ts` because a Tiptap module
 * augmentation is a runtime-free side effect on the `@tiptap/core` module graph, and it
 * belongs beside the `addCommands` that implements it.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variable: {
      /**
       * 在选区处插入一个变量；没有合法槽位时返回 `false`。
       *
       * Insert a variable at the selection, or `false` when there is no legal slot.
       */
      insertVariable: (attrs: Partial<VariableAttrs>) => ReturnType;

      /**
       * 替换 `pos` 处的变量。该位置是别的东西时返回 `false`。
       *
       * Replace the variable at `pos`. `false` when the position holds something else.
       */
      updateVariable: (pos: number, attrs: Partial<VariableAttrs>) => ReturnType;

      /**
       * 删除 `pos` 处的变量。该位置是别的东西时返回 `false`。
       *
       * Delete the variable at `pos`. `false` when the position holds something else.
       */
      removeVariable: (pos: number) => ReturnType;

      /**
       * 报告变量列表是可以取到的。
       *
       * `RawCommands` 要求返回 `boolean`，所以列表无法通过返回值带回。请用
       * {@link collectDocumentVariables} 或扩展自己的 `getVariables()` 读取它。
       *
       * Report that the variable list is reachable.
       *
       * `RawCommands` requires `boolean`, so the list cannot travel back through the
       * return value. Read it with {@link collectDocumentVariables} or the extension's
       * own `getVariables()`.
       */
      getVariables: () => ReturnType;
    };
  }
}

/**
 * 默认导出，这样 `import Variable from "./variable"` 也能用。
 *
 * The default export, so `import Variable from "./variable"` also works.
 */
export default Variable;
