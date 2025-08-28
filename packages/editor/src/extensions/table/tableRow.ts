import { Node,mergeAttributes } from "@tiptap/core";

export interface TableRowOptions {
  /**
   * The HTML attributes for a table row node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>
}

export const TableRow = Node.create<TableRowOptions>({
  name: 'tableRow',
  content: '(tableCell | tableHeader)*',
  // tableRole: 'row',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [{ tag: 'tr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
})