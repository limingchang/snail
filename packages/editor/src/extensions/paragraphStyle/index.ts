/**
 * `paragraphStyle` 扩展 —— 首行缩进与段前/段后间距。
 *
 * ## 为什么保留它
 *
 * Tiptap 3 没有等价物。`LineHeight` 是一个**标记**，因此无法表达首行缩进（标记作用于文本，而不是
 * 块的首行），而且文本一被拆分它就被丢弃；`TextAlign` 则是正交的。缩进与段落间距是块的属性，
 * 而合同的条款编号依赖它们。
 *
 * ## 相对旧扩展修好的地方
 *
 * - **`textIndent` 默认是 `null`，而不是 `"0"`。** 默认值为 `"0"` 时，每个文档里的每个段落都会
 *   携带并渲染 `text-indent: 0;`，每次保存都把它序列化，而工具栏无法区分「用户设成了 0」与
 *   「从未设置」。
 * - **一条命令，`setParagraphStyle(attrs)`**，在**一个**事务里作用于整个选区。旧版本会先构建
 *   一个位置列表，然后每个节点的每个属性都调用一次 `setNodeAttribute`；现在每个发生变化的块只用
 *   一次 `setNodeMarkup`，都在同一个事务上，所以一次撤销就能反转一条命令。
 * - **`false` 表示「什么都没变」，且静默。** 旧实现返回 `false` *并且*打日志（「没有需要更新的
 *   节点」），使用方既无法据以行动，又刷屏了控制台。
 * - **完全没有 `console.log`。** 旧实现在 `renderHTML` 里也有一条，于是每个段落的每次渲染都会
 *   打印日志。
 * - **折叠的光标以光标所在的块为目标。** 空范围上的 `nodesBetween(from, to)` 在光标位于块边界时
 *   会选中*下一个*块 —— 所以在一个段落末尾点击会改到后面那一段的样式。
 *
 * ## `extensions/textIndent/` 有意不移植
 *
 * 它是死代码（从未被导入），声明了一个*重复的* `textIndent` 全局属性，并且它的命令被注释掉了。
 * 移植它会把同一个属性的两个定义放进 schema。
 *
 * The `paragraphStyle` extension — first-line indent and space before/after.
 *
 * ## Why it is kept
 *
 * Tiptap 3 has no equivalent. `LineHeight` is a **mark**, so it cannot express a first-line
 * indent (a mark applies to text, not to a block's first line) and it is dropped whenever the
 * text is split; `TextAlign` is orthogonal. Indent and paragraph spacing are properties of the
 * block, and a contract's clause numbering depends on them.
 *
 * ## What is fixed from the legacy extension
 *
 * - **`textIndent` defaults to `null`, not `"0"`.** With a `"0"` default every paragraph in
 *   every document carried and rendered `text-indent: 0;` and serialised it on every save, and
 *   the toolbar could not tell "the user set 0" from "never set".
 * - **One command, `setParagraphStyle(attrs)`**, over the whole selection in **one**
 *   transaction. The legacy version built a list of positions and called `setNodeAttribute`
 *   once per attribute per node; there is now one `setNodeMarkup` per changed block, on one
 *   transaction, so one undo step reverses one command.
 * - **`false` means "nothing changed", silently.** The legacy returned `false` *and* logged
 *   ("没有需要更新的节点"), which no host could act on and which flooded the console.
 * - **No `console.log` at all.** The legacy had one in `renderHTML` as well, so every render
 *   of every paragraph logged.
 * - **A collapsed caret targets the block the caret is in.** `nodesBetween(from, to)` on an
 *   empty range picks the *next* block when the caret sits at a block boundary — so clicking
 *   at the end of one paragraph would have restyled the following one.
 *
 * ## `extensions/textIndent/` is deliberately not ported
 *
 * It was dead code (never imported), declared a *duplicate* `textIndent` global attribute, and
 * had its command commented out. Porting it would put two definitions of the same attribute
 * into the schema.
 */

