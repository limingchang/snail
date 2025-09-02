// 页眉页脚动态文本测试文件
import { Editor } from '@tiptap/core'
import { Page } from './extensions/page'

/**
 * 测试动态页码功能
 */
export function testDynamicPageNumbers() {
  console.log('开始测试页眉页脚动态文本功能...');
  
  // 创建编辑器实例
  const editor = new Editor({
    extensions: [
      Page.configure({
        pageHeaderText: (index: number, total: number) => `第 ${index + 1} 页，共 ${total} 页`,
        pageHeaderPositon: 'center',
        pageHeaderHeight: 50,
        pageHeaderLine: true,
        pageFooterText: (index: number, total: number) => `${index + 1} / ${total}`,
        pageFooterPositon: 'right',
        pageFooterHeight: 40,
        pageFooterLine: true,
      })
    ]
  });

  // 模拟添加多个页面
  const testContent = `
    <div data-type="page">
      <page-header></page-header>
      <page-content>
        <p>这是第一页的内容</p>
      </page-content>
      <page-footer></page-footer>
    </div>
    <div data-type="page">
      <page-header></page-header>
      <page-content>
        <p>这是第二页的内容</p>
      </page-content>
      <page-footer></page-footer>
    </div>
    <div data-type="page">
      <page-header></page-header>
      <page-content>
        <p>这是第三页的内容</p>
      </page-content>
      <page-footer></page-footer>
    </div>
  `;

  // 设置内容
  editor.commands.setContent(testContent);

  // 等待更新完成后检查结果
  setTimeout(() => {
    console.log('页码更新完成，检查结果...');
    
    // 检查页眉内容
    const headers = document.querySelectorAll('.tiptap-page-header .center');
    headers.forEach((header, index) => {
      const expectedText = `第 ${index + 1} 页，共 ${headers.length} 页`;
      const actualText = header.textContent?.trim();
      console.log(`页眉 ${index + 1}: 期望 "${expectedText}", 实际 "${actualText}"`);
    });

    // 检查页脚内容
    const footers = document.querySelectorAll('.tiptap-page-footer .right');
    footers.forEach((footer, index) => {
      const expectedText = `${index + 1} / ${footers.length}`;
      const actualText = footer.textContent?.trim();
      console.log(`页脚 ${index + 1}: 期望 "${expectedText}", 实际 "${actualText}"`);
    });
    
    console.log('动态文本功能测试完成');
  }, 500);

  return editor;
}

/**
 * 测试静态文本兼容性
 */
export function testStaticTextCompatibility() {
  console.log('开始测试静态文本兼容性...');
  
  const editor = new Editor({
    extensions: [
      Page.configure({
        pageHeaderText: '这是静态页眉',
        pageHeaderPositon: 'left',
        pageFooterText: '这是静态页脚',
        pageFooterPositon: 'center',
      })
    ]
  });

  const testContent = `
    <div data-type="page">
      <page-header></page-header>
      <page-content>
        <p>静态文本测试页</p>
      </page-content>
      <page-footer></page-footer>
    </div>
  `;

  editor.commands.setContent(testContent);

  setTimeout(() => {
    const headerText = document.querySelector('.tiptap-page-header .left')?.textContent?.trim();
    const footerText = document.querySelector('.tiptap-page-footer .center')?.textContent?.trim();
    
    console.log(`静态页眉: "${headerText}"`);
    console.log(`静态页脚: "${footerText}"`);
    console.log('静态文本兼容性测试完成');
  }, 300);

  return editor;
}

/**
 * 测试页面添加和删除
 */
export function testPageOperations() {
  console.log('开始测试页面操作...');
  
  const editor = new Editor({
    extensions: [
      Page.configure({
        pageHeaderText: (index: number, total: number) => `Page ${index + 1} of ${total}`,
        pageHeaderPositon: 'center',
        pageFooterText: (index: number, total: number) => total > 1 ? `Page ${index + 1}` : '',
        pageFooterPositon: 'right',
      })
    ]
  });

  // 初始内容：一页
  editor.commands.setContent(`
    <div data-type="page">
      <page-header></page-header>
      <page-content><p>第一页</p></page-content>
      <page-footer></page-footer>
    </div>
  `);

  // 测试添加页面
  setTimeout(() => {
    console.log('添加第二页...');
    const newPageContent = `
      <div data-type="page">
        <page-header></page-header>
        <page-content><p>第二页</p></page-content>
        <page-footer></page-footer>
      </div>
    `;
    
    editor.commands.insertContent(newPageContent);
    
    // 检查更新结果
    setTimeout(() => {
      const headers = document.querySelectorAll('.tiptap-page-header .center');
      console.log(`现在有 ${headers.length} 页`);
      headers.forEach((header, index) => {
        console.log(`页眉 ${index + 1}: "${header.textContent?.trim()}"`);
      });
      
      console.log('页面操作测试完成');
    }, 300);
  }, 300);

  return editor;
}

/**
 * 运行所有测试
 */
export function runAllTests() {
  console.log('=== 开始页眉页脚动态文本功能测试 ===');
  
  // 测试1：动态页码功能
  testDynamicPageNumbers();
  
  // 测试2：静态文本兼容性  
  setTimeout(() => testStaticTextCompatibility(), 1000);
  
  // 测试3：页面操作
  setTimeout(() => testPageOperations(), 2000);
  
  console.log('=== 所有测试已启动 ===');
}