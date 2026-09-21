/**
 * 构建一个 schema 真正接受的 `page` 节点。
 *
 * 旧版 `createPage` 从它能找到的**第一个**页面取页眉和页脚
 * （`editor.$nodes("pageHeader")[0].attributes`）并且总是把两者都建出来，因此没有页眉的文档
 * 在创建页面之前就抛错（缺陷 9），而只有部分页面带版面配件的文档根本无法表示。
 *
 * 这个工厂在两个方向上都容忍「不存在」：
 *
 * - 它**复制模板页面的版面配件**，所以在带页脚的文档上执行 `addNewPage` 会得到带相同
 *   页脚的新页面——包括其中的 `pageNumber` 节点，该节点随后自行渲染出新的页码，
 *   完全不需要改写文本；
 * - 没有模板时它**不添加任何自己的版面配件**，因此在空白文档中创建的页面只是一个正文。
 *   用户需要时由 `addHeader`/`addFooter`/`addLogo` 添加这些版面元素，`removeHeader`
 *   又能把它去掉。
 *
 * Building a `page` node that the schema actually accepts.
 *
 * The legacy `createPage` gathered a header and a footer from the *first* page it could
 * find (`editor.$nodes("pageHeader")[0].attributes`) and always built both, so a document
 * without a header threw before it could create a page at all (defect 9), and a document
 * where only some pages have furniture was unrepresentable.
 *
 * This factory is existence-tolerant in both directions:
 *
 * - it **copies the template page's furniture**, so `addNewPage` on a document with a
 *   footer produces a page with the same footer — including a `pageNumber` node, which
 *   then renders its own new number with no text rewriting at all; and
 * - it adds **no furniture of its own** when there is no template, so a page created in a
 *   bare document is just a body. `addHeader`/`addFooter`/`addLogo` add chrome when the
 *   user asks for it, and `removeHeader` can take it away again.
 */

import type { Fragment, Node as PMNode, Schema } from "@tiptap/pm/model";

import {
  DEFAULT_ORIENTATION,
  DEFAULT_PAGE_AUTO,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAPER_FORMAT
} from "../constant/defaults";
import type { Margins, Orientation, PaperFormat } from "../../../typings/paper";
import type { PageAttributes } from "../typing/page";
import { PAGE_CONTENT_NODE, PAGE_NODE } from "./nodes";
import type { PageRef } from "./nodes";

/** {@link createPageNode} 所需的输入。 / What {@link createPageNode} needs to know. */
export interface CreatePageInput {
  /** 编辑器 schema。 / The editor's schema. */
  schema: Schema;

  /**
   * 用作镜像的页面：它的纸张设置，以及它的版面配件节点（连同内容一起复制，因此页脚的页码会
   * 在新页面上重现）。
   *
   * The page to mirror: its paper setup, and its furniture nodes (copied include their
   * content, so a footer's page number repeats on the new page).
   */
  template?: PageRef | null;

  /**
   * 新页面正文的内容；省略或为空即空白页。
   *
   * Content for the new page's body. Omitted or empty for a blank page.
   */
  content?: Fragment;

  /**
   * 属性覆盖值。`index` **不会**从模板复制——它由重编号流程负责——而 `auto` 默认为
   * `false`，因此用户创建的页面绝不会被隐式删除。
   *
   * Attribute overrides. `index` is **not** copied from the template — the renumbering
   * pass owns it — and `auto` defaults to `false` so a page the user created is never
   * removed implicitly.
   */
  attributes?: Partial<PageAttributes>;
}

/**
 * 构建出的页面节点，以及其正文相对于页面自身的位置。
 *
 * A built page node plus the position of its body, relative to the page's own position.
 */
export interface BuiltPage {
  /** 构建出的页面节点。 / The built page node. */
  node: PMNode;

  /**
   * `pagePos + contentOffset` 是页面正文**内部**的第一个有效位置。
   *
   * 返回偏移量而不是绝对位置，因为页面落在哪里由调用方决定；这与缺陷 6 的 `pos + 1` 规则
   * 相同，只是在这里一次算好。
   *
   * `pagePos + contentOffset` is the first valid position **inside** the page's body.
   *
   * Returned as an offset rather than an absolute position because the caller decides
   * where the page lands; this is the same `pos + 1` rule of defect 6, computed once.
   */
  contentOffset: number;
}

/**
 * 构建一个页面节点。
 *
 * Build a page node.
 *
 * @returns 缺少 `page`/`pageContent` 节点类型时返回 `null` /
 *   `null` when the schema has no `page`/`pageContent` node type — callers return
 *   `false` rather than throwing (defect 8: `$nodes()` returns `[]`, never `null`, so the
 *   legacy `=== null` guards never fired and `[0].attributes` threw instead).
 */
export function createPageNode(input: CreatePageInput): BuiltPage | null {
  const pageType = input.schema.nodes[PAGE_NODE];
  const contentNodeType = input.schema.nodes[PAGE_CONTENT_NODE];
  if (!pageType || !contentNodeType) return null;

  const templateAttributes: Record<string, unknown> = input.template ? input.template.node.attrs : {};
  const overrides = input.attributes ?? {};

  const attributes: PageAttributes = {
    index: overrides.index ?? DEFAULT_PAGE_INDEX,
    paperFormat: (overrides.paperFormat ??
      templateAttributes.paperFormat ??
      DEFAULT_PAPER_FORMAT) as PaperFormat,
    orientation: (overrides.orientation ??
      templateAttributes.orientation ??
      DEFAULT_ORIENTATION) as Orientation,
    margins: (overrides.margins ?? templateAttributes.margins ?? DEFAULT_PAGE_MARGINS) as Margins,
    auto: overrides.auto ?? DEFAULT_PAGE_AUTO
  };

  const children: PMNode[] = [];
  /**
   * 下一个子节点之前累积的节点大小，相对于页面内容的起点。
   *
   * Node size accumulated before the next child, relative to the page's content start.
   */
  let cursor = 0;
  let contentOffset = -1;

  const append = (node: PMNode): void => {
    if (node.type.name === PAGE_CONTENT_NODE && contentOffset < 0) {
      // Absolute body position = pagePos + 1 (page content) + cursor (earlier children)
      // + 1 (pageContent's own opening token).
      contentOffset = cursor + 2;
    }
    children.push(node);
    cursor += node.nodeSize;
  };

  for (const child of input.template?.children ?? []) {
    if (child.node.type.name === PAGE_CONTENT_NODE) {
      append(contentNodeType.create(null, input.content ?? undefined));
      continue;
    }
    // Header, footer and logo are repeated verbatim, content included. `copy` keeps the
    // node's type, attributes and marks, so a styled footer stays styled.
    append(child.node.copy(child.node.content));
  }

  if (contentOffset < 0) {
    append(contentNodeType.create(null, input.content ?? undefined));
  }

  return { node: pageType.create(attributes, children), contentOffset };
}
