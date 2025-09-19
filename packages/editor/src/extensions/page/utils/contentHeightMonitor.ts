import type { Editor } from "@tiptap/core";
import type { Node } from "prosemirror-model";

/**
 * 溢出分析结果接口
 */
export interface OverflowAnalysis {
  shouldCreateNewPage: boolean;
  splitIndex?: number;
  paperPos?: number;
  paperNode?: Node;
  overflowHeight?: number;
  splitElement?: HTMLElement;
}

/**
 * 内容高度监测器接口
 */
export interface PageContentMonitor {
  // 监测配置
  debounceDelay: number;      // 防抖延迟 (默认 100ms)
  
  // 监测方法
  startMonitoring(editor: Editor): void;
  stopMonitoring(): void;
  checkRealContentOverflow(contentElement: HTMLElement, paperElement: HTMLElement): boolean;
  handleContentOverflow(editor: Editor, paperIndex: number): void;
  
  // 新增：用户输入监听
  setupInputListeners(editor: Editor): void;
  cleanupInputListeners(): void;
}

/**
 * 内容高度监测器实现类
 * 负责监测页面内容高度变化，实现真正实时的自动分页功能
 */
export class ContentHeightMonitor implements PageContentMonitor {
  private observer: ResizeObserver | null = null;
  private inputObserver: MutationObserver | null = null;
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;
  private debounceTimer: number | null = null;
  private currentEditor: Editor | null = null;
  
  debounceDelay = 50; // 减少延迟，提高响应性

  /**
   * 开始监测所有 paper 节点的内容高度
   */
  startMonitoring(editor: Editor): void {
    this.currentEditor = editor;
    
    // 1. 设置 ResizeObserver 监测 DOM 尺寸变化
    this.observer = new ResizeObserver(entries => {
      this.debounceExecution(() => {
        this.handleResizeEntries(editor, entries);
      });
    });

    // 2. 设置用户输入监听
    this.setupInputListeners(editor);
    
    // 3. 监测所有现有的 paper 节点
    this.observeExistingPapers();
  }

