/**
 * 让面板订阅编辑器的选区。
 *
 * 旧面板只在 setup 时读一次当前 marks，此后再也不读：字体与字号下拉因此永远显示工具栏挂载
 * 时光标所在的位置，也没有任何东西订阅 `selectionUpdate`（缺陷：旧下拉不跟随光标）。
 * 每个显示由光标推导出来的状态的面板都用这个。
 *
 * 编辑器本身是一个 prop，可能在面板挂载之后才到达（面板先渲染，编辑器在父组件的 `setup`
 * 里创建），所以订阅由 watcher 绑定，而不是在 `onMounted` 里绑定；而且它总会被释放 ——
 * 卸载时，以及编辑器实例被重建替换时。
 *
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
 * 每次选区变化、每次文档变化时调用 `onChange`，并在绑定时调用一次。
 *
 * Call `onChange` on every selection change, every document change and once per binding.
 *
 * @param editor 编辑器的 getter，这样迟到的或被替换的实例也能被接上 /
 * - a getter for the editor, so a late-arriving or replaced instance is
 * picked up.
 * @param onChange 重新读取面板显示的一切。必须容忍 `undefined` /
 * - re-read whatever the panel displays. Must tolerate `undefined`.
 * @returns 无；订阅挂在当前组件实例上 /
 * nothing; the subscription lives on the current component instance.
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
