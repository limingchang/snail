import { Node, mergeAttributes } from "@tiptap/core";
// import type { Editor } from "@tiptap/core";
// import type { Transaction, EditorState } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PageOptions, PaperSize } from "./typing";
// import { defaultPage } from "../../contents/defaultPage";
// import { PageStorage } from '../../typing';

import { PageHeader } from "./pageHeader/index";
import { PageFooter } from "./pageFooter/index";
import {
  HeaderFooterBlock,
  PageContent,
} from "./content";

export const Page = Node.create<PageOptions>({
  name: "page",
  // 页面可以包含多个块级元素，如段落、标题等
  content: "(pageHeader | block | pageFooter)+",

  // 页面属于block组，使其可以作为文档的直接子元素
  group: "block",

  // 不是顶级节点，顶级节点仍然是doc
  topNode: false,
  // 优先级高于其他块级元素，确保页面在文档结构中正确排序
  // priority: 10002,

  addOptions() {
    return {
      pageFormat: "A4",
      header: {
        text: "页眉",
        position: "right",
        height: 30,
        line: true,
      },
      footer: {
        text: (index, total) => `第${index}页，共${total}页`,
        position: "center",
        height: 35,
        line: false,
      },
      pageGap: 10, // Page gap in pixels
      HTMLAttributes: {},
    };
  },

  // 监听文档变化
  onUpdate({ editor }) {
    // const total = editor.$nodes("page")?.length || 0;
    // console.log("total[page-update]", total);
  },

  onCreate() {},

  addExtensions() {
    return [
      PageHeader.configure(this.options.header),
      PageFooter.configure(this.options.footer),
      // HeaderFooterLeft,
      // HeaderFooterCenter,
      // HeaderFooterRight,
      HeaderFooterBlock,
      PageContent,
    ];
  },

  addAttributes() {
    return {
      // 添加自定义属性
      index: {
        default: 0,
      },
      pageFormat: {
        default: "A4",
      },
      orientation: {
        default: "portrait",// 默认纵向
        parseHTML(element) {
          if(element.style.width > element.style.height){
            return "landscape"
          }
          return "portrait"
        },
      },
      margins: {
        default: {
          top: "20mm",
          right: "20mm",
          bottom: "20mm",
          left: "20mm",
        },
        parseHTML(element) {
          return {
            margins: {
              top: element.style.marginTop,
              right: element.style.marginRight,
              bottom: element.style.marginBottom,
              left: element.style.marginLeft,
            },
          };
        },
        renderHTML(attributes) {
          return {
            style: `
            padding-top: ${attributes.margins.top};
            padding-right: ${attributes.margins.right};
            padding-bottom: ${attributes.margins.bottom};
            padding-left: ${attributes.margins.left};
          `,
          };
        },
      },
    };
  },

  addNodeView() {
    return ({ editor, node }) => {
      // 创建页面容器
      const pageContiner = document.createElement("div");
      pageContiner.classList.add("tiptap-page-wrapper");
      console.log('render page')
      // 获取页面格式和方向
      const pageFormat = node.attrs.pageFormat || "A4";
      const orientation = node.attrs.orientation || "portrait";

      // 计算页面尺寸
      let paperSize = PaperSize[pageFormat as keyof typeof PaperSize];
      if (!paperSize) {
        paperSize = PaperSize.A4; // 默认使用A4
      }

      let width: number = paperSize.width;
      let height: number = paperSize.height;

      // 如果是横向模式，交换宽高
      if (orientation === "landscape") {
        const temp = width;
        width = height;
        height = temp;
      }

      // 毫米转像素 (1mm = 3.78px, 基于96DPI)
      // const widthPx = width * 3.78;
      // const heightPx = height * 3.78;

      // 设置页面容器样式
      // pageContiner.style.position = "relative";
      pageContiner.style.width = `${width}mm`;
      pageContiner.style.height = `${height}mm`;
      pageContiner.style.backgroundColor = "#fff";
      pageContiner.style.borderRadius = "15px";

      // 创建内容容器
      const contentArea = document.createElement("div");
      contentArea.classList.add("tiptap-page");

      // 设置边距
      const margins = node.attrs.margins || {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      };

      contentArea.style.padding = `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
      contentArea.style.height = `calc(${height}mm - ${margins.top} - ${margins.bottom})`;
      contentArea.style.position = "relative";

      pageContiner.appendChild(contentArea);

      const breakPageDiv = document.createElement("div");
      breakPageDiv.style.breakAfter = "page";
      pageContiner.appendChild(breakPageDiv);

      return {
        dom: pageContiner,
        contentDOM: contentArea,
      };
    };
  },
  // 解析HTML
  parseHTML() {
    return [
      {
        tag: "page",
      },
    ];
  },
  // 渲染HTML
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page",
      }),
    ];
  },

  addCommands() {
    return {
      setPageMargins:
        (margins) =>
        ({ editor, tr, state, commands, dispatch }) => {
          const { selection } = state;
          // 查找当前页面节点
          let pageNode: any = null;
          let pagePos = -1;

          // 从当前位置向上查找页面节点
          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (
              node.type.name === "page" &&
              pos <= selection.from &&
              pos + node.nodeSize > selection.from
            ) {
              pageNode = node;
              pagePos = pos;
              return false; // 停止遍历
            }
          });
          // 更新节点属性
          if (pageNode && pagePos >= 0) {
            const newMargins = Object.assign({},(pageNode as ProseMirrorNode).attrs.margins,margins)
            // 执行属性更新
            tr.setNodeMarkup(pagePos, null, {
              ...(pageNode as ProseMirrorNode).attrs,
              margins: newMargins,
            });
            
            // // 查找并更新当前页面的页头页脚节点，触发重新渲染
            // let headerNode: any = null;
            // let headerPos = -1;
            // let footerNode: any = null;
            // let footerPos = -1;
            
            // state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            //   // 在当前页面范围内查找页头节点
            //   if (node.type.name === "pageHeader" && pos > pagePos && pos < pagePos + pageNode.nodeSize) {
            //     headerNode = node;
            //     headerPos = pos;
            //     console.log('head:',headerNode)
            //   }
            //   // 在当前页面范围内查找页脚节点
            //   if (node.type.name === "pageFooter" && pos > pagePos && pos < pagePos + pageNode.nodeSize) {
            //     footerNode = node;
            //     footerPos = pos;
            //     console.log('foot:',footerNode)
            //   }
            //   // 继续遍历直到找到所有需要的节点
            //   return true;
            // });
            
            // // 更新页头节点，添加时间戳属性以触发重新渲染
            // if (headerNode && headerPos >= 0) {
            //   tr.setNodeMarkup(headerPos, null, {
            //     ...headerNode.attrs,
            //     // 添加时间戳属性强制重新渲染，这样页头会重新计算位置
            //     _updateTimestamp: Date.now()
            //   });
            // }
            
            // // 更新页脚节点，添加时间戳属性以触发重新渲染
            // if (footerNode && footerPos >= 0) {
            //   tr.setNodeMarkup(footerPos, null, {
            //     ...footerNode.attrs,
            //     // 添加时间戳属性强制重新渲染，这样页脚会重新计算位置
            //     _updateTimestamp: Date.now()
            //   });
            // }
            setTimeout(() => {
                commands._flushHeader(pageNode,pagePos);
              }, 500);
            if (dispatch) {
              dispatch(tr);
              
            }
          }
          return true;
        },
    };
  },
});
