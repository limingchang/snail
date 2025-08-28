import { Node, callOrReturn, getExtensionField } from "@tiptap/core";
import { columnResizing, tableEditing } from "@tiptap/pm/tables";

export const Table = Node.create({
  name: "table",
  content: "tableRow+",
  // tableRole: 'table',
  isolating: true,
  group: "block",

  // 添加ProseMirror插件
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable;

    return [
      ...(isResizable
        ? [
            columnResizing({
              handleWidth: this.options.handleWidth,
              cellMinWidth: this.options.cellMinWidth,
              defaultCellMinWidth: this.options.cellMinWidth,
              View: this.options.View,
              lastColumnResizable: this.options.lastColumnResizable,
            }),
          ]
        : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ];
  },

  extendNodeSchema(extension) {
    const context = {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
    };

    return {
      tableRole: callOrReturn(
        getExtensionField(extension, "tableRole", context)
      ),
    };
  },
});
