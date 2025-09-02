import type { Editor } from "@tiptap/core";
import type { Node } from "prosemirror-model";

/**
 * 获取页头页脚的页面节点
 * @returns
 */
export const findPageNode = (
  view: Editor["view"],
  getPos: () => number | undefined
): { node: Node; pos: number } | null => {
  if (typeof getPos !== "function") return null;
  const pos = getPos();
  if (pos === null || pos === undefined) return null;

  let currentNode = view.state.doc.nodeAt(pos);
  let currentPos = pos;

  // 向上查找 Page 节点
  while (currentNode && currentNode.type.name !== "page") {
    const resolvedPos = view.state.doc.resolve(currentPos);
    const beforePos = resolvedPos.before();
    if (beforePos <= 0) break;
    currentPos = beforePos;
    currentNode = view.state.doc.nodeAt(currentPos);
  }

  return currentNode?.type.name === "page"
    ? { node: currentNode, pos: currentPos }
    : null;
};
