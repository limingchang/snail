/**
 * 测试PageHeader和PageFooter的优化功能
 */
import { Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { PageHeader } from './extensions/page/pageHeader';
import { PageFooter } from './extensions/page/pageFooter';
import { HeaderFooterLeft, HeaderFooterCenter, HeaderFooterRight } from './extensions/page/content';

// 创建编辑器实例进行测试
const testEditor = new Editor({
  extensions: [
    Document,
    Text,
    PageHeader.configure({
      text: "测试页眉内容",
      position: "center",
      height: 60,
      underline: true
    }),
    PageFooter.configure({
      text: "测试页脚内容", 
      position: "left",
      height: 40,
      upline: true
    }),
    HeaderFooterLeft,
    HeaderFooterCenter,
    HeaderFooterRight
  ],
  content: '<div></div>'
});

// 测试插入PageHeader
function testInsertPageHeader() {
  const transaction = testEditor.state.tr;
  const headerNode = testEditor.schema.nodes.pageHeader.create({
    text: "自动创建页眉",
    position: "right",
    height: 50,
    underline: false
  });
  
  transaction.insert(0, headerNode);
  testEditor.view.dispatch(transaction);
  
  console.log('PageHeader插入测试完成');
  console.log('预期结果：应自动创建headerFooterLeft、headerFooterCenter、headerFooterRight三个子节点');
  console.log('预期内容：右侧区域应包含"自动创建页眉"文本，左侧和中间区域为空');
}

// 测试插入PageFooter
function testInsertPageFooter() {
  const transaction = testEditor.state.tr;
  const footerNode = testEditor.schema.nodes.pageFooter.create({
    text: "自动创建页脚",
    position: "center", 
    height: 45,
    upline: true
  });
  
  transaction.insert(testEditor.state.doc.content.size, footerNode);
  testEditor.view.dispatch(transaction);
  
  console.log('PageFooter插入测试完成');
  console.log('预期结果：应自动创建headerFooterLeft、headerFooterCenter、headerFooterRight三个子节点');
  console.log('预期内容：中间区域应包含"自动创建页脚"文本，左侧和右侧区域为空');
}

// 测试函数形式的text配置
function testFunctionText() {
  let counter = 0;
  const headerWithFunctionText = testEditor.schema.nodes.pageHeader.create({
    text: () => `动态文本 ${++counter}`,
    position: "left",
    height: 50
  });
  
  console.log('函数形式text配置测试');
  console.log('预期结果：每次创建时文本内容应该是动态生成的');
}

export {
  testInsertPageHeader,
  testInsertPageFooter, 
  testFunctionText,
  testEditor
};