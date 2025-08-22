import { Node, mergeAttributes } from '@tiptap/core'


export const Page = Node.create({
  name: 'page',
  // 页面可以包含多个块级元素，如段落、标题等
  content: 'block+',

  // 页面属于block组，使其可以作为文档的直接子元素
  group: 'block',

  // 不是顶级节点，顶级节点仍然是doc
  topNode: false,
  // 优先级高于其他块级元素，确保页面在文档结构中正确排序
  priority: 100,
  // 解析HTML
  parseHTML() {
    return [
      {
        tag: 'div[data-type="page"]',
      },
    ]
  },

  addGlobalAttributes() {
    return [
      {
        types: ['page'],
        attributes: {
          padding: {
            default: '20',
            parseHTML: (element) => element.getAttribute('padding'),
            renderHTML: (attributes) => ({
              style: `padding: ${attributes.padding}mm`,
            }),
          },
        },
      },
    ]
  },

  // 渲染HTML
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page',
        // 添加一个类名用于样式设计
        class: 'tiptap-page',
      }),
      0, // 表示子节点
    ]
  },
})
