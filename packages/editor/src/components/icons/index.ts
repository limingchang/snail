/**
 * The editor's rich-text formatting icons — bold, italic, underline, strike and the
 * four alignments plus the two indent actions.
 *
 * ## Why a barrel and not a glob
 *
 * `import.meta.glob({ eager: true })` would pull **every** icon into any consumer
 * that touches this module. This explicit list keeps the module graph narrow, so a
 * bundler can drop the icons a toolbar never imports.
 *
 * Every icon carries `width="1em" height="1em"` and `fill="currentColor"`, so it is
 * correctly sized and recolourable with no stylesheet.
 */
import IconAlignCenter from "./IconAlignCenter.vue";
import IconAlignJustify from "./IconAlignJustify.vue";
import IconAlignLeft from "./IconAlignLeft.vue";
import IconAlignRight from "./IconAlignRight.vue";
import IconBold from "./IconBold.vue";
import IconIndentDecrease from "./IconIndentDecrease.vue";
import IconIndentIncrease from "./IconIndentIncrease.vue";
import IconItalic from "./IconItalic.vue";
import IconStrike from "./IconStrike.vue";
import IconUnderline from "./IconUnderline.vue";

export {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconStrike,
  IconUnderline
};
