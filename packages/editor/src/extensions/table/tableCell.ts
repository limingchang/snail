import { mergeAttributes, Node } from '@tiptap/core'

export interface TableCellOptions {
  /**
   * The HTML attributes for a table cell node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>
}

export const TableCell = Node.create<TableCellOptions>({
  name: 'tableCell',
  content: 'block+',
  // tableRole: 'cell',
  isolating: true,
  
  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      colspan: {
        default: 1,
      },
      rowspan: {
        default: 1,
      },
      colwidth: {
        default: null,
        parseHTML: element => {
          const colwidth = element.getAttribute('colwidth')
          const value = colwidth ? colwidth.split(',').map(width => parseInt(width, 10)) : null

          return value
        },
      },
    }
  },

  

  parseHTML() {
    return [{ tag: 'td' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
})