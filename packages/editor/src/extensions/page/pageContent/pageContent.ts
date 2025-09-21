import { Node, mergeAttributes } from "@tiptap/core";
import { PageContentOptions } from "../typing/pageContent";

import { PageContentView } from "./pageContentView";

import {defaultMargins} from '../constant/defaultMargins'

export const PageContent = Node.create<PageContentOptions>({
  name: "pageContent",
  group: "page",
  content: "block*",
  isolating: true,
  addOptions() {
    return {
      // paperFormat: "A4",
      HTMLAttributes: {},
    };
  },
  addAttributes() {
    return {
      
      // margins:{
      //   default: defaultMargins,
      // }
      _updateTimestamp: {
        default: Date.now(),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "page-content",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "page-content",
      mergeAttributes(HTMLAttributes, {
        class: "page-content",
      }),
    ];
  },
  addNodeView: PageContentView,

  addCommands(){
    return {
      __flushContentPadding:()=>
        ({editor,tr,dispatch})=>{
          const pageContents = editor.$nodes("pageContent");
          pageContents?.forEach((node) => {
            tr.setNodeAttribute(node.pos - 1, "_updateTimestamp", Date.now());
            if (dispatch) {
              dispatch(tr);
            }
          });
          return true;
        }
    }
  }

  // addCommands() {
  //   return {
  //     setPageMargins:
  //       (margins) =>
  //       ({editor, tr, dispatch }) => { 
  //         const pages = editor.$nodes("pageContent");
  //         pages?.forEach((pageNode) => {
  //           const pos = pageNode.pos;
  //           const newMargins = Object.assign(
  //             {},
  //             pageNode.attributes.margins,
  //             margins
  //           );
  //           tr.setNodeAttribute(pos - 1, "margins", newMargins);
  //           if (dispatch) {
  //             dispatch(tr);
  //           }
  //           console.log(pos, newMargins);
  //         });
  //         return true;
  //       },
  //   }
  // },
});
