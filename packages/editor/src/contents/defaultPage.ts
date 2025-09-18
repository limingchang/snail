import { defaultH1 } from "./defaultH1";
import { defaultH2 } from "./defaultH2";
import {
  defaultIntroductionParagraph,
  defaultFeatureParagraph,
} from "./defaultParagraph";

export const defaultPageHeader = {
  type: "pageHeader",
};

export const defaultPageFooter = {
  type: "pageFooter",
};

// export const defaultPage = {
//   type: "page",
//   content: [
//     defaultPageHeader,
//     {
//       type: "pageContent",
//       content: [
//         defaultH1,
//         defaultH2,
//         defaultIntroductionParagraph,
//         defaultFeatureParagraph,
//       ],
//     },

//     defaultPageFooter,
//   ],
// };

// export const defaultPage = {
//   type: "page",
//   content: [
//     defaultH1,
//     defaultH2,
//     defaultIntroductionParagraph,
//     defaultFeatureParagraph,
//   ],
// };

export const defaultPages = {
  type: "page",
  content: [
    {
      type: "paper",
      attrs: { index: 1 },
      content: [
        defaultH1,
        defaultH2,
        defaultIntroductionParagraph,
        defaultFeatureParagraph,
      ],
    },
    {
      type: "paper",
      attrs: { index: 2 },
      content: [
        defaultH1,
        defaultH2,
        defaultIntroductionParagraph,
        defaultFeatureParagraph,
      ],
    },
  ],
};
