import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Paper } from "./paper";

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
        ({ editor, tr, state, commands, dispatch }) => {
          const { selection } = state;
          const total = editor.$nodes("paper")?.length || 0;
          console.log(editor.$doc);
          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (
              node.type.name === "paper" &&
              pos <= selection.from &&
              pos + node.nodeSize > selection.from
            ) {
              const insertPos = pos + node.nodeSize + 2;
              console.log(pos, insertPos, node);
              commands.insertContentAt(
                insertPos,
                editor.schema.nodes.siglePage.create({
                  ...node.attrs,
                  index: total + 1,
                })
              );
              if (dispatch) {
                dispatch(tr);
              }
              return false; // 停止遍历
            }
          });
          return true;
        },
    };
  },
});
