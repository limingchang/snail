/**
 * The document module's public surface.
 *
 * `createDocument({ multiPage })` is what `useEditorRuntime` calls; `PageDocument` is
 * exported separately for a consumer that wants to reference the node type directly, and
 * `createInitialPageContent` for one that needs a valid `page+` body to start from.
 */

export { PageDocument, createDocument, createInitialPageContent } from "./document";
export type { DocumentOptions } from "./document";

/**
 * The paginated top node under the name a consumer naturally reaches for.
 *
 * Same object as {@link PageDocument}: the alias exists because `useEditorRuntime` imports
 * `Document` from this module, and a second document node with the same `doc` name would
 * be a duplicate extension.
 */
export { PageDocument as Document } from "./document";

/** Re-exported so a consumer picking the unpaginated branch does not need a second import path. */
export { Document as StandardDocument } from "@tiptap/extension-document";
