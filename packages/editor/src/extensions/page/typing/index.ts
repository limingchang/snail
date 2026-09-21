/**
 * 页面模块的公开类型。
 *
 * 使用方应该从这里（或模块出口 `extensions/page`）导入，而不是直接深入单个文件，这样内部的改名就
 * 不会破坏它们。
 *
 * The page module's public types.
 *
 * Consumers should import from here (or from the module barrel `extensions/page`)
 * rather than reaching into individual files, so an internal rename cannot break them.
 */

export type {
  FurnitureAttributes,
  FurnitureSide,
  FurnitureSlot,
  PageFooterAttributes,
  PageFooterOptions,
  PageHeaderAttributes,
  PageHeaderOptions,
  RegionAttributes,
  RegionOptions,
  TextAlign
} from "./headerFooter";

export { FURNITURE_SLOTS, SLOT_ALIGN, SLOT_ORDER } from "./headerFooter";

export type {
  PageContentOptions,
  PageContentStorage,
  PaginationController,
  PaginationDiagnostics
} from "./pageContent";

export type {
  LegacyLogoAttributes,
  LogoAttributes,
  LogoPlacement,
  LogoPosition,
  PageLogoOptions
} from "./pageLogo";

export type { PageNumberAttributes, PageNumberOptions } from "./pageNumber";

export type { PageAttributes, PageOptions, PageStorage } from "./page";

/**
 * 纸张模型本身放在 `typings/paper.ts`，因为顶层组件也需要它。在这里再导出，让
 * `import type { PaperFormat } from "./extensions/page"` 始终可用，并且永远指向那一份定义。
 *
 * The paper model itself lives in `typings/paper.ts` because the top-level component
 * needs it too. Re-exported so `import type { PaperFormat } from "./extensions/page"`
 * works, always referring to the one definition.
 */
export type {
  CssLength,
  Margins,
  NamedPaperFormat,
  Orientation,
  PaperFormat,
  PaperSize,
  ResolvedMargins
} from "../../../typings/paper";
