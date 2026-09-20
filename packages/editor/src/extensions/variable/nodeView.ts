/**
 * The variable's node view — a plain ProseMirror `NodeView`.
 *
 * Not a Vue component, and not built with `@tiptap/vue-3`'s `VueNodeViewRenderer`,
 * so the extension has no framework in it: the same extension works in a Vue host, a
 * React host or a bare ProseMirror editor. The two modes are two `textContent` writes
 * on one element.
 *
 * ## Why the value is rendered rather than written
 *
 * The legacy package's fill mode replaced variables with text nodes and pushed the
 * result through `setContent`. That is what lost the selection, raced with typing and
 * made design mode unreachable again (defects 25–26). Because this view only *paints*
 * the value:
 *
 * - switching modes is free — the document was never changed;
 * - changing the paragraph's font or size re-styles the variable automatically, since
 *   the value is ordinary inline content inheriting the paragraph (defect 23);
 * - the document JSON is always the template, in both modes.
 */

import { NodeSelection } from "@tiptap/pm/state";

import type { VariableAttrs, ResolvedVariable } from "../../typings/variable";
import { resolveVariable } from "./resolver";
import type { SystemContext } from "./resolver";
import type { VariableMode, VariableNodeView, VariableNodeViewContext } from "./typing";

/**
 * Build the view.
 *
 * The returned object is created by `index.ts`'s `addNodeView` and handed to Tiptap,
 * which types it against ProseMirror's real `NodeView`; the declared
 * {@link VariableNodeView} return type is what makes every callback checkable here.
 */
