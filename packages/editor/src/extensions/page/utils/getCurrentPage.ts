import type { Editor, NodePos } from "@tiptap/core";
import type { Selection } from "@tiptap/pm/state";

export const getCurrentPage = (
  editor: Editor,
  selection: Selection
): NodePos | null => {
  const { from, to } = selection;
  const pages = editor.$nodes("page");
  if (pages === null) return null;
  let nodePos: NodePos | null = null;
  pages.forEach((page) => {
    if (page.from <= from && page.to >= to) {
      nodePos = page;
      return false;
    }
  });
  return nodePos;
};