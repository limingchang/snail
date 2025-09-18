import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { Paper } from "./paper";

import {defaultQRCode} from '../../contents/deafultQRCode'

import { PageOptions } from "./typing/page";

export const Page = Node.create<PageOptions>({
  name: "page",
  group: "block",
  content: "paper+",
  topNode: false,
  addOptions() {
    return {
      paperFormat: "A4",
      header: undefined,
      footer: undefined,
      pageGap: 8,
      HTMLAttributes: {},
    };
  },
  addExtensions() {
    return [
      Paper.configure({
        paperFormat: this.options.paperFormat,
        header: this.options.header,
        footer: this.options.footer,
      }),
    ];
  },

  addNodeView() {
    return ({ node, view, getPos, editor }) => {
      // 创建页面容器
      const pageContiner = document.createElement("div");
      pageContiner.classList.add("s-editor-page-wrapper");
      pageContiner.style.display = "flex";
      pageContiner.style.alignItems = "center";
      pageContiner.style.flexDirection = "column";
      // pageContiner.style.borderRadius = "15px";
      pageContiner.style.backgroundColor = "#ccc";
      pageContiner.style.gap = `${this.options.pageGap}px`;

      return {
        dom: pageContiner,
        contentDOM: pageContiner,
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
      "page",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page",
      }),
    ];
  },
  // 命令
  addCommands() {
    return {
      setPageMargins:
        (margins) =>
        ({ editor, tr, state, commands, dispatch }) => {
          // state.doc.descendants((node: ProseMirrorNode, pos: number) => {
          //   if (
          //     node.type.name === "siglePage" &&
          //     pos <= selection.from &&
          //     pos + node.nodeSize > selection.from
          //   ) {
          //     console.log(pos, node);
          //   }
          // });

          const pages = editor.$nodes("paper");
          pages?.forEach((pageNode) => {
            const pos = pageNode.pos;
            //
            const newMargins = Object.assign(
              {},
              pageNode.attributes.margins,
              margins
            );
            tr.setNodeAttribute(pos - 1, "margins", newMargins);
            if (dispatch) {
              dispatch(tr);
            }
            console.log(pos, newMargins);
          });

          console.log(pages);

          return true;
        },
      setPageOrientation:
        (orientation) =>
        ({ editor, tr, state, commands, dispatch }) => {
          const { selection } = state;
          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (
              node.type.name === "paper" &&
              pos <= selection.from &&
              pos + node.nodeSize > selection.from
            ) {
              tr.setNodeAttribute(pos, "orientation", orientation);
              if (dispatch) {
                dispatch(tr);
              }
              return false; // 停止遍历
            }
          });
          return true;
        },
      setPageFormat:
        (paperFormat) =>
        ({ editor, tr, state, commands, dispatch }) => {
          const { selection } = state;
          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (
              node.type.name === "paper" &&
              pos <= selection.from &&
              pos + node.nodeSize > selection.from
            ) {
              tr.setNodeAttribute(pos, "paperFormat", paperFormat);
              if (dispatch) {
                dispatch(tr);
              }
              return false; // 停止遍历
            }
          });
          return true;
        },
      addNewPage:
        () =>
        ({ editor, commands }) => {
          // 验证编辑器状态
          if (!editor?.state?.doc) {
            console.error("编辑器状态无效");
            return false;
          }

          const { selection } = editor.state;
          const total = editor.$nodes("paper")?.length || 0;
          let insertPos = null;

          // 查找当前paper节点并计算插入位置
          editor.state.doc.descendants((node, pos) => {
            if (
              node.type.name === "paper" &&
              pos <= selection.from &&
              pos + node.nodeSize > selection.from
            ) {
              insertPos = pos + node.nodeSize;
              return false;
            }
          });

          if (insertPos === null) {
            // 如果没找到paper节点，插入到文档末尾
            insertPos = editor.state.doc.content.size;
          }

          // 使用insertContentAt创建新页面
          // return commands.insertContentAt(insertPos, {
          //   type: "paper",
          //   attrs: {
          //     index: total + 1
          //   },
          //   content: [
          //     {
          //       type: "paragraph",
          //       content: [] // 让Tiptap自动处理空段落状态
          //     }
          //   ]
          // });
          // commands.insertContentAt(2,{type:"paragraph",content:[{type:'text',text:'测试12313123'}]},{updateSelection:true})
          // commands.insertContentAt(3, 'Example Text',{updateSelection:true})

          // const attrs = {
          //   src: options.src || "",
          //   size: options.size,
          //   position: options.position,
          // };
          // const qrcodeContent = {
          //   type: this.name,
          //   attrs,
          // };
          // 有page扩展时，pos为2则在第一页插入，pos为0，在doc插入
          console.log("insertPos", defaultQRCode);
          const result = commands.insertContent( defaultQRCode)
          return result
        },
    };
  },
});