export function createVariableNodeView(context: VariableNodeViewContext): VariableNodeView {
  const { editor, locale, store } = context;

  // `data-type`/`data-variable-type` mirror `renderHTML`, so a variable copied to the
  // clipboard or serialised into a static page is recognisable as a variable by CSS
  // and by a consumer's own DOM code — that is the point of the HTML round-trip.
  const dom = document.createElement("span");
  dom.className = "s-editor-variable";
  dom.setAttribute("data-type", context.name);
  dom.setAttribute("data-variable-type", context.attrs.data.type);

  let attrs: VariableAttrs = context.attrs;

  /**
   * The node's position, asked for at the moment it is used.
   *
   * `getPos()` is ProseMirror's documented way to ask, but it throws when the view is
   * detached from the document, and a position captured during construction is stale
   * after the first keystroke above the node — which is precisely the bug that made
   * the legacy edit path a silent no-op (defect 22).
   */
  const currentPos = (): number | undefined => {
    try {
      const pos = context.getPos();
      return typeof pos === "number" && pos >= 0 ? pos : undefined;
    } catch {
      return undefined;
    }
  };

  /**
   * Resolve one variable for painting.
   *
   * No error sink is passed: a node view is redrawn on every transaction, and there is
   * nothing it could do with a `VariableIssue`. The fill dialog collects those
   * instead, through `validateFill`.
   */
  const resolveForPaint = (target: VariableAttrs, mode: VariableMode): ResolvedVariable => {
    if (mode === "design") {
      // In design mode the badge is the label, so nothing needs resolving. The value
      // still comes back so the caller has one shape to work with.
      return {
        key: target.key,
        value: target.defaultValue ?? null,
        display: target.label,
        type: target.data.type
      };
    }

    // Page numbers are not known to a node view: `total`/`page` belong to whatever
    // owns pagination, which supplies them through the fill data or by resolving the
    // document itself. `1/1` is the honest default for a document with no pagination.
    const system: SystemContext = { page: 1, total: 1, now: new Date() };
    return resolveVariable(target, store.getValues(), system);
  };

  /** Paint the current attributes under the current mode. */
  const paint = (): void => {
    const mode = context.getMode();
    const resolved = resolveForPaint(attrs, mode);

    // `setAttribute` rather than the `dataset` proxy: these are the same `data-*`
    // attributes `renderHTML` emits, and spelling them identically in one place makes
    // the correspondence visible.
    dom.setAttribute("data-variable-type", attrs.data.type);
    dom.setAttribute("data-variable-mode", mode);

    if (mode === "design") {
      // The badge is chrome, and `title` gives the description a place to live without
      // putting it in the document. Styling lives in the theme; the *state* lives here.
      dom.textContent = attrs.label;
      dom.title = attrs.desc ?? attrs.label;
      return;
    }

    dom.removeAttribute("title");
    dom.setAttribute("data-variable-empty", resolved.display.length === 0 ? "true" : "false");

    if (attrs.data.type === "image" && resolved.display.length > 0) {
      // An image variable renders as a picture rather than as its URL: the display
      // *is* the source, and showing a base64 blob would be unreadable.
      const image = document.createElement("img");
      image.src = resolved.display;
      image.className = "s-editor-variable-image";
      image.alt = attrs.label;
      image.setAttribute("data-variable-image", attrs.key);
      if (attrs.data.width) image.style.width = attrs.data.width;
      dom.replaceChildren(image);
      return;
    }

    // `replaceChildren` rather than `textContent`: it also removes an `<img>` left
    // over from a previous image value, which `textContent` alone would not.
    const text = resolved.display.length === 0 ? locale.empty : resolved.display;
    dom.replaceChildren(document.createTextNode(text));
  };

  /**
   * A click in design mode asks the host to open the design dialog.
   *
   * The position is resolved *now*, never captured, and the host is free to ignore the
   * request — the extension does not know how a dialog is spelled.
   */
  const handleClick = (event: MouseEvent): void => {
    if (context.getMode() !== "design") return;

    // The default would run ProseMirror's own handling, whose caret placement is
    // exactly what an atom must refuse (defect 24). Selection is set below instead.
    event.preventDefault();
    event.stopPropagation();

    const pos = currentPos();
    if (pos !== undefined) {
      // Select the node so the host's dialog has a visible anchor, and so a host that
      // ignores `onRequestEdit` still leaves the variable selected rather than the
      // caret parked at an arbitrary offset.
      editor.view.dispatch(
        editor.view.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos))
      );
    }

    // `-1` says "the position could not be resolved"; a host that needs a position
    // must handle it, and a silent `0` would edit whatever sits at the top of the
    // document instead of doing nothing. `attrs` is this view's live copy — refreshed by
    // `update`, so a click that follows an edit hands the host what the document holds
    // rather than what it held when the view was built (defect 22's staleness).
    context.onRequestEdit?.(attrs, pos ?? -1);
  };

  dom.addEventListener("click", handleClick);

  // Subscribe in the constructor, unsubscribe in `destroy`: a node view is created and
  // destroyed constantly while a document is edited, and a leaked listener would keep
  // painting a detached element.
  const subscription = store.subscribe(paint);

  paint();

  return {
    dom,
    update: (node) => {
      attrs = node.attrs as VariableAttrs;
      paint();
      // `true` means "this node is mine and I handled it"; returning `false` would make
      // ProseMirror recreate the whole view on every attribute change, losing the
      // element and with it the selection.
      return true;
    },
    selectNode: () => {
      dom.classList.add("s-editor-variable--selected");
    },
    deselectNode: () => {
      dom.classList.remove("s-editor-variable--selected");
    },
    /**
     * All events stay inside the node view.
     *
     * A click must not be turned into a caret inside the atom; a drag must not start a
     * text selection across it. Returning `true` from `stopEvent` is what makes the atom
     * genuinely opaque to ProseMirror's input handling.
     */
    stopEvent: () => true,
    /**
     * Ignore every mutation.
     *
     * The element contains painted text that is *not* in the document. Without this,
     * ProseMirror would read a DOM change back into the document and try to parse the
     * rendered value as content of the atom — content the schema says cannot exist,
     * now that `atom: true`.
     */
    ignoreMutation: () => true,
    destroy: () => {
      dom.removeEventListener("click", handleClick);
      store.unsubscribe(subscription);
    }
  };
}