import { Extension } from "@tiptap/core";

import { changedParagraphStyleAttrs, normalizeParagraphStyleValue } from "./units";
import type {
  ParagraphStyleAttrs,
  ParagraphStyleOptions,
  ParagraphStyleState,
  ParagraphStyleTarget
} from "./typing";

/**
 * 重新导出契约，让使用方从一处导入所有内容。
 *
 * Re-export the contract, so a host imports everything from one place.
 */
export type {
  ParagraphStyleAttrs,
  ParagraphStyleOptions,
  ParagraphStyleState,
  ParagraphStyleTarget,
  ParagraphStyleUnit,
  ParagraphStyleValue,
  ParsedParagraphLength,
  PixelsContext
} from "./typing";
export { PARAGRAPH_STYLE_ATTRIBUTES, PARAGRAPH_STYLE_UNITS } from "./typing";
export {
  changedParagraphStyleAttrs,
  formatParagraphLength,
  normalizeParagraphStyleValue,
  paragraphStyleDeclarations,
  paragraphStyleString,
  parseParagraphLength,
  readComputedLengthPixels,
  toPixels
} from "./units";

/**
 * 收集一次补丁会改变的块。
 *
 * 之所以导出，是因为它承担了这条命令的全部决策，可以在没有编辑器实例的情况下针对文档验证。
 *
 * 非空选区使用 `nodesBetween`，它会访问范围*内部*的每一个块（包括列表项的块，以及该范围覆盖的
 * 每一页里的段落）。折叠的光标则解析自己所在的块：空范围上的 `nodesBetween` 偏向边界之后的那个
 * 块，而那不是用户光标所在的地方。
 *
 * Collect the blocks a patch would change.
 *
 * Exported because it is the whole of the command's decision-making and can be verified
 * against a document without an editor instance.
 *
 * A non-empty selection uses `nodesBetween`, which visits every block *inside* the range
 * (including the blocks of a list item, and the paragraphs of every page the range covers).
 * A collapsed caret resolves its own block instead: `nodesBetween` on an empty range is
 * boundary-biased towards the following block, which is not where the user's caret is.
 */
export function collectParagraphStyleTargets(
  state: ParagraphStyleState,
  types: readonly string[],
  patch: ParagraphStyleAttrs
): ParagraphStyleTarget[] {
  const candidates: Array<{ pos: number; attrs: ParagraphStyleAttrs }> = [];

  if (state.selection.empty) {
    const $from = state.selection.$from;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (!types.includes(node.type.name)) continue;
      candidates.push({ pos: $from.before(depth), attrs: node.attrs as ParagraphStyleAttrs });
      break;
    }
  } else {
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (types.includes(node.type.name)) {
        candidates.push({ pos, attrs: node.attrs as ParagraphStyleAttrs });
      }
      // `true` keeps descending: a block inside the selection may itself contain blocks
      // (a list item holds its paragraphs).
      return true;
    });
  }

  const targets: ParagraphStyleTarget[] = [];
  for (const candidate of candidates) {
    const changed = changedParagraphStyleAttrs(candidate.attrs, patch);
    if (!changed) continue;
    // The *complete* attribute set is written, so `setNodeMarkup` cannot silently drop an
    // attribute it was not told about.
    targets.push({ pos: candidate.pos, attrs: { ...candidate.attrs, ...changed } });
  }

  return targets;
}

