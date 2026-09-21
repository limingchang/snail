/**
 * `paragraphStyle` 扩展自身的契约。
 *
 * Tiptap 3 没有等价物：它的 `LineHeight` 是一个*标记*（mark），因此无法表达首行缩进，而且在
 * 文本被拆分时会消失；`TextAlign` 则是正交的。首行缩进与段前/段后间距是*块*的属性，这就是
 * 为什么它们是挂在 `paragraph` 和 `heading` 上的全局属性，而不是标记。
 *
 * The `paragraphStyle` extension's own contract.
 *
 * Tiptap 3 has nothing equivalent: its `LineHeight` is a *mark* (so it cannot express a
 * first-line indent, and it disappears when the text is split) and `TextAlign` is orthogonal.
 * First-line indent and space-before/after are properties of the *block*, which is why they
 * are global attributes on `paragraph` and `heading` rather than a mark.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * 一个样式值。
 *
 * `null` 是表示「未设置」的真实取值，并且有意区别于 `"0"`：默认值为 `"0"` 会让每个段落都携带
 * 缩进、渲染它并在每次保存时序列化它（旧缺陷：默认值是 `"0"`，`renderHTML` 会把
 * `text-indent: 0;` 写到文档里的每一个段落上）。
 *
 * A style value.
 *
 * `null` is a real value meaning "not set", and it is deliberately different from `"0"`:
 * a `"0"` default makes every paragraph carry an indent, render it and serialise it (legacy
 * defect: the default was `"0"`, and `renderHTML` wrote `text-indent: 0;` onto every
 * paragraph in the document).
 */
export type ParagraphStyleValue = string | null;

/**
 * 调用方可以传给 `setParagraphStyle` 的内容。
 *
 * What a caller may pass to `setParagraphStyle`.
 */
export interface ParagraphStyleAttrs {
  /** CSS `text-indent`。`null` 表示移除。 / CSS `text-indent`. `null` removes it. */
  textIndent?: ParagraphStyleValue;
  /**
   * CSS `margin-block-start`。`null` 表示移除。
   *
   * CSS `margin-block-start`. `null` removes it.
   */
  paragraphStart?: ParagraphStyleValue;
  /**
   * CSS `margin-block-end`。`null` 表示移除。
   *
   * CSS `margin-block-end`. `null` removes it.
   */
  paragraphEnd?: ParagraphStyleValue;
}

/** 属性名，按它们被渲染的顺序排列。 / The attribute names, in the order they are rendered. */
export const PARAGRAPH_STYLE_ATTRIBUTES = [
  "textIndent",
  "paragraphStart",
  "paragraphEnd"
] as const;

/**
 * 调用方可以配置的内容。
 *
 * 旧选项里带着一个从未被使用的 `HTMLAttributes: Record<string, any>`；它被删掉而不是沿用，
 * 因为一个没人读取的选项就是在谎报什么是可配置的。
 *
 * What a caller may configure.
 *
 * The legacy options carried an unused `HTMLAttributes: Record<string, any>`; it is gone
 * rather than carried forward, because an option nothing reads is an option that lies about
 * what is configurable.
 */
export interface ParagraphStyleOptions {
  /**
   * 样式适用的节点类型。默认 `["paragraph", "heading"]`。
   *
   * Node types the style applies to. Default `["paragraph", "heading"]`.
   */
  types: string[];
}

/** 段落长度可以使用的单位。 / The units a paragraph length may be written in. */
export const PARAGRAPH_STYLE_UNITS = ["px", "pt", "em", "rem", "%"] as const;

/** {@link PARAGRAPH_STYLE_UNITS} 之一。 / One of {@link PARAGRAPH_STYLE_UNITS}. */
export type ParagraphStyleUnit = (typeof PARAGRAPH_STYLE_UNITS)[number];

/** 解析后的 CSS 长度。 / A parsed CSS length. */
export interface ParsedParagraphLength {
  /** 数值部分。总是有限数。 / The numeric part. Always finite. */
  value: number;
  /** 单位部分。 / The unit part. */
  unit: ParagraphStyleUnit;
}

/**
 * 一次 px 换算需要什么。
 *
 * `em` 相对于元素自身的字体，`rem` 相对于根元素的字体，所以不知道这两者的换算不可能精确 ——
 * 这正是旧的 `parseFloat("2em")`（得到 2，被当作 2 px）是错误、而不仅仅是近似的原因。
 *
 * What a px conversion needs.
 *
 * `em` is relative to the element's own font and `rem` to the root's, so a conversion that
 * does not know them cannot be exact — which is precisely why the legacy `parseFloat("2em")`
 * (2, read as 2 px) was wrong rather than merely approximate.
 */
export interface PixelsContext {
  /**
   * 元素自身的字号，单位 px。默认 `16`。
   *
   * The element's own font size in px. Default `16`.
   */
  fontSize?: number;
  /** 根元素的字号，单位 px。默认 `16`。 / The root font size in px. Default `16`. */
  rootFontSize?: number;
}

/** 命令将要重写的一个块。 / One block the command will rewrite. */
export interface ParagraphStyleTarget {
  /** 块的绝对位置。 / Absolute position of the block. */
  pos: number;
  /**
   * 该块的完整属性集，补丁已经施加。
   *
   * The block's complete attribute set, with the patch already applied.
   */
  attrs: Record<string, unknown>;
}

/**
 * 编辑器状态中与选区相关的形状，好让收集器可被测试。
 *
 * The selection-relevant shape of an editor state, so the collector is testable.
 */
export interface ParagraphStyleState {
  /** 文档节点。 / The document node. */
  doc: ProseMirrorNode;
  /** 选区中与收集相关的部分。 / The selection-relevant part of the selection. */
  selection: {
    /** 选区内没有内容时为 `true`。 / `true` when the selection is empty. */
    empty: boolean;
    /** 选区起点。 / The start of the selection. */
    from: number;
    /** 选区终点。 / The end of the selection. */
    to: number;
    /** 解析到选区起点的 `ResolvedPos`。 / The `ResolvedPos` at the selection start. */
    $from: {
      /** 解析位置的深度。 / The depth of the resolved position. */
      depth: number;
      /** 该深度节点之前的位置。 / The position before the node at that depth. */
      before: (depth: number) => number;
      /** 该深度上的节点。 / The node at that depth. */
      node: (depth: number) => ProseMirrorNode;
    };
  };
}
