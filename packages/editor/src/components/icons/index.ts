/**
 * 编辑器的富文本格式图标 —— 加粗、斜体、下划线、删除线，四种对齐，以及两种缩进操作。
 *
 * ## 为什么用 barrel 而不是 glob
 *
 * `import.meta.glob({ eager: true })` 会把**每一个**图标都拉进任何引用本模块的使用方。
 * 这份显式清单让模块图保持狭窄，打包器因此可以丢掉工具栏从未导入的图标。
 *
 * 每个图标都带有 `width="1em" height="1em"` 和 `fill="currentColor"`，所以不需要样式表
 * 即可正确确定尺寸并重新着色。
 *
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
