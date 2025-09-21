import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Paper } from "./paper";
import { ContentHeightMonitor } from "./utils/contentHeightMonitor";

import { defaultQRCode } from "../../contents/deafultQRCode";

import { PageOptions } from "./typing/page";

export const Page = Node.create<PageOptions & { autoPageBreak?: boolean }>({
  name: "page",
  group: "block",
  // content: "paper+",
  content:()=>{
    return 'paper+'
  },
  topNode: false,
  addOptions() {
    return {
      paperFormat: "A4",
      header: undefined,
      footer: undefined,
      pageGap: 8,
      autoPageBreak: true,  // 新增：自动分页开关
      HTMLAttributes: {},
    };
  },

  addStorage() {
    return {
      contentMonitor: null as ContentHeightMonitor | null,
    };
  },

  onCreate() {
    // 初始化内容监测器
    if (this.options.autoPageBreak) {
      this.storage.contentMonitor = new ContentHeightMonitor();
    }
  },

  onUpdate() {
    // 启动监测
    if (this.storage.contentMonitor && this.editor) {
      this.storage.contentMonitor.startMonitoring(this.editor);
    }
  },

  onDestroy() {
    // 清理监测器
    if (this.storage.contentMonitor) {
      this.storage.contentMonitor.stopMonitoring();
      this.storage.contentMonitor = null;
    }
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
    console.log(this.parent)
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
      'page',
      mergeAttributes(HTMLAttributes, this.options.HTMLAttributes!),
    ];
  },
  // 命令
  addCommands() {
    return {
      setPageMargins:
        (margins) =>
        ({ editor, tr, state, commands, dispatch }) => {
          const pages = editor.$nodes("paper");
          pages?.forEach((pageNode) => {
            const pos = pageNode.pos;
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
        ({ editor, commands, tr, dispatch }) => {
          // 验证编辑器状态
          if (!editor?.state?.doc) {
            console.error("编辑器状态无效");
            return false;
          }

          const { state } = editor;
          const { selection } = state;
          const paperNodes = editor.$nodes("paper");
          const total = paperNodes?.length || 0;
          
          // 获取页面扩展配置
          const pageExtension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'page');
          const paperExtension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'paper');
          const header = pageExtension?.options.header || paperExtension?.options.header;
          const footer = pageExtension?.options.footer || paperExtension?.options.footer;

          // 创建 paper 节点属性
          const paperAttrs = {
            index: total + 1,
            paperFormat: this.options.paperFormat || "A4",
            orientation: "portrait",
            margins: {
              top: "20mm",
              right: "20mm", 
              bottom: "20mm",
              left: "20mm"
            },
            header,
            footer
          };

          // 计算插入位置
          let insertPos: number;
          
          if (paperNodes && paperNodes.length > 0) {
            // 找到当前光标所在的 paper 节点
            const currentPaper = paperNodes.find((nodePos: any) => {
              const start = nodePos.pos;
              const end = start + nodePos.node.nodeSize;
              return selection.from >= start && selection.from <= end;
            });

            if (currentPaper) {
              // 在当前 paper 节点后插入
              // 注意：TipTap 的 NodePos.pos 是节点开始位置，需要加上节点大小
              insertPos = currentPaper.pos + currentPaper.node.nodeSize;
            } else {
              // 在最后一个 paper 节点后插入
              const lastPaper = paperNodes[paperNodes.length - 1];
              insertPos = lastPaper.pos + lastPaper.node.nodeSize;
            }
          } else {
            // 如果没有 paper 节点，在文档开始位置插入（page 节点内部）
            insertPos = 1; // page 节点内部的第一个位置
          }

          // 使用 TipTap 的 insertContent 命令插入新页面
          // 创建包含空段落的 paper 节点 JSON 结构
          const paperContent = {
            type: 'paper',
            attrs: paperAttrs,
            content: [
              {
                type: 'paragraph',
                content: []
              }
            ]
          };

          try {
            // 使用 insertContentAt 插入节点
            const result = commands.insertContentAt(insertPos, paperContent);
            
            if (result) {
              // 更新所有 paper 节点的 index 属性
              setTimeout(() => {
                const updatedPaperNodes = editor.$nodes("paper");
                if (updatedPaperNodes) {
                  const transaction = editor.state.tr;
                  updatedPaperNodes.forEach((nodePos: any, index: number) => {
                    transaction.setNodeAttribute(nodePos.pos, "index", index + 1);
                  });
                  
                  if (dispatch) {
                    dispatch(transaction);
                  } else {
                    editor.view.dispatch(transaction);
                  }
                }
              }, 0);
            }
            
            return result;
          } catch (error) {
            console.error("插入新页面失败:", error);
            return false;
          }
        },

        // 新增：自动分页命令
        autoPageBreak: () => ({ editor }: { editor: Editor }) => {
          if (this.storage.contentMonitor) {
            const paperNodes = editor.$nodes("paper");
            paperNodes?.forEach((nodePos: any) => {
              // 查找对应的 DOM 元素
              try {
                const paperElement = editor.view.domAtPos(nodePos.pos).node.parentElement;
                const contentElement = paperElement?.querySelector('.s-editor-paper-content') as HTMLElement;
                if (contentElement) {
                  this.storage.contentMonitor!.checkPaperContentOverflow(
                    editor,
                    nodePos.node.attrs.index,
                    contentElement
                  );
                }
              } catch (error) {
                console.warn('Error getting paper content element:', error);
              }
            });
          }
          return true;
        },

        // 新增：设置自动分页开关
        setAutoPageBreak: (enabled: boolean) => ({ editor }: { editor: Editor }) => {
          if (enabled && !this.storage.contentMonitor) {
            this.storage.contentMonitor = new ContentHeightMonitor();
            this.storage.contentMonitor.startMonitoring(editor);
          } else if (!enabled && this.storage.contentMonitor) {
            this.storage.contentMonitor.stopMonitoring();
            this.storage.contentMonitor = null;
          }
          return true;
        },
    };
  },
});