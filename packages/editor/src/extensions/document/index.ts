/**
 * 文档模块的公开接口。
 *
 * `createDocument({ multiPage })` 是 `useEditorRuntime` 调用的入口；`PageDocument` 单独导出，
 * 供想直接引用该节点类型的使用方使用，`createInitialPageContent` 则供需要一份合法 `page+` 正文
 * 作为起点的使用方使用。
 *
 * The document module's public surface.
 *
 * `createDocument({ multiPage })` is what `useEditorRuntime` calls; `PageDocument` is
 * exported separately for a consumer that wants to reference the node type directly, and
 * `createInitialPageContent` for one that needs a valid `page+` body to start from.
 */

export { PageDocument, createDocument, createInitialPageContent } from "./document";
export type { DocumentOptions } from "./document";

/**
 * 分页顶层节点，用使用方自然会去找的那个名字导出。
 *
 * 与 {@link PageDocument} 是同一个对象：这个别名存在是因为 `useEditorRuntime` 从本模块导入
 * `Document`，而第二个同名为 `doc` 的文档节点会成为重复扩展。
 *
 * The paginated top node under the name a consumer naturally reaches for.
 *
 * Same object as {@link PageDocument}: the alias exists because `useEditorRuntime` imports
 * `Document` from this module, and a second document node with the same `doc` name would
 * be a duplicate extension.
 */
export { PageDocument as Document } from "./document";

/**
 * 重新导出，让选择未分页分支的使用方不必再找第二个导入路径。
 *
 * Re-exported so a consumer picking the unpaginated branch does not need a second import path.
 */
export { Document as StandardDocument } from "@tiptap/extension-document";
