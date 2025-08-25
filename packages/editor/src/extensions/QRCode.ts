import { Node, mergeAttributes } from "@tiptap/core";
import { IQRCodeOptions } from "../typing/QRCode";

/**
 * 合并样式字符串
 * @param existingStyle 现有样式
 * @param newStyle 新样式
 * @returns 合并后的样式字符串
 */
function mergeStyles(existingStyle: string, newStyle: string): string {
  const existing = existingStyle ? existingStyle.replace(/;?$/, ";") : "";
  const newStyleNormalized = newStyle.replace(/;?$/, ";");

  // 解析现有样式
  const existingRules = parseStyleString(existing);
  const newRules = parseStyleString(newStyleNormalized);

  // 合并样式规则
  const mergedRules = { ...existingRules, ...newRules };

  // 重新构建样式字符串
  return (
    Object.entries(mergedRules)
      .map(([property, value]) => `${property}: ${value}`)
      .join("; ") + ";"
  );
}

/**
 * 解析样式字符串为对象
 */
function parseStyleString(styleString: string): Record<string, string> {
  const rules: Record<string, string> = {};
  const declarations = styleString.split(";").filter((d) => d.trim());

  declarations.forEach((declaration) => {
    const [property, value] = declaration.split(":").map((s) => s.trim());
    if (property && value) {
      rules[property] = value;
    }
  });

  return rules;
}

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
      updateQRCode: (options: IQRCodeOptions & { src?: string }) => ReturnType;
    };
  }
  interface Storage {
    qrcode: {
      /**
       * 标识文档是否有二维码
       */
      hasQRCode: boolean;
    };
  }
}

export const QRCode = Node.create({
  name: "qrcode",
  group: "block",
  // inline: true,
  atom: true,
  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },
  addStorage() {
    return {
      // 标识文档是否有二维码
      hasQRCode: false,
    };
  },
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => {
          return (element as HTMLImageElement).src || null;
        },
      },
      size: {
        default: { value: 30, unit: "mm" },
        parseHTML: (element) => {
          // 从style中解析尺寸信息
          const width = element.style.width;
          if (!width) return { value: 30, unit: "mm" };
          const match = width.match(/^(\d+(?:\.\d+)?)(mm|px|cm)$/);
          return match
            ? {
                value: parseFloat(match[1]),
                unit: match[2],
              }
            : { value: 30, unit: "mm" };
        },
      },
      position: {
        default: { x: 10, y: 10, unit: "mm" },
        parseHTML: (element) => {
          const top = element.style.top;
          const left = element.style.left;
          if (!top || !left) return { x: 10, y: 10, unit: "mm" };
          const topMatch = top.match(/^(\d+(?:\.\d+)?)(mm|px|cm)$/);
          const leftMatch = left.match(/^(\d+(?:\.\d+)?)(mm|px|cm)$/);
          return {
            x: leftMatch ? parseFloat(leftMatch[1]) : 10,
            y: topMatch ? parseFloat(topMatch[1]) : 10,
            unit: topMatch ? topMatch[2] : "mm",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-type="qrcode"]',
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const { size, position, src } = node.attrs;

    // 基础属性
    const baseAttrs = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes
    );

    // 构建样式字符串
    let styleString = baseAttrs.style || "";

    // 添加位置样式
    if (position) {
      const positionStyle = `position: absolute; top: ${position.y}${position.unit}; left: ${position.x}${position.unit};`;
      styleString = mergeStyles(styleString, positionStyle);
    }

    // 添加尺寸样式
    if (size) {
      const sizeStyle = `width: ${size.value}${size.unit}; height: ${size.value}${size.unit};`;
      styleString = mergeStyles(styleString, sizeStyle);
    }

    // 添加基础样式
    const borderStyle = "border: 1px dashed #ccc;";
    styleString = mergeStyles(styleString, borderStyle);

    const attrs = mergeAttributes(baseAttrs, {
      "data-type": "qrcode",
      // "data-size": JSON.stringify(size),
      // "data-position": JSON.stringify(position),
      src: src || "",
      style: styleString,
    });

    return ["img", attrs];
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
          const attrs = {
            src: options.src || "",
            size: options.size,
            position: options.position,
          };
          const docJson = editor.getJSON();
          const newDocJson = {
            ...docJson,
            content: [
              {
                type: "qrcode",
                attrs,
              },
              ...docJson.content,
            ],
          };
          const result = commands.setContent(newDocJson);
          if (result) {
            this.storage.hasQRCode = true;
          }
          return result;
        },
      updateQRCode:
        (options: IQRCodeOptions & { src?: string }) =>
        ({ commands, editor, state }) => {
          // 验证编辑器状态
          if (!editor || !state) {
            console.error("编辑器状态无效");
            return false;
          }
          // const src = editor.$node('qrcode')?.attributes.src;
          // 更新节点属性，触发重新渲染
          return commands.updateAttributes(this.name, {
            options,
          });
        },
    };
  },
});
