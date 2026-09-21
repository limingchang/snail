/**
 * 页面模块的公开出口。
 *
 * 这就是 `SEditor` / `useEditorRuntime` 导入的东西：六个扩展、页面 / 纸张类型，以及 UI 面板需要的
 * 小型纯函数（纸张解析、页码标签格式化）。所有内容都显式再导出——纯类型条目用 `export type`
 * ——因为
 * 本包以 `isolatedModules` 和 `verbatimModuleSyntax` 构建，此时对只声明类型的模块使用裸
 * `export *` 无法安全地生成代码。
 *
 * The page module's public surface.
 *
 * This is what `SEditor`/`useEditorRuntime` imports: the six extensions, the page/paper
 * types, and the small pure helpers a UI panel needs (paper resolution, the page-number
 * label formatter).
 *
 * Everything is re-exported explicitly — including `export type` for the type-only entries —
 * because the package builds with `isolatedModules` and `verbatimModuleSyntax`, where a
 * bare `export *` from a module that only declares types is not safe to emit.
 */

/**
 * 六个扩展。节点名：`page`、`pageContent`、`pageRegion`、`pageHeader`、
 * `pageFooter`、`pageLogo`、`pageNumber`。
 *
 * The six extensions. Node names: `page`, `pageContent`, `pageRegion`, `pageHeader`, `pageFooter`, `pageLogo`, `pageNumber`.
 */
export { Page } from "./page";
export { PageContent } from "./pageContent/pageContent";
export { PageFooter } from "./pageFooter/pageFooter";
export { PageHeader } from "./pageHeader/pageHeader";
export { PageLogo } from "./pageLogo/pageLogo";
export { PageNumber } from "./pageNumber/pageNumber";
export { PageRegion } from "./pageRegion/pageRegion";

/**
 * 分页插件，供想要识别或移除它的使用方使用——以及它背后的调度策略：
 * 单趟时间预算（让大段粘贴把控制权让给浏览器而不是把它冻住），
 * 以及阻止被预算打断的一趟不停索要帧的阀门。
 *
 * The pagination plugin, for a consumer that wants to identify or remove it — plus the
 * scheduling policy behind it: the per-pass time budget (so a large paste yields to the
 * browser instead of freezing it) and the valve that stops a budget-interrupted pass from
 * asking for frames forever.
 */
export {
  createPaginationPlugin,
  DEFAULT_PASS_BUDGET_MS,
  MAX_CONSECUTIVE_PASSES,
  mayScheduleAnotherPass,
  paginateDocument,
  PAGINATION_META,
  paginationPluginKey,
  resolvePassBudget
} from "./pageContent/paginator";

/**
 * 纯引擎：导出它，宿主就能在没有编辑器的情况下规划版式。
 *
 * The pure engine: exported so a host can plan a layout without an editor.
 */
export { DEFAULT_PAGINATION_TOLERANCE, planPagination, planPullback } from "./utils/pagination";

/**
 * 页面计数，供「第 X 页 / 共 Y 页」状态栏使用。
 *
 * `getPageCount()` 是命令，因此返回 `boolean`（Tiptap 的命令契约）；那个*数字*维护在
 * `editor.storage.page.total` 上，也可以直接读作 `countPages(editor.state.doc)`。
 *
 * Page counting, for the "第 X 页 / 共 Y 页" status bar.
 *
 * `getPageCount()` is a command and therefore returns `boolean` (Tiptap's command contract);
 * the *number* is maintained on `editor.storage.page.total` and can also be read directly
 * as `countPages(editor.state.doc)`.
 */
export { collectPages, countPages, resolvePageNumber } from "./utils/nodes";

/**
 * 页码标签格式化函数（纯函数，状态栏可以复用它）。
 *
 * The page-number label formatter (pure, so a status bar can reuse it).
 */
export { formatPageNumberLabel } from "./utils/pageNumberLabel";

/**
 * 面板控件背后的纯规划函数：页码的格式与位置，以及把一条栏保持在三个可用区域的规则。
 *
 * The pure planners behind the panel's controls: the page number's format and placement, and the
 * rules that keep a band at three usable regions.
 */
export {
  DEFAULT_PAGE_NUMBER_PLACEMENT,
  planPageNumberFormat,
  planPageNumberPlacement,
  planPageNumberRemoval,
  placedSlot
} from "./utils/pageNumberFormat";
export type { PageNumberPlacement } from "./utils/pageNumberFormat";

/**
 * 区域模型：槽位词汇、锁定，以及归一化方案。
 *
 * The region model: slot vocabulary, locking and the normalisation plan.
 */
