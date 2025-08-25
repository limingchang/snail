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
    src: '',
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
