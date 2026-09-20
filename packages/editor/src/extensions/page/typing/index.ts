/**
 * The page module's public types.
 *
 * Consumers should import from here (or from the module barrel `extensions/page`)
 * rather than reaching into individual files, so an internal rename cannot break them.
 */

export type {
  FurnitureAttributes,
  FurnitureSide,
  PageFooterAttributes,
  PageFooterOptions,
  PageHeaderAttributes,
  PageHeaderOptions,
  TextAlign
} from "./headerFooter";

export type {
  PageContentOptions,
  PageContentStorage,
  PaginationController,
  PaginationDiagnostics
} from "./pageContent";

export type { LogoPosition, PageLogoAttributes, PageLogoOptions } from "./pageLogo";

export type { PageNumberAttributes, PageNumberOptions } from "./pageNumber";

export type { PageAttributes, PageOptions, PageStorage } from "./page";

/**
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
