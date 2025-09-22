import { Node, mergeAttributes } from "@tiptap/core";

import { PageOptions,PageStorage } from "./typing/page";

import { PageHeader } from "./pageHeader/pageHeader";
import { PageFooter } from "./pageFooter";
import { PageContent } from "./pageContent/pageContent";

import { defaultMargins } from "./constant/defaultMargins";
import { paperSizeCalculator } from "./utils/calculator";
import { createPage } from "./utils/createPage";
import { createPageContent } from "./utils/createPageContent";
import { createPageHeader } from "./utils/createPageHeader";
import {} from "./utils/createPageFooter";

export const Page = Node.create<PageOptions,PageStorage>({
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

  addNodeView() {
    return () => {
      const page = document.createElement("section");
      page.classList.add("s-editor-page");
      page.style.position = "relative";
      const { width, height } = paperSizeCalculator(
        this.options.paperFormat,
        this.options.orientation
      );
      page.style.width = `${width}mm`;
      page.style.height = `${height}mm`;
      this.storage.total += 1;
      console.log('page view rendered')
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
          const total = editor.storage.page.total;
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
          
          return true;
        };
      },
    };
  },
});
