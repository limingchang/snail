/**
 * The optional page logo.
 *
 * The logo is a **page child node** (so it is part of the document, survives a save and
 * can be addressed by a command) that is *rendered* by the page's own node view, as an
 * absolutely positioned sibling of that view's `contentDOM`. ProseMirror maps child
 * nodes into a node view's `contentDOM`, so a logo rendered inside it would sit in the
 * document flow and be re-parented whenever the body re-renders — the same reason the
 * watermark cannot be a content child (see the watermark caveat in the rebuild notes).
 * `pageLogo`'s own node view therefore renders only a hidden placeholder.
 */

import type { CssLength } from "../../../typings/paper";

/** Where the logo sits horizontally inside the page's content area. */
export type LogoPosition = "left" | "center" | "right";

/** The `pageLogo` node's attributes. */
export interface PageLogoAttributes {
  /**
   * The image source. An empty string renders no logo at all (the node is still valid, so
   * removing the file and removing the node are different, recoverable states).
   */
  src: string;

  /** Rendered width, as a CSS length (`"30mm"`, `"120px"`). */
  width: CssLength;

  /** Rendered height, as a CSS length. `"auto"` keeps the file's aspect ratio. */
  height: CssLength;

  /** Horizontal anchor inside the content area. */
  position: LogoPosition;

  /** Extra horizontal offset in millimetres, applied in the direction of the anchor. */
  offsetX: number;

  /** Vertical offset in millimetres from the top edge of the sheet. */
  offsetY: number;
}

/** Options accepted by `PageLogo.configure(...)` and by `Page.configure({ logo })`. */
export interface PageLogoOptions {
  src?: string;
  width?: CssLength;
  height?: CssLength;
  position?: LogoPosition;
  offsetX?: number;
  offsetY?: number;
  HTMLAttributes?: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageLogo: {
      /**
       * Put a logo on every page that lacks one, or update the logo that is already
       * there. With `pageIndex` only that page is touched, so a document where "only some
       * pages have one" is a supported state.
       */
      addLogo: (attributes?: Partial<PageLogoAttributes>, pageIndex?: number) => ReturnType;

      /** Remove the logo from every page that has one (or from a single page). */
      removeLogo: (pageIndex?: number) => ReturnType;

      /** Re-anchor the logo. Returns `false` when nothing changed. */
      setLogoPosition: (position: LogoPosition, pageIndex?: number) => ReturnType;
    };
  }
}
