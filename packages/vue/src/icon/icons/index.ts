/**
 * 内置图标集 —— 由脚本生成，请勿手工修改。
 *
 * 在本目录新增或删除图标文件后，用 `node ./scripts/generate-icons.mjs` 重新生成。
 *
 * ## 为什么用 barrel 而不是 glob
 *
 * Vite 的 `import.meta.glob({ eager: true })` 会把**每一个**图标都塞进每一个使用方的
 * 产物里。这份显式列表让模块图保持狭窄，打包器因此可以丢掉应用从未导入的图标。
 *
 * ## 为什么这些图标会存在
 *
 * 每一个都是 `@element-plus/icons-vue` 没有提供的字形 —— 表格与列控制、合同场景特有的
 * 标记（变量、二维码、页面设置）以及品牌标识。Element Plus 已经提供的图标被刻意移除，
 * 因此这两套图标是互补而非重叠的关系。
 *
 * 每个图标都带有 `width="1em" height="1em"` 和 `fill="currentColor"`，所以不需要样式表
 * 就能正确确定尺寸和颜色。
 *
 * The bundled icon set — generated, do not edit by hand.
 *
 * Regenerate with `node ./scripts/generate-icons.mjs` after adding or removing a
 * file in this directory.
 *
 * ## Why a barrel and not a glob
 *
 * Vite's `import.meta.glob({ eager: true })` would pull **every** icon into every
 * consumer's bundle. This explicit list keeps the module graph narrow, so a bundler
 * drops the icons an application never imports.
 *
 * ## Why these icons exist at all
 *
 * Each one is a glyph that `@element-plus/icons-vue` does not provide — table and
 * column controls, the contract-specific marks (variable, QR code, page setup) and
 * the brand marks. Icons Element Plus already ships were deliberately removed, so
 * the two sets are complementary rather than overlapping.
 *
 * Every icon carries `width="1em" height="1em"` and `fill="currentColor"`, so it is
 * correctly sized and recolourable with no stylesheet.
 */
import type { Component } from "vue";

import IconAccount from "./Account.vue";
import IconAddColumnAfter from "./AddColumnAfter.vue";
import IconAddColumnBefore from "./AddColumnBefore.vue";
import IconAddRowAfter from "./AddRowAfter.vue";
import IconAddRowBefore from "./AddRowBefore.vue";
import IconApprove from "./Approve.vue";
import IconBook from "./Book.vue";
import IconCard from "./Card.vue";
import IconCardFill from "./CardFill.vue";
import IconCashPayment from "./CashPayment.vue";
import IconCloudDownload from "./CloudDownload.vue";
import IconCloudUpload from "./CloudUpload.vue";
import IconCoins from "./Coins.vue";
import IconCompany from "./Company.vue";
import IconContract from "./Contract.vue";
import IconDashboard from "./Dashboard.vue";
import IconDashboardSolid from "./DashboardSolid.vue";
import IconData from "./Data.vue";
import IconDeleteColumn from "./DeleteColumn.vue";
import IconDeleteRow from "./DeleteRow.vue";
import IconEdit from "./Edit.vue";
import IconEditFill from "./EditFill.vue";
import IconEditSolid from "./EditSolid.vue";
import IconEmpower from "./Empower.vue";
import IconEmpowerFill from "./EmpowerFill.vue";
import IconExcel from "./Excel.vue";
import IconExpenseAccount from "./ExpenseAccount.vue";
import IconFileDownload from "./FileDownload.vue";
import IconFileDownloadFill from "./FileDownloadFill.vue";
import IconFileUpload from "./FileUpload.vue";
import IconFileUploadFill from "./FileUploadFill.vue";
import IconFinance from "./Finance.vue";
import IconFinancial from "./Financial.vue";
import IconFolderFill from "./FolderFill.vue";
import IconFolderOpenFill from "./FolderOpenFill.vue";
import IconHistogramBlock from "./HistogramBlock.vue";
import IconLayout from "./Layout.vue";
import IconManage from "./Manage.vue";
import IconMergeCells from "./MergeCells.vue";
import IconNewPage from "./NewPage.vue";
import IconOk from "./Ok.vue";
import IconPageMargin from "./PageMargin.vue";
import IconPageOrientation from "./PageOrientation.vue";
import IconPageSize from "./PageSize.vue";
import IconPdf from "./Pdf.vue";
import IconPermission from "./Permission.vue";
import IconPermissionFill from "./PermissionFill.vue";
import IconPrintFill from "./PrintFill.vue";
import IconProcess from "./Process.vue";
import IconProject from "./Project.vue";
import IconProjectSolid from "./ProjectSolid.vue";
import IconQRCode from "./QRCode.vue";
import IconSendFill from "./SendFill.vue";
import IconSettingFill from "./SettingFill.vue";
import IconShrinkScreen from "./ShrinkScreen.vue";
import IconSign from "./Sign.vue";
import IconSnail from "./Snail.vue";
import IconSnailFill from "./SnailFill.vue";
import IconSnailFull from "./SnailFull.vue";
import IconSnailSolid from "./SnailSolid.vue";
import IconSubject from "./Subject.vue";
import IconTable from "./Table.vue";
import IconTransferAccounts from "./TransferAccounts.vue";
import IconUnmergeCells from "./UnmergeCells.vue";
import IconUserGroup from "./UserGroup.vue";
import IconVariable from "./Variable.vue";
import IconWechat from "./Wechat.vue";
import IconWifi from "./Wifi.vue";
import IconWord from "./Word.vue";
import IconWorkflow from "./Workflow.vue";