/** `paragraphStyle` 扩展。 / The `paragraphStyle` extension. */
export const ParagraphStyle = Extension.create<ParagraphStyleOptions>({
  name: "paragraphStyle",

  addOptions() {
    return {
      types: ["paragraph", "heading"]
    };
  },

  addGlobalAttributes() {
    // Read once: the three attributes share the option, and the `renderHTML` closures below
    // must not depend on `this` being the extension at render time.
    const types = [...this.options.types];

    return [
      {
        types,
        attributes: {
          /**
           * 首行缩进，对应 CSS 的 `text-indent`。
           *
           * 是 `null` —— 而不是 `"0"` —— 这样未设样式的段落不携带属性、不渲染声明、也不序列化
           * 任何东西。
           *
           * First-line indent, as CSS `text-indent`.
           *
           * `null` — not `"0"` — so an unstyled paragraph carries no attribute, renders no
           * declaration and serialises nothing.
           */
          textIndent: {
            default: null,
            // `|| undefined` turns an absent inline style (`""`) into "no value", which leaves
            // the default in place. Returning `""` instead would write `text-indent: ;`.
            parseHTML: (element: HTMLElement): string | undefined =>
              element.style.textIndent || undefined,
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = normalizeParagraphStyleValue(attributes.textIndent);
              return value === null || value === undefined ? {} : { style: `text-indent: ${value};` };
            }
          },

          /**
           * 段前间距，即 CSS 的 `margin-block-start`。
           *
           * Space before the paragraph, as CSS `margin-block-start`.
           */
          paragraphStart: {
            default: null,
            parseHTML: (element: HTMLElement): string | undefined =>
              element.style.marginBlockStart || undefined,
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = normalizeParagraphStyleValue(attributes.paragraphStart);
              return value === null || value === undefined
                ? {}
                : { style: `margin-block-start: ${value};` };
            }
          },

          /**
           * 段后间距，即 CSS 的 `margin-block-end`。
           *
           * Space after the paragraph, as CSS `margin-block-end`.
           */
          paragraphEnd: {
            default: null,
            parseHTML: (element: HTMLElement): string | undefined =>
              element.style.marginBlockEnd || undefined,
            renderHTML: (attributes: Record<string, unknown>) => {
              const value = normalizeParagraphStyleValue(attributes.paragraphEnd);
              return value === null || value === undefined
                ? {}
                : { style: `margin-block-end: ${value};` };
            }
          }
        }
      }
    ];
  },

  addCommands() {
    const extension = this;

    return {
      /**
       * 把段落样式施加到选区里的每一个块上。
       *
       * 补丁里的 `undefined` 表示「不要动这个属性」；`null` 或 `""` 表示「移除它」。当选区里没有
       * 任何会真正改变的块时返回 `false` —— 不派发任何事务，因此也不产生撤销记录。
       *
       * Apply a paragraph style to every block in the selection.
       *
       * `undefined` in the patch means "leave this attribute alone"; `null` or `""` means
       * "remove it". Returns `false` — without dispatching anything, so without an undo
       * entry — when the selection has no block that would actually change.
       */
      setParagraphStyle:
        (attrs: ParagraphStyleAttrs) =>
        ({ state, tr, dispatch }) => {
          const targets = collectParagraphStyleTargets(state, extension.options.types, attrs);
          if (targets.length === 0) return false;

          // `dispatch` is absent for a `can()`/dry-run call; the answer is still "yes, this
          // would change something", which is what the caller is asking.
          if (!dispatch) return true;

          for (const target of targets) {
            // `setNodeMarkup` rather than `setNodeAttribute` per key: one step per block, so
            // one user action is one undo step even when all three attributes change.
            tr.setNodeMarkup(target.pos, undefined, target.attrs);
          }

          dispatch(tr);
          return true;
        }
    };
  }
});

/** 该扩展添加的命令。 / The commands the extension adds. */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphStyle: {
      /**
       * 在选区上设置首行缩进和/或段落间距。
       *
       * Set first-line indent and/or paragraph spacing over the selection.
       */
      setParagraphStyle: (attrs: ParagraphStyleAttrs) => ReturnType;
    };
  }
}

/**
 * 默认导出，因此 `import ParagraphStyle from "./paragraphStyle"` 同样可用。
 *
 * The default export, so `import ParagraphStyle from "./paragraphStyle"` also works.
 */
export default ParagraphStyle;
