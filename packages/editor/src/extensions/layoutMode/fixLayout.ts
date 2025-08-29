import { Editor } from "@tiptap/core";

export function fixLayoutTable(editor: Editor) {
  const { state } = editor;
  const { doc, tr } = state;
  let hasChanges = false;

  // 查找所有具有 layoutMode 属性的表格
  doc.descendants((node, pos) => {
    if (node.type.name === 'table' && node.attrs.layoutMode) {
      // 遍历表格的所有行
      node.descendants((rowNode, rowPos) => {
        if (rowNode.type.name === 'tableRow' && !rowNode.attrs.layoutMode) {
          // 计算行的绝对位置
          const absoluteRowPos = pos + rowPos + 1;
          // 设置行的 layoutMode 属性
          tr.setNodeAttribute(absoluteRowPos, 'layoutMode', true);
          hasChanges = true;
        }
      });
    }
  });

  // 如果有变更，分发事务
  if (hasChanges) {
    editor.view.dispatch(tr);
  }
}
