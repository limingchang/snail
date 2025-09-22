import { Editor } from "@tiptap/core";
import type { PageAttributes } from "../typing/page";
import type { PageHeaderAttributes } from "../typing/pageHeader";
import type { PageFooterAttributes } from "../typing/pageFooter";
import type { TextAlign } from "../typing/public";

import { defaultPageHeaderAttrs } from "../constant/defaultPageHeaderAttrs";
import { defaultPageFooterAttrs } from "../constant/defaultPageFooterAttrs";

import { createPageHeader } from "./createPageHeader";
import { createPageContent } from "./createPageContent";
import { createPageFooter } from "./createPageFooter";

export const createPage = (editor: Editor, attrs: Partial<PageAttributes>) => {
  const { index } = attrs;
  // 创建页眉
  const pageHeaderNodes = editor.$nodes("pageHeader");
  const pageHeaderAttrs =
    pageHeaderNodes === null
      ? defaultPageHeaderAttrs
      : (pageHeaderNodes[0].attributes as PageHeaderAttributes);
  const pageHeader = createPageHeader(
    editor.schema,
    { ...pageHeaderAttrs, align: "right" as TextAlign },
    index as number,
    index as number
  );
  const pageContent = createPageContent(editor.schema, {});
  // 创建页脚
  const pageFooterNodes = editor.$nodes("pageFooter");
  const pageFooterAttrs =
    pageFooterNodes === null
      ? defaultPageFooterAttrs
      : (pageFooterNodes[0].attributes as PageFooterAttributes);
  const pageFooter = createPageFooter(
    editor.schema,
    { ...pageFooterAttrs, align: "center" as TextAlign },
    index as number,
    index as number
  );
  const pageNodeType = editor.schema.nodes["page"];
  return pageNodeType.create(attrs, [pageHeader, pageContent, pageFooter]);
};
