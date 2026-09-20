/**
 * The `paragraphStyle` extension's own contract.
 *
 * Tiptap 3 has nothing equivalent: its `LineHeight` is a *mark* (so it cannot express a
 * first-line indent, and it disappears when the text is split) and `TextAlign` is orthogonal.
 * First-line indent and space-before/after are properties of the *block*, which is why they
 * are global attributes on `paragraph` and `heading` rather than a mark.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * A style value.
 *
 * `null` is a real value meaning "not set", and it is deliberately different from `"0"`:
 * a `"0"` default makes every paragraph carry an indent, render it and serialise it (legacy
 * defect: the default was `"0"`, and `renderHTML` wrote `text-indent: 0;` onto every
 * paragraph in the document).
 */
export type ParagraphStyleValue = string | null;

/** What a caller may pass to `setParagraphStyle`. */
export interface ParagraphStyleAttrs {
  /** CSS `text-indent`. `null` removes it. */
  textIndent?: ParagraphStyleValue;
  /** CSS `margin-block-start`. `null` removes it. */
  paragraphStart?: ParagraphStyleValue;
  /** CSS `margin-block-end`. `null` removes it. */
  paragraphEnd?: ParagraphStyleValue;
}

/** The attribute names, in the order they are rendered. */
export const PARAGRAPH_STYLE_ATTRIBUTES = [
  "textIndent",
  "paragraphStart",
  "paragraphEnd"
] as const;

/**
 * What a caller may configure.
 *
 * The legacy options carried an unused `HTMLAttributes: Record<string, any>`; it is gone
 * rather than carried forward, because an option nothing reads is an option that lies about
 * what is configurable.
 */
export interface ParagraphStyleOptions {
  /** Node types the style applies to. Default `["paragraph", "heading"]`. */
  types: string[];
}

/** The units a paragraph length may be written in. */
export const PARAGRAPH_STYLE_UNITS = ["px", "pt", "em", "rem", "%"] as const;

/** One of {@link PARAGRAPH_STYLE_UNITS}. */
export type ParagraphStyleUnit = (typeof PARAGRAPH_STYLE_UNITS)[number];

/** A parsed CSS length. */
export interface ParsedParagraphLength {
  /** The numeric part. Always finite. */
  value: number;
  /** The unit part. */
  unit: ParagraphStyleUnit;
}

/**
 * What a px conversion needs.
 *
 * `em` is relative to the element's own font and `rem` to the root's, so a conversion that
 * does not know them cannot be exact — which is precisely why the legacy `parseFloat("2em")`
 * (2, read as 2 px) was wrong rather than merely approximate.
 */
export interface PixelsContext {
  /** The element's own font size in px. Default `16`. */
  fontSize?: number;
  /** The root font size in px. Default `16`. */
  rootFontSize?: number;
}

/** One block the command will rewrite. */
export interface ParagraphStyleTarget {
  /** Absolute position of the block. */
  pos: number;
  /** The block's complete attribute set, with the patch already applied. */
  attrs: Record<string, unknown>;
}

/** The selection-relevant shape of an editor state, so the collector is testable. */
export interface ParagraphStyleState {
  doc: ProseMirrorNode;
  selection: {
    empty: boolean;
    from: number;
    to: number;
    $from: {
      depth: number;
      before: (depth: number) => number;
      node: (depth: number) => ProseMirrorNode;
    };
  };
}
