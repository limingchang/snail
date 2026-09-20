/**
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

/** How the document is being used. Re-exported from the store, which owns the value. */
export type { VariableMode };

/**
 * A variable found in a document, with the position it sits at.
 *
 * Declared here rather than in `index.ts` so `VariableStorage` can name it without
 * importing the extension back.
 */
export interface DocumentVariable {
  /** The node's position, as ProseMirror reports it. */
  pos: number;

  /** The node's attributes. */
  attrs: VariableAttrs;
}

/**
 * User-visible strings, so the extension stays free of a UI library.
 *
 * Chinese defaults, mirroring the `@snail-js/api` locale pattern: a host that
 * wants English passes its own table, and a host that wants neither keeps working.
 */
export interface VariableLocale {
  /** Text painted by a node view whose value is empty in fill mode. Default `"(未填写)"`. */
  empty: string;

  /** `textContent` when a fill value was cut off at `maxLength`. Default `"已超出长度限制"`. */
  textOverflow: string;

  /** Default `"必填项未填写"`. */
  required: string;

  /** Default `"超出允许范围"`. */
  outOfRange: string;

  /** Default `"选项不在允许的范围内"`. */
  selectInvalid: string;

  /** Default `"图片体积超出限制"`. */
  imageTooLarge: string;

  /** Default `"图片地址为空"`. */
  imageEmpty: string;

  /** Default `"公式语法错误"`. */
  formulaSyntax: string;

  /** Default `"公式引用了循环依赖"`. */
  formulaCycle: string;

  /** Default `"公式引用了不存在的变量"`. */
  formulaUnknown: string;

  /** Default `"公式计算结果无效"`. */
  formulaInvalid: string;
}

/**
 * What a caller may configure.
 *
 * Every field has a default, so `Variable.configure({ mode: "fill" })` is a complete
 * configuration.
 */
export interface VariableOptions {
  /**
   * `"design"` paints each variable's label as a badge and lets a click open the
   * design dialog; `"fill"` paints the resolved value as ordinary inline text.
   *
   * Read live, never copied, so a host that flips it after `new Editor()` still works.
   * The supported way is `setVariableMode(editor, mode)`, which also repaints.
   */
  mode: VariableMode;

  /** Fill data, keyed by variable key. Prefer `setVariableValues` over mutating this. */
  values: VariableFillData;

  /**
   * The caller's variable catalogue — the legacy `innerVariable` tree.
   *
   * Kept as an *input method* (`keySource: "inner"`), not as a variable type: it
   * decides how the user picks a key, not what a value looks like.
   */
  innerVariable: InnerVariableNode[];

  /**
   * The message table.
   *
   * A complete table rather than a partial one: `addOptions` merges the caller's
   * overrides over the Chinese defaults, and typing it as complete is what lets every
   * consumer read a message without a fallback (`??` on twenty strings is how a locale
   * table rots).
   */
  locale: VariableLocale;

  /**
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
 * What the extension keeps at runtime.
 *
 * None of these are `readonly`: `onCreate` fills them in, and Tiptap hands the same
 * object to every consumer, so the extension writes and everyone else reads through
 * `getVariableMode` / `getVariableValues` / `getVariableStore`.
 */
export interface VariableStorage {
  /** The current mode; kept in step with the store so a plain consumer needs no cast. */
  mode: VariableMode;

  /** The current fill data; kept in step so plain consumers never need the store. */
  values: VariableFillData;

  /**
   * The observable the node views subscribe to.
   *
   * Owned by the extension: it is created in `onCreate`, and replacing it would orphan
   * every subscription an existing node view holds.
   */
  store: VariableStore;

  /**
   * Every variable in the document, in document order.
   *
   * On storage rather than only on the command because Tiptap's `RawCommands` requires
   * every command to return `boolean`, so a list cannot travel back through one. The
   * equivalent free function is `collectDocumentVariables(editor)`.
   */
  getVariables: () => DocumentVariable[];
}

/**
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
   * The editor the variable node lives in.
   *
   * An `Editor`, not the `Node` extension: the node view needs `view` and `state`, which
   * belong to the editor. Reading the extension's own options goes through
   * {@link VariableNodeViewOptions} rather than `editor.options`, whose type is the
   * generic `Record<string, unknown>` Tiptap declares for it.
   */
  editor: Editor;

  /** The node type's name, used for the `data-type` attribute. */
  name: string;

  /** Merged locale table. */
  locale: VariableLocale;

  /**
   * The node's attributes at the time the view was built.
   *
   * The view keeps its own copy and refreshes it in `update`; nothing else reads the
   * node, so there is no second accessor to fall out of step with it.
   */
  attrs: VariableAttrs;

  /** The current mode. */
  getMode: () => VariableMode;

  /** The current fill data. */
  getValues: () => VariableFillData;

  /**
   * The node's current position.
   *
   * Called from the click handler only, never stored.
   */
  getPos: () => number | undefined;

  /**
   * The host's design-mode edit hook, already read off the extension's options.
   *
   * Passed in rather than reached through `editor.options` so the node view never has to
   * assume a shape for Tiptap's generic `options` bag.
   */
  onRequestEdit?: (attrs: VariableAttrs, pos: number) => void;

  /** The store to subscribe to. */
  store: VariableStore;
}

/**
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
  dom: HTMLElement;
  update: (node: ProseMirrorNode, decorations: readonly Decoration[]) => boolean;
  selectNode: () => void;
  deselectNode: () => void;
  stopEvent: (event: Event) => boolean;
  ignoreMutation: () => boolean;
  destroy: () => void;
}
