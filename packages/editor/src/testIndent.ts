import { Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { TextIndent } from './extensions/textIndent';

// 创建编辑器实例
const editor = new Editor({
  content: '<p>这是一个测试段落</p>',
  extensions: [
    Document,
    Paragraph,
    Text,
    TextIndent,
  ],
});

// 测试设置缩进
console.log('=== 测试设置缩进 ===');
const setResult = editor.commands.setTextIndent('2em');
console.log('设置缩进结果:', setResult);
console.log('设置后文档内容:', editor.getHTML());

export default editor;