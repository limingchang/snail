import type { Editor, NodePos } from "@tiptap/core";
import type { Selection } from "@tiptap/pm/state";

export const getPageContentNodePos = (
  editor: Editor,
  selection: Selection
): NodePos | null => {
  const { from, to } = selection;
  const pageContents = editor.$nodes("pageContent");
  if (pageContents === null) return null;
  let nodePos: NodePos | null = null;
  pageContents.forEach((pageContent) => {
    if (pageContent.from <= from && pageContent.to >= to) {
      nodePos = pageContent;
      return false;
    }
  });
  return nodePos;
};