  /**
   * 防抖执行方法
   */
  private debounceExecution(callback: () => void): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = window.setTimeout(callback, this.debounceDelay);
  }

  /**
   * 监测现有的 paper 元素
   */
  private observeExistingPapers(): void {
    const paperElements = document.querySelectorAll('.s-editor-paper-content');
    paperElements.forEach(element => {
      this.observer?.observe(element);
    });
  }

  /**
   * 设置用户输入监听
   */
  setupInputListeners(editor: Editor): void {
    // 监听 DOM 变化
    this.inputObserver = new MutationObserver((mutations) => {
      this.debounceExecution(() => {
        this.handleInputMutations(editor, mutations);
      });
    });

    // 监听整个编辑器区域
    const editorElement = editor.view.dom;
    this.inputObserver.observe(editorElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 监听键盘事件（特别是回车键）
    this.keyboardListener = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        this.handleEnterKey(editor, event);
      }
    };
    
    editorElement.addEventListener('keydown', this.keyboardListener);
  }

  /**
   * 清理用户输入监听
   */
  cleanupInputListeners(): void {
    if (this.inputObserver) {
      this.inputObserver.disconnect();
      this.inputObserver = null;
    }

    if (this.keyboardListener && this.currentEditor) {
      this.currentEditor.view.dom.removeEventListener('keydown', this.keyboardListener);
      this.keyboardListener = null;
    }
  }

  /**
   * 检查内容是否真正溢出（移除阈值依赖）
   */
  checkRealContentOverflow(contentElement: HTMLElement, paperElement: HTMLElement): boolean {
    const paperHeight = contentElement.clientHeight;
    const contentHeight = contentElement.scrollHeight;
    
    // 直接比较实际高度，不使用阈值
    return contentHeight > paperHeight;
  }

  /**
   * 处理尺寸变化事件
   */
  private handleResizeEntries(editor: Editor, entries: ResizeObserverEntry[]): void {
    requestAnimationFrame(() => {
      entries.forEach(entry => {
        const contentElement = entry.target as HTMLElement;
        const paperElement = contentElement.closest('.s-editor-paper');
        
        if (paperElement) {
          const paperIndex = parseInt(paperElement.getAttribute('data-index') || '1');
          this.checkPaperContentOverflow(editor, paperIndex, contentElement);
        }
      });
    });
  }

  /**
   * 检查指定页面的内容是否溢出
   */
  private checkPaperContentOverflow(
    editor: Editor, 
    paperIndex: number, 
    contentElement: HTMLElement
  ): void {
    const paperElement = contentElement.closest('.s-editor-paper') as HTMLElement;
    
    // 使用新的实时检查方法
    if (this.checkRealContentOverflow(contentElement, paperElement)) {
      this.handleContentOverflow(editor, paperIndex);
    }
  }

  /**
   * 处理输入变化（新增）
   */
  private handleInputMutations(editor: Editor, mutations: MutationRecord[]): void {
    // 仅在有实际内容变化时才触发检查
    const hasContentChange = mutations.some(mutation => 
      mutation.type === 'childList' || 
      mutation.type === 'characterData' ||
      (mutation.type === 'attributes' && mutation.attributeName === 'data-index')
    );

    if (hasContentChange) {
      this.checkAllPapersForOverflow(editor);
    }
  }

  /**
   * 处理回车键（新增）
   */
  private handleEnterKey(editor: Editor, event: KeyboardEvent): void {
    // 检查是否在最后一个段落按下回车
    if (this.isInLastParagraph(editor) && this.isCurrentPageFull(editor)) {
      // 防止默认行为，自动创建新页
      event.preventDefault();
      this.createNewPageAndJump(editor);
    }
  }

  /**
   * 检查是否在最后一个段落
   */
  private isInLastParagraph(editor: Editor): boolean {
    const { selection } = editor.state;
    const { $from } = selection;
    
    // 查找当前 paper 节点
    let currentPaper = null;
    for (let i = $from.depth; i >= 0; i--) {
      const node = $from.node(i);
      if (node.type.name === 'paper') {
        currentPaper = node;
        break;
      }
    }
    
    if (!currentPaper) return false;
    
    // 检查是否在最后一个子节点
    const lastChild = currentPaper.lastChild;
    return lastChild && lastChild.type.name === 'paragraph';
  }

  /**
   * 检查当前页面是否已满
   */
  private isCurrentPageFull(editor: Editor): boolean {
    const { selection } = editor.state;
    const paperNodes = editor.$nodes("paper");
    
    const currentPaper = paperNodes?.find((nodePos: any) => {
      const start = nodePos.pos;
      const end = start + nodePos.node.nodeSize;
      return selection.from >= start && selection.from <= end;
    });
    
    if (!currentPaper) return false;
    
    // 获取对应的 DOM 元素
    try {
      const paperElement = editor.view.domAtPos(currentPaper.pos).node.parentElement;
      const contentElement = paperElement?.querySelector('.s-editor-paper-content') as HTMLElement;
      
      if (contentElement) {
        return this.checkRealContentOverflow(contentElement, paperElement!);
      }
    } catch (error) {
      console.warn('Error checking if page is full:', error);
    }
    
    return false;
  }

  /**
   * 创建新页面并跳转
   */
  private createNewPageAndJump(editor: Editor): void {
    // 执行 addNewPage 命令
    const success = editor.chain().addNewPage().run();
    
    if (success) {
      // 将光标移动到新页面的开始位置
      setTimeout(() => {
        const paperNodes = editor.$nodes("paper");
        if (paperNodes && paperNodes.length > 0) {
          const lastPaper = paperNodes[paperNodes.length - 1];
          const newPos = lastPaper.pos + 1; // 移动到新页面内容开始
          editor.commands.focus(newPos);
        }
      }, 50);
    }
  }

  /**
   * 检查所有页面是否溢出
   */
  private checkAllPapersForOverflow(editor: Editor): void {
    const paperNodes = editor.$nodes("paper");
    paperNodes?.forEach((nodePos: any) => {
      try {
        const paperElement = editor.view.domAtPos(nodePos.pos).node.parentElement;
        const contentElement = paperElement?.querySelector('.s-editor-paper-content') as HTMLElement;
        
        if (contentElement && this.checkRealContentOverflow(contentElement, paperElement!)) {
          this.handleContentOverflow(editor, nodePos.node.attrs.index);
        }
      } catch (error) {
        console.warn('Error checking paper overflow:', error);
      }
    });
  }

  /**
   * 处理内容溢出情况
   */
  handleContentOverflow(editor: Editor, paperIndex: number): void {
    // 获取当前 paper 节点
    const paperNodes = editor.$nodes("paper");
    const currentPaper = paperNodes?.find(nodePos => 
      nodePos.node.attrs.index === paperIndex
    );

    if (!currentPaper) return;

    // 分析溢出内容
    const overflowAnalysis = this.analyzeOverflowContent(
      editor, 
      currentPaper.pos, 
      currentPaper.node
    );

    if (overflowAnalysis.shouldCreateNewPage) {
      this.createPageWithOverflowContent(editor, overflowAnalysis);
    }
  }

  /**
   * 分析溢出内容，确定分页位置
   */
  private analyzeOverflowContent(
    editor: Editor, 
    paperPos: number, 
    paperNode: Node
  ): OverflowAnalysis {
    // 获取内容 DOM 元素
    const paperElement = editor.view.domAtPos(paperPos).node.parentElement;
    const contentElement = paperElement?.querySelector('.s-editor-paper-content');
    
    if (!contentElement) {
      return { shouldCreateNewPage: false };
    }

    const containerHeight = contentElement.clientHeight;
    const children = Array.from(contentElement.children);
    let accumulatedHeight = 0;
    let splitIndex = -1;

    // 找到需要分页的位置
    for (let i = 0; i < children.length; i++) {
      const childHeight = (children[i] as HTMLElement).offsetHeight;
      
      // 直接检查是否超出容器高度
      if (accumulatedHeight + childHeight > containerHeight) {
        splitIndex = i;
        break;
      }
      
      accumulatedHeight += childHeight;
    }

    return {
      shouldCreateNewPage: splitIndex > 0,
      splitIndex,
      paperPos,
      paperNode
    };
  }

  /**
   * 创建包含溢出内容的新页面
   */
  private createPageWithOverflowContent(
    editor: Editor, 
    analysis: OverflowAnalysis
  ): void {
    if (!analysis.shouldCreateNewPage || 
        analysis.splitIndex === undefined ||
        analysis.paperPos === undefined ||
        analysis.paperNode === undefined) return;

    const { paperPos, paperNode, splitIndex } = analysis;
    
    // 1. 创建新页面
    const newPageIndex = paperNode.attrs.index + 1;
    
    // 2. 计算插入位置（在当前 paper 后）
    const insertPos = paperPos + paperNode.nodeSize;
    
    // 3. 提取溢出内容
    const overflowContent = this.extractOverflowContent(
      editor, 
      paperPos, 
      splitIndex
    );
    
    // 4. 创建包含溢出内容的新页面
    this.createNewPageWithContent(
      editor, 
      insertPos, 
      newPageIndex, 
      overflowContent
    );
    
    // 5. 更新后续页面的索引
    this.updateSubsequentPageIndices(editor, newPageIndex);
  }

  /**
   * 提取溢出的内容节点
   */
  private extractOverflowContent(
    editor: Editor, 
    paperPos: number, 
    splitIndex: number
  ): Node[] {
    const content: Node[] = [];
    
    // 通过事务提取溢出的内容节点
    const tr = editor.state.tr;
    const paper = editor.state.doc.nodeAt(paperPos);
    
    if (paper) {
      paper.content.forEach((child, index) => {
        if (index >= splitIndex) {
          content.push(child);
        }
      });
      
      // 从原页面删除溢出内容
      let deletePos = paperPos + 1;
      for (let i = 0; i < splitIndex; i++) {
        deletePos += paper.child(i).nodeSize;
      }
      
      // 计算需要删除的内容大小
      let deleteSize = 0;
      for (let i = splitIndex; i < paper.childCount; i++) {
        deleteSize += paper.child(i).nodeSize;
      }
      
      if (deleteSize > 0) {
        tr.delete(deletePos, deletePos + deleteSize);
        editor.view.dispatch(tr);
      }
    }
    
    return content;
  }

  /**
   * 创建包含指定内容的新页面
   */
  private createNewPageWithContent(
    editor: Editor, 
    insertPos: number, 
    pageIndex: number, 
    content: Node[]
  ): void {
    const schema = editor.schema;
    const pageExtension = editor.extensionManager.extensions.find(ext => ext.name === 'page');
    
    // 创建新页面属性
    const paperAttrs = {
      index: pageIndex,
      paperFormat: "A4",
      orientation: "portrait", 
      margins: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm"
      },
      header: pageExtension?.options.header,
      footer: pageExtension?.options.footer
    };

    // 创建包含内容的新页面
    const paperType = schema.nodes.paper;
    if (paperType) {
      const newPaper = paperType.create(paperAttrs, content);
      
      const tr = editor.state.tr;
      tr.insert(insertPos, newPaper);
      editor.view.dispatch(tr);
    }
  }

  /**
   * 更新后续页面的索引
   */
  private updateSubsequentPageIndices(editor: Editor, fromIndex: number): void {
    const paperNodes = editor.$nodes("paper");
    
    if (paperNodes) {
      const tr = editor.state.tr;
      
      paperNodes.forEach(nodePos => {
        if (nodePos.node.attrs.index > fromIndex) {
          tr.setNodeAttribute(
            nodePos.pos, 
            'index', 
            nodePos.node.attrs.index + 1
          );
        }
      });
      
      if (tr.docChanged) {
        editor.view.dispatch(tr);
      }
    }
  }

  /**
   * 停止监测
   */
  stopMonitoring(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.cleanupInputListeners();
    this.currentEditor = null;
  }
}