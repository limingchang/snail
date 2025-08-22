// import type { Commands } from "@tiptap/core";
// import { Image } from "@tiptap/extension-image";
import { Node } from "@tiptap/core";
import { default as qrcode } from "qrcode";
import { IQRCodeOptions } from "../typing/QRCode";

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
      insertQRCode: (options: IQRCodeOptions) => Promise<ReturnType>;
    };
  }
}

export const QRCode = Node.create({
  name: "qrcode",
  addOptions() {
    return {
      allowBase64: true,
    };
  },
  addAttributes() {
    return {
      'data-type': {
        default: 'qrcode',
      },
      src: {
        default: null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },
  addCommands() {
    return {
      insertQRCode:
        (options: IQRCodeOptions) =>
         async({ commands }) => {
          const { text, size, position } = options;
          const src = await qrcode.toDataURL(text);
          return commands.insertContentAt(0, {
            type: this.name,
            attrs: {
              src,
              style: `position: absolute; left: ${position.x}${position.unit}; top: ${position.y}${position.unit};width:${size.value}${size.unit};height:${size.value}${size.unit};`,
            },
          });
        },
    };
  },
});
