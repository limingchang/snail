/**
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

/** Re-export the extension's own contract, so a host imports from one place. */
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

/** The default label. A Chinese default, matching the rest of the product. */
const DEFAULT_LABEL = "新变量";

/** The default key. */
const DEFAULT_KEY = "key";

/**
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
 * The element-or-string argument Tiptap hands `parseHTML`.
 *
 * It is `HTMLElement | string` because a rule may also be matched against raw text.
 * These attributes only ever live on an element, so the readers below narrow on
 * `typeof` rather than casting: a string carries no attribute, which is the same
 * answer as an absent one.
 */
type ParseSource = HTMLElement | string;

/** Read one of the plain string attributes. */
const readString =
  (name: string) =>
  (element: ParseSource): string | undefined =>
    typeof element === "string" ? undefined : element.getAttribute(name) ?? undefined;

/**
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

/** Read the type-specific configuration, falling back to plain text. */
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
 * Read `keySource`.
 *
 * Anything that is not `"inner"` reads as `"manual"`: a value from a newer version
 * must degrade to the default rather than become an unrecognised third state.
 */
const readKeySource = (element: ParseSource): "manual" | "inner" => {
  if (typeof element === "string") return "manual";
  return element.getAttribute(ATTR_KEY_SOURCE) === "inner" ? "inner" : "manual";
};

/** The `renderHTML` of an attribute, typed so the object literal stays checkable. */
type RenderAttribute = (attributes: Record<string, unknown>) => Record<string, unknown>;

/** Variables found in a document, in document order. */

/**
 * The store each editor owns.
 *
 * A `WeakMap` keyed by the editor rather than a property on it: the map holds no
 * strong reference, so a destroyed editor is collectable, and nothing on the public
 * `Editor` object is shadowed. A node view resolves its store through this map at
 * construction, which is safe because Tiptap finishes `createStorage` — and therefore
 * `onCreate` — before it builds the view.
 */
const editorStores = new WeakMap<Editor, VariableStore>();

/** The store for an editor, or `undefined` when the extension is not registered. */
export function getVariableStore(editor: Editor): VariableStore | undefined {
  return editorStores.get(editor);
}

/**
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

/** The live extension, viewed as the parts the helpers write. */
function mutableVariableExtension(editor: Editor): MutableVariableExtension | undefined {
  const extension = findVariableExtension(editor);
  return extension as unknown as MutableVariableExtension | undefined;
}

/** The current mode, read from storage, which is what the writers keep in step. */
function currentMode(editor: Editor): VariableMode {
  return findVariableExtension(editor)?.storage.mode ?? "design";
}

/**
 * The current fill data, read from storage.
 *
 * `Record<string, VariableValue>` and `VariableFillData` are the same type; the narrower
 * spelling keeps the "a fill key is a scalar, not a nested object" decision visible.
 */
function currentValues(editor: Editor): Record<string, VariableValue> {
  return findVariableExtension(editor)?.storage.values ?? {};
}

/**
 * Switch modes and repaint.
 *
 * Writing the option alone would not repaint anything: ProseMirror dispatches an
 * `update` event only for document and selection changes, so a node view has to be
 * told. The store's `emit` is that notification, and the node views read the new mode
 * when they repaint.
 *
 * @param editor - the editor whose `variable` extension is configured.
 * @param mode - `"design"` paints labels, `"fill"` paints values.
 * @returns `false` when the extension is not registered, mirroring Tiptap's command
 * convention so a caller can tell "nothing to do" from "done".
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
 * Replace the fill data and repaint.
 *
 * Same reasoning as {@link setVariableMode}: the values are read live by every node
 * view, so only the notification has to travel.
 *
 * @param editor - the editor whose `variable` extension is configured.
 * @param values - the complete fill data. It replaces, not merges: a dialog that has
 * cleared a field must be able to clear it.
 */
export function setVariableValues(editor: Editor, values: Record<string, VariableValue>): boolean {
  const extension = mutableVariableExtension(editor);
  if (!extension) return false;
  extension.options.values = values;
  extension.storage.values = values;
  editorStores.get(editor)?.setValues(values);
  return true;
}

/** The current mode, for a host that needs to render a toggle. */
export function getVariableMode(editor: Editor): VariableMode {
  return currentMode(editor);
}

/** The current fill data, for a host that needs to hand it to a form. */
export function getVariableValues(editor: Editor): Record<string, VariableValue> {
  return currentValues(editor);
}

/**
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

/** The end of the document's last text block, for an insertion with nowhere better to go. */
function documentEnd(editor: Editor): number | undefined {
  let found: number | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock) found = pos + 1 + node.content.size;
    return true;
  });
  return found;
}

