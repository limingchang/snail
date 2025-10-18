import type { Content } from "@tiptap/core";

// import { Content, Mark } from '../typing/content'
// import { defaultQRCode } from "./deafultQRCode";
// import { defaultH1 } from "./defaultH1";
// import { defaultH2 } from "./defaultH2";
// import {
//   defaultIntroductionParagraph,
//   defaultFeatureParagraph,
// } from "./defaultParagraph";

// import { defaultTable } from "./defaultTable";

// import { defaultPage } from "./defaultPage";
import { defaultPages } from "./defaultPage";

// export const defaultContent = {
//   type: "doc",
//   content: [
//     // defaultQRCode,
//     defaultH1,
//     defaultH2,
//     defaultIntroductionParagraph,
//     defaultFeatureParagraph,
//   ],
// } as Content;

export const defaultContent = {
  type: "doc",
  content: [
    defaultPages,
    // { type: "page", content: [{ type: "pageHeader", content: [] }] },
  ],
} as Content;
