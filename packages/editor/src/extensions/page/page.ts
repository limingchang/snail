import { Node, mergeAttributes } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { PageOptions, PageStorage } from "./typing/page";

import { PageHeader } from "./pageHeader/pageHeader";
import { PageFooter } from "./pageFooter";
import { PageContent } from "./pageContent/pageContent";

import { defaultMargins } from "./constant/defaultMargins";
import { paperSizeCalculator } from "./utils/calculator";
import { createPage } from "./utils/createPage";


export const Page = Node.create<PageOptions, PageStorage>({
  name: "page",
  group: "page",
  priority: 1001,
  content: "(pageHeader | pageContent | pageFooter)*",

  addOptions() {
    return {
      paperFormat: "A4",
      orientation: "portrait",
      pageGap: 8,
      HTMLAttributes: {
        class: "s-editor-page",
      },
    };
  },
  addExtensions() {
    return [
      PageHeader.configure(this.options.header),
      PageContent,
      PageFooter.configure(this.options.footer),
    ];
  },
  addStorage() {
    return {
      total: 0,
    };
  },

  addAttributes() {
    return {
      index: {
        default: 1,
        parseHTML(element) {
          return element.getAttribute("data-index") || 1;
        },
        renderHTML: (attributes) => ({
          "data-index": attributes.index,
        }),
      },
      paperFormat: {
        default: this.options.paperFormat,
      },
      orientation: {
        default: this.options.orientation,
      },
      margins: {
        default: defaultMargins,
      },
    };
  },

  parseHTML() {
    return [{ tag: "section" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, height } = paperSizeCalculator(
      this.options.paperFormat,
      this.options.orientation
    );
    return [
      "section",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: `position:relative;width: ${width}mm; height: ${height}mm;`,
      }),
      0,
    ];
  },
  onCreate() {
    // console.log("create:", this.editor.$nodes("page"));
    const pages = this.editor.$nodes("page");
    this.storage.total = pages == null ? 0 : pages.length;
  },
  
  addNodeView() {
    return ({node}) => {
      const page = document.createElement("section");
      page.classList.add("s-editor-page");
      page.style.position = "relative";
      const { width, height } = paperSizeCalculator(
        node.attrs.paperFormat,
        node.attrs.orientation
      );
      page.style.width = `${width}mm`;
      page.style.height = `${height}mm`;
      page.style.breakAfter = "page";

      return {
        dom: page,
        contentDOM: page,
      };
    };
  },

  addCommands() {
    return {
      setPageMargins:
        (margins) =>
        ({ editor, tr, dispatch, commands }) => {
          const pages = editor.$nodes("page");
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
          commands.__flushContentPadding();
          commands.__flushHeader();
          commands.__flushFooter();
          return true;
        },
      addNewPage() {
        return ({ editor, tr, dispatch, commands }) => {
          // const nodeType = editor.schema.nodes["page"];
          const total = (editor.storage.page.total += 1);
          const doc = editor.$doc;
          const insertPos = doc.size - 2;
          // const pageExtension = editor.extensionManager.extensions.find(
          //   (extension) => extension.name === "page"
          // );
          // const { paperFormat, orientation } =
          //   pageExtension?.options as PageOptions;
          const newPageNode = createPage(editor, {
            index: total,
          });

          commands.insertContentAt(insertPos, newPageNode);
          if (dispatch) {
            dispatch(tr);
          }
          commands.__flushHeader();
          commands.__flushFooter();
          tr.scrollIntoView()
          return true;
        };
      },
      setPageOrientation:
        (orientation) =>
        ({ editor, tr, state, commands, dispatch }) => {
          const { selection } = state;
          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (
              node.type.name === "page" &&
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
              node.type.name === "page" &&
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
    };
  },
});