export { createRegionNodes, holdsLockedContent, planBandRegions, regionIsLocked, readSlot } from "./utils/regions";
export type { RegionMap, RegionRef } from "./utils/regions";

/**
 * 页眉 / 页脚编辑模型：哪三分之一是打开的，以及打开和关闭它的手势。
 *
 * 之所以导出，是因为宿主可能想自己驱动它——比如在自己的外层界面里放一个「编辑页眉」按钮，
 * 或者写测试——而不走编辑器的 DOM 事件。
 *
 * The furniture-editing model: which third is open, and the gestures that open and close it.
 *
 * Exported because a host may want to drive it — a "编辑页眉" button in its own chrome, or a test —
 * without going through the editor's DOM events.
 */
export {
  collectBands,
  createFurnitureEditingPlugin,
  furnitureEditingPluginKey,
  isFurnitureEditAllowed,
  planEnterFurniture,
  planExitFurniture,
  readFurnitureEditing
} from "./utils/furnitureEditing";
export type { BandRef, FurnitureEditingState } from "./utils/furnitureEditing";

/**
 * CSS 长度解析器，与测量器共用（缺陷 12 的修复）。
 *
 * The CSS length resolver, shared with the measurer (defect 12's fix).
 */
export {
  DEFAULT_ROOT_FONT_SIZE,
  mmToPx,
  pxToMm,
  resolveCssLength,
  resolveCssLengthOr
} from "./utils/length";

/**
 * 节点 / 属性读取函数。纯函数，所以设置面板可以把已保存的模板归一化。
 *
 * Node/attribute readers. Pure, so a settings panel can normalise a stored template.
 */
export {
  readBoolean,
  readCss,
  readLogoPosition,
  readMargins,
  readNumber,
  readOrientation,
  readPaperFormat,
  readString,
  readTextAlign
} from "./utils/attributes";

/** 属性默认值与 DOM 类名。 / Attribute defaults and DOM class names. */
export {
  DEFAULT_FURNITURE_HEIGHT,
  DEFAULT_FURNITURE_LINE,
  DEFAULT_LOGO_ATTRIBUTES,
  DEFAULT_ORIENTATION,
  DEFAULT_PAGE_AUTO,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_MARGINS,
  DEFAULT_PAGE_NUMBER_ATTRIBUTES,
  DEFAULT_PAPER_FORMAT,
  CSS_VARIABLE,
  DATA_TYPE,
  FURNITURE_CONTENT_CLASS,
  FURNITURE_LINE_CLASS,
  PAGE_CLASS,
  PAGE_CONTENT_CLASS,
  PAGE_CONTENT_INNER_CLASS,
  PAGE_FOOTER_CLASS,
  PAGE_HEADER_CLASS,
  PAGE_INNER_CLASS,
  PAGE_LOGO_CLASS,
  PAGE_LOGO_PLACEHOLDER_CLASS,
  PAGE_NUMBER_CLASS,
  PAGE_REGION_CLASS,
  PAGE_REGION_CONTENT_CLASS,
  REGION_EDITING_CLASS,
  REGION_LOCKED_CLASS
} from "./constant";

/** 三个槽位及其顺序与默认对齐。 / The three slots, their order and their default alignment. */
export { FURNITURE_SLOTS, SLOT_ALIGN, SLOT_ORDER } from "./typing";

/**
 * Logo 自身的大小上限；导出它，面板就能执行同一个数值。
 *
 * The logo's own size ceiling, exported so a panel can enforce the same number.
 */
export { DEFAULT_MAX_LOGO_BYTES } from "./pageLogo/pageLogo";

/**
 * 纸张模型，从 `typings/paper.ts` 再导出（一份定义，两个使用方）。
 *
 * The paper model, re-exported from `typings/paper.ts` (one definition, two consumers).
 */
export { DEFAULT_MARGINS, PAPER_SIZES, resolveMargins, resolvePaperSize } from "../../typings/paper";

export type { CssLength, Margins, NamedPaperFormat, Orientation, PaperFormat, PaperSize, ResolvedMargins } from "../../typings/paper";

export type {
  FurnitureAttributes,
  FurnitureSide,
  FurnitureSlot,
  LegacyLogoAttributes,
  LogoAttributes,
  LogoPlacement,
  LogoPosition,
  PageAttributes,
  PageContentOptions,
  PageContentStorage,
  PageFooterAttributes,
  PageFooterOptions,
  PageHeaderAttributes,
  PageHeaderOptions,
  PageLogoOptions,
  PageNumberAttributes,
  PageNumberOptions,
  PageOptions,
  PageStorage,
  PaginationController,
  PaginationDiagnostics,
  RegionAttributes,
  RegionOptions,
  TextAlign
} from "./typing";