export {
  IconAccount,
  IconAddColumnAfter,
  IconAddColumnBefore,
  IconAddRowAfter,
  IconAddRowBefore,
  IconApprove,
  IconBook,
  IconCard,
  IconCardFill,
  IconCashPayment,
  IconCloudDownload,
  IconCloudUpload,
  IconCoins,
  IconCompany,
  IconContract,
  IconDashboard,
  IconDashboardSolid,
  IconData,
  IconDeleteColumn,
  IconDeleteRow,
  IconEdit,
  IconEditFill,
  IconEditSolid,
  IconEmpower,
  IconEmpowerFill,
  IconExcel,
  IconExpenseAccount,
  IconFileDownload,
  IconFileDownloadFill,
  IconFileUpload,
  IconFileUploadFill,
  IconFinance,
  IconFinancial,
  IconFolderFill,
  IconFolderOpenFill,
  IconHistogramBlock,
  IconLayout,
  IconManage,
  IconMergeCells,
  IconNewPage,
  IconOk,
  IconPageMargin,
  IconPageOrientation,
  IconPageSize,
  IconPdf,
  IconPermission,
  IconPermissionFill,
  IconPrintFill,
  IconProcess,
  IconProject,
  IconProjectSolid,
  IconQRCode,
  IconSendFill,
  IconSettingFill,
  IconShrinkScreen,
  IconSign,
  IconSnail,
  IconSnailFill,
  IconSnailFull,
  IconSnailSolid,
  IconSubject,
  IconTable,
  IconTransferAccounts,
  IconUnmergeCells,
  IconUserGroup,
  IconVariable,
  IconWechat,
  IconWifi,
  IconWord,
  IconWorkflow
};

/**
 * 每一个内置图标，按组件名索引。
 *
 * 供插件注册整套图标使用，也被下面的 `IconName` 使用。
 *
 * Every bundled icon, keyed by its component name.
 *
 * Used by the plugin to register the set, and by `IconName` below.
 */
export const iconComponents = {
  IconAccount,
  IconAddColumnAfter,
  IconAddColumnBefore,
  IconAddRowAfter,
  IconAddRowBefore,
  IconApprove,
  IconBook,
  IconCard,
  IconCardFill,
  IconCashPayment,
  IconCloudDownload,
  IconCloudUpload,
  IconCoins,
  IconCompany,
  IconContract,
  IconDashboard,
  IconDashboardSolid,
  IconData,
  IconDeleteColumn,
  IconDeleteRow,
  IconEdit,
  IconEditFill,
  IconEditSolid,
  IconEmpower,
  IconEmpowerFill,
  IconExcel,
  IconExpenseAccount,
  IconFileDownload,
  IconFileDownloadFill,
  IconFileUpload,
  IconFileUploadFill,
  IconFinance,
  IconFinancial,
  IconFolderFill,
  IconFolderOpenFill,
  IconHistogramBlock,
  IconLayout,
  IconManage,
  IconMergeCells,
  IconNewPage,
  IconOk,
  IconPageMargin,
  IconPageOrientation,
  IconPageSize,
  IconPdf,
  IconPermission,
  IconPermissionFill,
  IconPrintFill,
  IconProcess,
  IconProject,
  IconProjectSolid,
  IconQRCode,
  IconSendFill,
  IconSettingFill,
  IconShrinkScreen,
  IconSign,
  IconSnail,
  IconSnailFill,
  IconSnailFull,
  IconSnailSolid,
  IconSubject,
  IconTable,
  IconTransferAccounts,
  IconUnmergeCells,
  IconUserGroup,
  IconVariable,
  IconWechat,
  IconWifi,
  IconWord,
  IconWorkflow
} as const;

/**
 * 任意内置图标的名字 —— `<SIcon icon="…">` 以字符串形式接受的就是它。
 *
 * The name of any bundled icon — what `<SIcon icon="…">` accepts as a string.
 */
export type IconName = keyof typeof iconComponents;

/**
 * 一个结构化表示的组件映射，供需要遍历整套图标的使用方使用。
 *
 * A component map, structurally, for consumers that iterate the set.
 */
export type IconComponentMap = Readonly<Record<string, Component>>;
