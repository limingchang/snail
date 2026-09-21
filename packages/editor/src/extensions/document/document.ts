/**
 * 文档（顶层）节点。
 *
 * 基于 `page` 的文档是一种**选择**，而不是关于 schema 的事实：同一个编辑器也用在单页模式，
 * 那时顶层节点是普通的 `block+` 文档。旧的装配方式在该模式下*完全不返回*文档扩展 —— 它只在
 * `mutilPage` 为 true 时 `unshift` 多页文档 —— 所以 `multiPage: false` 产出的 schema 没有顶层
 * 节点，ProseMirror 抛出 "Schema is missing its top node type (`doc`)"（缺陷 37）。
 *
 * 因此 {@link createDocument} 总是返回一个合法的顶层节点，并在自身的类型里说明选了哪一个。
 *
 * The document (top) node.
 *
 * A `page`-based document is a **choice**, not a fact about the schema: the same editor is
 * used in single-page mode, where the top node is an ordinary `block+` document. The
 * legacy assembly returned *no* document extension at all in that mode — it only
 * `unshift`ed the multi-page one when `mutilPage` was true — so `multiPage: false`
 * produced a schema with no top node and ProseMirror threw
 * "Schema is missing its top node type (`doc`)" (defect 37).
 *
 * {@link createDocument} therefore always returns a valid top node, and says which one it
 * chose in its type.
 */

import { Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Document as StandardDocument } from "@tiptap/extension-document";

/**
 * 编辑器如何装配。
 *
 * How the editor is assembled.
 */
export interface DocumentOptions {
  /**
   * `true`（默认）让顶层节点承载 `page+`，即类似 Word 的分页文档。
   * `false` 使用 Tiptap 标准的 `block+` 文档，即单一、不分页的一页。
   *
   * `true` (default) makes the top node hold `page+`, i.e. a Word-like paginated document.
   * `false` uses Tiptap's standard `block+` document for a single, unpaginated page.
   */
  multiPage?: boolean;
}

/**
 * 分页的顶层节点。
 *
 * `page+` 要求至少一页，所以创建空编辑器的调用方必须用 {@link createInitialPageContent}（或它
 * 自己的页面 JSON）播种 —— 像旧实现那样干脆不提供文档节点，永远不是一个选项。
 *
 * The paginated top node.
 *
 * `page+` requires at least one page, so a caller that creates an empty editor must seed
 * it with {@link createInitialPageContent} (or its own page JSON) — omitting the document
 * node entirely, as the legacy did, is never an option.
 */
export const PageDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "page+"
});

/**
 * 选择顶层节点。
 *
 * 两个分支都叫 `doc`，所以只能注册其中一个 —— 这正是它做成工厂函数、而不是两个可能被调用方
 * 意外组合在一起的扩展的原因。
 *
 * Pick a top node.
 *
 * Both branches are named `doc`, so exactly one of them may be registered — which is why
 * this is a factory rather than two extensions the caller might combine by accident.
 */
export function createDocument(options: DocumentOptions = {}): Node {
  const multiPage = options.multiPage ?? true;
  return multiPage ? PageDocument : (StandardDocument as Node);
}

/**
 * {@link PageDocument} 的一份最小合法正文。
 *
 * `content: "page+"` 会拒绝空文档，而手工构造第一页很容易出错（旧的 `createPage` 需要页眉先存在
 * 才能构造任何东西，缺陷 9）。这里返回的 JSON 使用方可以直接交给编辑器的 `content` 选项。
 * 版式附属内容有意缺席：页眉和页脚通过 `addHeader`/`addFooter`/`addLogo` 添加，而
 * `Page.configure({ header: false })` 不必再去和预置的标记协调。
 *
 * A minimal valid body for {@link PageDocument}.
 *
 * `content: "page+"` rejects an empty document, and building the first page by hand is
 * easy to get wrong (the legacy `createPage` needed a header to exist before it could
 * build anything, defect 9). This returns the JSON a consumer can pass straight to the
 * editor's `content` option. Furniture is intentionally absent: headers and footers are
 * added through `addHeader`/`addFooter`/`addLogo`, and `Page.configure({ header: false })`
 * must not have to be reconciled with seeded markup.
 */
export function createInitialPageContent(pageCount = 1): JSONContent {
  const count = Number.isFinite(pageCount) && pageCount >= 1 ? Math.floor(pageCount) : 1;

  return {
    type: "doc",
    content: Array.from({ length: count }, () => ({
      type: "page",
      content: [
        {
          type: "pageContent",
          content: [{ type: "paragraph" }]
        }
      ]
    }))
  };
}
