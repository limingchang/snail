import type { Editor,NodePos } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

type nodeAndPos = ProseMirrorNode & { pos: number };
/**
 * 检查是否有下一页
 * @param pos 当前位置
 * @param editor 编辑器实例
 * @returns 下一页的pageContent node、pos，没有下一页则返回null
 */
export const checkNextPage = (pageContent: NodePos|null, editor: Editor) => {
  if (pageContent===null) return null;
  let nextPageContentNode: nodeAndPos | null = null;
  const currentPageNode =
        pageContent.node.type.name === "pageContent"
          ? editor.state.doc.nodeAt(pageContent.pos - 1)
          : null;
  if (currentPageNode===null) return null;
  const currentPagePos = pageContent.pos - 1;
  const nextPagePos = currentPagePos + currentPageNode.nodeSize;
  if (nextPagePos < editor.state.doc.content.size) {
    const nextPageNode = editor.state.doc.nodeAt(nextPagePos);
    if (nextPageNode && nextPageNode.type.name === "page") {
      // 获取下一页的pageContent
      editor.state.doc.nodesBetween(
        nextPagePos,
        nextPagePos + nextPageNode.nodeSize,
        (node, pos) => {
          if (node.type.name === "pageContent") {
            nextPageContentNode = Object.assign(
              Object.create(Object.getPrototypeOf(node)),
              node,
              { pos }
            );
            return false;
          }
          return true;
        }
      );
    }
  }
  return nextPageContentNode as nodeAndPos | null;
};
