import { Transaction } from "@tiptap/pm/state";

/**
 * 输入类型枚举
 */
export enum InputType {
  DIRECT = "direct",           // 直接输入（英文字符）
  COMPOSITION = "composition", // 输入法组合输入（中文、日文等）
  PASTE = "paste",            // 粘贴操作
  PROGRAMMATIC = "programmatic" // 程序化输入
}

/**
 * 输入检测结果接口
 */
export interface InputDetectionResult {
  type: InputType;
  isValid: boolean;        // 是否应该处理自动换页
  content?: string;        // 输入的内容
  length: number;          // 输入内容长度
}

/**
 * 输入法检测器类
 * 用于检测用户输入类型并决定是否触发自动换页
 */
export class InputDetector {
  private isComposing = false;
  private compositionContent = "";
  
  /**
   * 设置输入法组合状态
   * @param isComposing 是否正在组合输入
   * @param content 组合输入的内容
   */
  setCompositionState(isComposing: boolean, content?: string): void {
    this.isComposing = isComposing;
    if (content !== undefined) {
      this.compositionContent = content;
    }
  }

  /**
   * 检测事务中的输入类型
   * @param transaction TipTap事务对象
   * @returns 输入检测结果
   */
  detectInput(transaction: Transaction): InputDetectionResult {
    // 如果正在输入法组合中，不处理自动换页
    if (this.isComposing) {
      return {
        type: InputType.COMPOSITION,
        isValid: false,
        content: this.compositionContent,
        length: this.compositionContent.length
      };
    }

    // 检查事务的输入类型
    const inputType = (transaction as any).inputType;
    
    // 处理粘贴操作
    if (inputType === "insertCompositionText" || 
        inputType === "insertFromPaste" || 
        inputType === "insertFromDrop") {
      const content = this.extractContentFromTransaction(transaction);
      return {
        type: InputType.PASTE,
        isValid: true, // 粘贴操作需要处理自动换页
        content,
        length: content.length
      };
    }

    // 处理程序化输入
    if (!inputType || inputType === "insertText") {
      const content = this.extractContentFromTransaction(transaction);
      
      // 如果有实际内容变化，认为是有效输入
      if (content.length > 0) {
        return {
          type: InputType.DIRECT,
          isValid: true,
          content,
          length: content.length
        };
      }
    }

    // 默认为程序化输入，不处理
    return {
      type: InputType.PROGRAMMATIC,
      isValid: false,
      content: "",
      length: 0
    };
  }

  /**
   * 从事务中提取输入内容
   * @param transaction 事务对象
   * @returns 提取的内容字符串
   */
  private extractContentFromTransaction(transaction: Transaction): string {
    let content = "";
    
    transaction.steps.forEach(step => {
      if ((step as any).jsonID === "replace") {
        const stepData = (step as any);
        if (stepData.slice && stepData.slice.content) {
          // 尝试提取文本内容
          stepData.slice.content.forEach((fragment: any) => {
            if (fragment.content) {
              fragment.content.forEach((node: any) => {
                if (node.text) {
                  content += node.text;
                }
              });
            } else if (fragment.text) {
              content += fragment.text;
            }
          });
        }
      }
    });

    return content;
  }

  /**
   * 检查输入是否应该触发自动换页
   * @param transaction 事务对象
   * @returns 是否应该触发自动换页
   */
  shouldTriggerAutoPageBreak(transaction: Transaction): boolean {
    const result = this.detectInput(transaction);
    return result.isValid && result.length > 0;
  }

  /**
   * 重置检测器状态
   */
  reset(): void {
    this.isComposing = false;
    this.compositionContent = "";
  }
}

/**
 * 全局输入检测器实例
 * 可以在多个组件间共享状态
 */
export const globalInputDetector = new InputDetector();

/**
 * 输入法事件监听器工具
 * 用于在DOM级别监听输入法事件
 */
export class CompositionEventListener {
  private detector: InputDetector;
  private element: HTMLElement | null = null;

  constructor(detector: InputDetector) {
    this.detector = detector;
  }

  /**
   * 绑定到指定DOM元素
   * @param element 要监听的DOM元素
   */
  bind(element: HTMLElement): void {
    this.unbind(); // 先解绑之前的监听
    
    this.element = element;
    element.addEventListener('compositionstart', this.handleCompositionStart);
    element.addEventListener('compositionupdate', this.handleCompositionUpdate);
    element.addEventListener('compositionend', this.handleCompositionEnd);
  }

  /**
   * 解绑事件监听
   */
  unbind(): void {
    if (this.element) {
      this.element.removeEventListener('compositionstart', this.handleCompositionStart);
      this.element.removeEventListener('compositionupdate', this.handleCompositionUpdate);
      this.element.removeEventListener('compositionend', this.handleCompositionEnd);
      this.element = null;
    }
  }

  private handleCompositionStart = (event: CompositionEvent): void => {
    this.detector.setCompositionState(true, event.data || "");
  };

  private handleCompositionUpdate = (event: CompositionEvent): void => {
    this.detector.setCompositionState(true, event.data || "");
  };

  private handleCompositionEnd = (event: CompositionEvent): void => {
    this.detector.setCompositionState(false, event.data || "");
  };
}