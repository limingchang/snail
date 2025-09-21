import { Node, mergeAttributes } from "@tiptap/core";

import { PageOptions } from "./typing/page";

import { PageHeader } from "./pageHeader/pageHeader";
import { PageContent } from "./pageContent/pageContent";

import { defaultMargins } from "./constant/defaultMargins";
import { paperSizeCalculator } from "./utils/calculator";
import { createPageContent } from "./utils/createPageContent";
import { createPageHeader } from "./utils/createPageHeader";

export const Page = Node.create<PageOptions>({
  name: "page",
  group: "page",
  priority: 1001,
  content: "(pageHeader | pageContent )*",

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
    return [PageHeader.configure(this.options.header), PageContent];
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
          return true;
        },
      addNewPage() {
        return ({ editor, tr, dispatch, commands, chain }) => {
          const nodeType = editor.schema.nodes["page"];
          const total = editor.$nodes("page")?.length || 0;
          const doc = editor.$doc;
          console.log("doc", " pos", doc.pos, " size", doc.size);
          const pageHeaderNodes = editor.$nodes("pageHeader");
          const pageHeaderAttrs =
            pageHeaderNodes === null ? null : pageHeaderNodes[0].attributes;
          const pageHeader = createPageHeader(editor.schema, pageHeaderAttrs);
          const pageContentNodes = editor.$nodes("pageContent");
          console.log(
            "page",
            " pos",
            editor.$nodes("page")[0].pos,
            " size",
            editor.$nodes("page")[0].size
          );
          const pageContenAttrs =
            pageContentNodes === null ? null : pageContentNodes[0].attributes;
          const pageContent = createPageContent(editor.schema, pageContenAttrs);
          const newPageNode = nodeType.create({ index: total + 1 }, [
            pageHeader,
            pageContent,
          ]);
          console.log("newPageNode", newPageNode);
          const insertPos = editor.$doc.size - 2;
          const selection = editor.state.selection;

          const json = editor.getJSON();
          const newJson = {
            ...json,
            content: [...json.content, newPageNode.toJSON()],
          };
          console.log("newJson", newJson);
          const result = commands.setContent(newJson, {
            errorOnInvalidContent: true,
          });
          console.log("result", result);
          if (dispatch) {
            dispatch(tr);
          }
          // return chain().insertContentAt(insertPos, newPageNode).run();
          // return chain()
          //   .insertContent({
          //     type: "variable",
          //     attrs: {
          //       label: "测试",
          //     },
          //   })
          //   .run();

          // return commands.insertContentAt(
          //   // insertPos,
          //   1,
          //   nodeType.create({ index: total + 1 }, [pageContent])
          // );
          // if (dispatch) {
          //   tr.insert(
          //     tr.selection.from,
          //     nodeType.create({ index: total + 1 }, [pageContent])
          //   );
          // }
          return true;
        };
      },
    };
  },
});
