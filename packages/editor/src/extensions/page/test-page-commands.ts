// 测试页面命令功能的简单示例
import { Editor } from '@tiptap/core';
import { Page } from './index';

// 测试 pageSet 命令
export function testPageSet(editor: Editor) {
  // 设置页面为A3格式，横向
  editor.commands.pageSet({
    pageFormat: 'A3',
    orientation: 'landscape',
    margins: {
      top: '25mm',
      right: '25mm', 
      bottom: '25mm',
      left: '25mm'
    }
  });
}

// 测试 addNewPage 命令
export function testAddNewPage(editor: Editor) {
  editor.commands.addNewPage();
}

// 使用示例
export function initPageCommands(editor: Editor) {
  // 可以通过编辑器调用新的页面命令
  console.log('页面命令可用:', {
    pageSet: typeof editor.commands.pageSet,
    addNewPage: typeof editor.commands.addNewPage
  });
}