// import type { Commands } from "@tiptap/core";
// import { Image } from "@tiptap/extension-image";
import { Node, mergeAttributes } from "@tiptap/core";
// import { default as qrcode } from "qrcode";
import { IQRCodeOptions } from "../typing/QRCode";

// 移除ID生成函数，简化实现

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    qrcode: {
      /**
       * 插入二维码
       * @param options 二维码选项
       * @example editor.commands.insertQRCode({
       * text: 'https://www.baidu.com',
       * size: { value: 100, unit: 'px' },
       * position: { x: 100, y: 100, unit: 'px' } })
       */
      insertQRCode: (options: IQRCodeOptions & { src?: string }) => ReturnType;
      /**
       * 删除二维码
       */
      deleteQRCode: () => ReturnType;
    };
  }
}

export const QRCode = Node.create({
  name: "qrcode",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },
  addStorage() {
    return {
      hasQRCode: false,
      // 移除qrCodeId字段，简化存储结构
    };
  },
  addAttributes() {
    return {
      src: {
        default: "",
      },
      text: {
        default: "",
      },
      size: {
        default: { value: 30, unit: "mm" },
      },
      position: {
        default: { x: 10, y: 10, unit: "mm" },
      },
      // 移除qrId属性，简化属性定义
    };
  },
  parseHTML() {
    return [
      {
        tag: 'img[data-type="qrcode"]',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { size, position } = HTMLAttributes;

    // 构建绝对定位样式
    const style = `
      position: absolute;
      left: ${position.x}${position.unit};
      top: ${position.y}${position.unit};
      width: ${size.value}${size.unit};
      height: ${size.value}${size.unit};
      z-index: 10;
      border: 1px dashed #ccc;
    `;

    const attrs = mergeAttributes(
      {
        "data-type": "qrcode",
        src: HTMLAttributes.src || "",
        style: style,
        "data-text": HTMLAttributes.text || "",
        // 移除data-qr-id属性，简化HTML属性
      },
      this.options.HTMLAttributes
    );

    return ["img", attrs];
  },
  onCreate() {
    // 初始化时检查现有二维码（基于节点类型）
    this.editor.state.doc.descendants((node) => {
      if (node.type.name === "qrcode") {
        this.storage.hasQRCode = true;
        return false; // 停止遍历
      }
    });
  },
  onUpdate() {
    // 文档更新时同步storage状态（基于节点类型）
    let hasQRCode = false;

    this.editor.state.doc.descendants((node) => {
      if (node.type.name === "qrcode") {
        hasQRCode = true;
        return false; // 停止遍历，因为只允许一个二维码
      }
    });

    this.storage.hasQRCode = hasQRCode;
  },
  addCommands() {
    return {
      insertQRCode:
        (options: IQRCodeOptions & { src?: string }) =>
        ({ commands, editor, state }) => {
          // 验证编辑器状态
          if (!editor || !state || !state.doc) {
            console.error("编辑器状态无效");
            return false;
          }

          // 检查并删除已存在的二维码
          if (this.storage.hasQRCode) {
            commands.deleteQRCode();
          }

          // 获取文档末尾位置
          const docSize = state.doc.content.size;
          console.log("docSize:", docSize);
          // 使用insertContentAt在文档末尾插入
          const result = commands.insertContentAt(1, {
            type: this.name,
            attrs: {
              src: options.src || "",
              text: options.text,
              size: options.size,
              position: options.position,
            },
          });

          if (result) {
            this.storage.hasQRCode = true;
          }

          return result;
        },
      deleteQRCode:
        () =>
        ({ tr, state }) => {
          let deleted = false;

          state.doc.descendants((node, pos) => {
            if (node.type.name === "qrcode" && !deleted) {
              tr.delete(pos, pos + node.nodeSize);
              deleted = true;
              this.storage.hasQRCode = false;
              return false;
            }
          });

          return deleted;
        },
    };
  },
});
