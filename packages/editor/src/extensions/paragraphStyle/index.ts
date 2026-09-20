/**
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

/** Re-export the contract, so a host imports everything from one place. */
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

/** The `paragraphStyle` extension. */
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

          /** Space before the paragraph, as CSS `margin-block-start`. */
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

          /** Space after the paragraph, as CSS `margin-block-end`. */
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

/** The commands the extension adds. */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphStyle: {
      /** Set first-line indent and/or paragraph spacing over the selection. */
      setParagraphStyle: (attrs: ParagraphStyleAttrs) => ReturnType;
    };
  }
}

/** The default export, so `import ParagraphStyle from "./paragraphStyle"` also works. */
export default ParagraphStyle;
