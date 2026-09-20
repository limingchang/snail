/**
 * Subscribe a panel to the editor's selection.
 *
 * The legacy panels read the active marks once, at setup, and never again: the font and
 * size selects therefore showed whatever the caret happened to be on when the toolbar
 * mounted, and nothing subscribed to `selectionUpdate` (defect: the legacy selects did
 * not follow the caret). Every panel that displays state derived from the caret uses
 * this.
 *
 * The editor itself is a prop and can arrive after the panel mounts (the panel renders
 * first, the editor is created in the parent's `setup`), so the subscription is bound by
 * a watcher rather than in `onMounted`, and it is always released — both on unmount and
 * when the editor instance is replaced by a rebuild.
 */

import { onBeforeUnmount, watch } from "vue";
import type { Editor } from "@tiptap/core";

/**
 * Call `onChange` on every selection change, every document change and once per binding.
 *
 * @param editor - a getter for the editor, so a late-arriving or replaced instance is
 * picked up.
 * @param onChange - re-read whatever the panel displays. Must tolerate `undefined`.
 * @returns nothing; the subscription lives on the current component instance.
 */
export function useEditorSelection(editor: () => Editor | undefined, onChange: () => void): void {
  let bound: Editor | undefined;
  let detach: (() => void) | undefined;

  const attach = (instance: Editor | undefined): void => {
    if (instance === bound) return;

    detach?.();
    detach = undefined;
    bound = instance;

    if (!instance) return;

    // One handler for both events: `update` covers an attribute change that did not move
    // the selection (a toolbar button pressed with the caret still), and
    // `selectionUpdate` covers the caret moving into differently formatted text.
    const handler = (): void => onChange();
    instance.on("selectionUpdate", handler);
    instance.on("update", handler);

    detach = () => {
      instance.off("selectionUpdate", handler);
      instance.off("update", handler);
    };
  };

  watch(
    editor,
    (instance) => {
      attach(instance);
      // Read once on binding: a panel that mounted while the editor already existed must
      // still show the current state without waiting for the user to click.
      onChange();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    detach?.();
    detach = undefined;
    bound = undefined;
  });
}
