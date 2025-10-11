import type { Editor, NodePos } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import { getCurrentPage } from "./getCurrentPage";

type nodeAndPos = ProseMirrorNode & { pos: number };

/**
 * 检查是否有下一页
 * @param pos 当前位置
 * @param editor 编辑器实例
 * @returns 下一页的pageContent node、pos，没有下一页则返回null
 */
export const checkNextPage = (editor: Editor, selection: Selection) => {
  const currentPage = getCurrentPage(editor, selection);
  // console.log("checkNextPage-currentPage:", currentPage);
  if (currentPage === null) return null;
  // let nextPageNodeAndPos: nodeAndPos | null = null;
  const nextPagePos = currentPage.pos + currentPage.size;
  if (nextPagePos < editor.state.doc.content.size) {
    // const nextPageNode = editor.state.doc.nodeAt(nextPagePos);
    const nextPageNodePos = editor.$pos(nextPagePos)
    // console.log("checkNextPage-nextPageNode:", nextPageNodePos);
    if (nextPageNodePos && nextPageNodePos.node.type.name === "page") {
      // 获取下一页的pageNodePos
      return nextPageNodePos
    }
  }
  return null;
};
