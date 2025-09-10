/**
 * 页面设置命令测试
 * 验证 pageSet 和 addNewPage 命令的功能
 */

import { Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Page } from './index';

// 创建测试编辑器实例
function createTestEditor() {
  return new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Page
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'page',
          attrs: {
            index: 1,
            pageFormat: 'A4',
            orientation: 'portrait',
            margins: {
              top: '20mm',
              right: '21mm',
              bottom: '20mm',
              left: '21mm'
            }
          },
          content: [
            { type: 'pageHeader' },
            {
              type: 'pageContent',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '测试页面内容' }]
                }
              ]
            },
            { type: 'pageFooter' }
          ]
        }
      ]
    }
  });
}

// 测试 pageSet 命令
export function testPageSetCommand() {
  const editor = createTestEditor();
  
  console.log('=== 测试 pageSet 命令 ===');
  
  // 获取初始页面属性
  const initialPageNode = editor.$node('page');
  console.log('初始页面属性:', initialPageNode?.attrs);
  
  // 执行 pageSet 命令
  const result = editor.commands.pageSet({
    pageFormat: 'A3',
    orientation: 'landscape',
    margins: {
      top: '25mm',
      right: '25mm',
      bottom: '25mm',
      left: '25mm'
    }
  });
  
  console.log('pageSet 命令执行结果:', result);
  
  // 获取更新后的页面属性
  const updatedPageNode = editor.$node('page');
  console.log('更新后页面属性:', updatedPageNode?.attrs);
  
  editor.destroy();
  return result;
}

// 测试 addNewPage 命令
export function testAddNewPageCommand() {
  const editor = createTestEditor();
  
  console.log('=== 测试 addNewPage 命令 ===');
  
  // 获取初始页面数量
  const initialPageCount = editor.$nodes('page')?.length || 0;
  console.log('初始页面数量:', initialPageCount);
  
  // 执行 addNewPage 命令
  const result = editor.commands.addNewPage();
  
  console.log('addNewPage 命令执行结果:', result);
  
  // 获取更新后的页面数量
  const updatedPageCount = editor.$nodes('page')?.length || 0;
  console.log('更新后页面数量:', updatedPageCount);
  
  editor.destroy();
  return result;
}

// 运行所有测试
export function runPageCommandsTest() {
  console.log('开始页面命令测试...');
  
  try {
    const pageSetResult = testPageSetCommand();
    const addNewPageResult = testAddNewPageCommand();
    
    console.log('=== 测试结果汇总 ===');
    console.log('pageSet 测试:', pageSetResult ? '通过' : '失败');
    console.log('addNewPage 测试:', addNewPageResult ? '通过' : '失败');
    
    return {
      pageSet: pageSetResult,
      addNewPage: addNewPageResult
    };
  } catch (error) {
    console.error('测试过程中发生错误:', error);
    return {
      pageSet: false,
      addNewPage: false,
      error: error
    };
  }
}

// 如果直接运行此文件，执行测试
if (typeof window === 'undefined') {
  runPageCommandsTest();
}