/** The `variable` node extension. */
export const Variable = Node.create<VariableOptions, VariableStorage>({
  name: "variable",

  /**
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
   * Not draggable.
   *
   * Dragging is how a variable ends up somewhere the schema allows but the contract does
   * not, and the legacy node let a drag silently move a signature variable out of its
   * clause. Selecting and re-inserting is explicit.
   */
  draggable: false,

  /** No content, so the node is exactly one position — which is what makes pagination
   * offsets and `descendants` positions agree with the rendered text. */
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
     * The live extension instance.
     *
     * `addStorage`'s own `this` is Tiptap's declared `{ name, options, parent }` shape,
     * but at runtime it *is* the extension object, which acquires the `editor` property a
     * moment later in `createExtension`. `Node<Options, Storage>` does not declare that
     * property, so the one structural fact Tiptap does not type is named here, once.
     */
    const extension = this as unknown as { editor: Editor };

    return {
      mode: "design",
      values: {},
      // Replaced in `onCreate`; declared here so `storage.store` has a real value from
      // the first moment it can be read, and so `VariableStorage` stays non-optional.
      store: new VariableStore({}),
      /**
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

    // The store is the single notification channel for both value and mode changes. It
    // writes back into storage so plain consumers (`editor.storage.variable.values`)
    // never read a stale copy, and it starts from the configured values.
    const store = new VariableStore(this.options.values, this.options.mode);
    const originalSetValues = store.setValues.bind(store);
    store.setValues = (values) => {
      const fill = { ...values };
      originalSetValues(fill);
      extension.storage.values = fill;
      extension.options.values = fill;
    };

    this.storage.store = store;
    this.storage.mode = this.options.mode;
    this.storage.values = this.options.values;

    editorStores.set(editor, store);
  },

  addAttributes() {
    return {
      /** Shown in the document and in the variable list. */
      label: {
        default: DEFAULT_LABEL,
        parseHTML: readString(ATTR_LABEL),
        renderHTML: ((attributes) => ({ [ATTR_LABEL]: attributes.label })) satisfies RenderAttribute
      },

      /** The key the fill data is looked up by. */
      key: {
        default: DEFAULT_KEY,
        parseHTML: readString(ATTR_KEY),
        renderHTML: ((attributes) => ({ [ATTR_KEY]: attributes.key })) satisfies RenderAttribute
      },

      /** Optional note. Absent stays absent, so an empty description adds no attribute. */
      desc: {
        default: undefined,
        parseHTML: readString(ATTR_DESC),
        renderHTML: ((attributes) =>
          attributes.desc === undefined ? {} : { [ATTR_DESC]: attributes.desc }) satisfies RenderAttribute
      },

      /** Value used when the fill data supplies none. */
      defaultValue: {
        default: undefined,
        parseHTML: readDefaultValue,
        renderHTML: ((attributes) =>
          attributes.defaultValue === undefined
            ? {}
            : { [ATTR_DEFAULT]: JSON.stringify(attributes.defaultValue) }) satisfies RenderAttribute
      },

      /**
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

      /** How the key was chosen. `"manual"` is the default and is not written out. */
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
    // `data-variable-type` is duplicated out of the config blob for CSS and for a
    // consumer that wants to style by type without parsing JSON — see the table above
    // for the whole encoding.
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "variable",
        "data-variable-type": (node.attrs as VariableAttrs).data.type
      }),
      0
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

      /** Delete a variable by position. Returns `false` for a position that is not one. */
      removeVariable:
        (pos: number) =>
        ({ state, tr, dispatch }) => {
          const current = state.doc.nodeAt(pos);
          if (!current || current.type.name !== "variable") return false;

          if (dispatch) tr.delete(pos, pos + current.nodeSize);
          return true;
        },

      /**
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
 * The commands the extension adds.
 *
 * Declared here rather than in `typings/variable.ts` because a Tiptap module
 * augmentation is a runtime-free side effect on the `@tiptap/core` module graph, and it
 * belongs beside the `addCommands` that implements it.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variable: {
      /** Insert a variable at the selection, or `false` when there is no legal slot. */
      insertVariable: (attrs: Partial<VariableAttrs>) => ReturnType;

      /** Replace the variable at `pos`. `false` when the position holds something else. */
      updateVariable: (pos: number, attrs: Partial<VariableAttrs>) => ReturnType;

      /** Delete the variable at `pos`. `false` when the position holds something else. */
      removeVariable: (pos: number) => ReturnType;

      /**
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

/** The default export, so `import Variable from "./variable"` also works. */
export default Variable;
