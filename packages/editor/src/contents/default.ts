import type {Content} from '@tiptap/core'

// import { Content, Mark } from '../typing/content'

const boldMark: Content = {
  type: 'bold'
}

const italicMark: Content = {
  type: 'italic'
}

const underlineMark: Content = {
  type: 'underline'
}

const defaultQRCode = {
  type: 'qrcode',
  attrs: {
    src: 'data:image/png;base64,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',
    text: '123',
    size: { value: 30, unit: "mm" },
    position: { x: 10, y: 10, unit: "mm" },
  },
}

const defaultH1StyleMark = {
  type:'textStyle',
  attrs:{
    fontSize:'18pt',
    lineHeight:'2',
    fontFamily:'SimHei, sans-serif'
  }
}

const defaultH1 = {
  type: 'heading',
  attrs: {
    level: 1,
    textAlign: 'center',
    textIndent:'0'
  },
  content: [
    {
      type: 'text',
      text: '默认页面标题',
      marks: [boldMark,defaultH1StyleMark],
      
    }
  ]
}

const defaultTextStyleMark = {
  type:'textStyle',
  attrs:{
    fontSize:'14pt',
    lineHeight:'28pt',
    fontFamily:'SimSun, serif'
  }
}

const defaultParagraph = {
  type: 'paragraph',
  attrs:{
    textAlign: 'justify',
    textIndent:'2em',
    lineHeight:'1.5',
  },
  content: [
    {
      type: 'text',
      text: '这是基于TipTap3.0创建的编辑器,支持文本',
    },
    {
      type: 'text',
      text: '加粗、',
      marks: [boldMark]
    },
    {
      type: 'text',
      text: '斜体、',
      marks: [italicMark]
    },
    {
      type: 'text',
      text: '下划线',
      marks: [underlineMark]
    },
    {
      type: 'text',
      text: '以及基础的段落设置,如缩进、段落间距、对齐方式等。',
    },
  ],
  marks:[defaultTextStyleMark]
}

const defaultH2StyleMark = {
  type:'textStyle',
  attrs:{
    fontSize:'15pt',
    lineHeight:'1.5',
    fontFamily:'KaiTi, serif'
  }
}

const defaultH2 = {
  type: 'heading',
  attrs: {
    level: 2,
    textAlign: 'left',
    textIndent:'0'
  },
  content: [
    {
      type: 'text',
      text: '一、默认页面标题',
      marks: [boldMark,defaultH2StyleMark],
      
    }
  ]
}

export const defaultContent = {
  type: 'doc',
  content: [
    // defaultQRCode,
    defaultH1,
    defaultH2,
    defaultParagraph
  ]
} as Content
