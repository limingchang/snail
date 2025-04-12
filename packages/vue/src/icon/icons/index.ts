import type { Component, App } from "vue";

import Account from "./Account.vue";
import Approve from "./Approve.vue";
import Book from "./Book.vue";
import Card from "./Card.vue";
import CardFill from "./CardFill.vue";
import CashPayment from "./CashPayment.vue";
import ChartFill from "./ChartFill.vue";
import CloudDownload from "./CloudDownload.vue";
import CloudUpload from "./CloudUpload.vue";
import Coins from "./Coins.vue";
import Company from "./Company.vue";
import Contract from "./Contract.vue";
import Copy from "./Copy.vue";
import Dashboard from "./Dashboard.vue";
import DashboardSolid from "./DashboardSolid.vue";
import Data from "./Data.vue";
import Delete from "./Delete.vue";
import DeleteFill from "./DeleteFill.vue";
import Edit from "./Edit.vue";
import EditFill from "./EditFill.vue";
import EditSolid from "./EditSolid.vue";
import Empower from "./Empower.vue";
import EmpowerFill from "./EmpowerFill.vue";
import Error from "./Error.vue";
import ErrorFill from "./ErrorFill.vue";
import Excel from "./Excel.vue";
import ExpenseAccount from "./ExpenseAccount.vue";
import FileDownload from "./FileDownload.vue";
import FileDownloadFill from "./FileDownloadFill.vue";
import FileUpload from "./FileUpload.vue";
import FileUploadFill from "./FileUploadFill.vue";
import Finance from "./Finance.vue";
import Financial from "./Financial.vue";
import Folder from "./Folder.vue";
import FolderFill from "./FolderFill.vue";
import FolderOpenFill from "./FolderOpenFill.vue";
import FullScreen from "./FullScreen.vue";
import Histogram from "./Histogram.vue";
import HistogramBlock from "./HistogramBlock.vue";
import Home from "./Home.vue";
import Link from "./Link.vue";
import Location from "./Location.vue";
import LocationFill from "./LocationFill.vue";
import Lock from "./Lock.vue";
import Manage from "./Manage.vue";
import Minus from "./Minus.vue";
import Mobile from "./Mobile.vue";
import Ok from "./Ok.vue";
import OkFill from "./OkFill.vue";
import Pdf from "./Pdf.vue";
import Permission from "./Permission.vue";
import PermissionFill from "./PermissionFill.vue";
import Plus from "./Plus.vue";
import Print from "./Print.vue";
import PrintFill from "./PrintFill.vue";
import Process from "./Process.vue";
import Project from "./Project.vue";
import ProjectSolid from "./ProjectSolid.vue";
import QRCode from "./QRCode.vue";
import Send from "./Send.vue";
import SendFill from "./SendFill.vue";
import SettingFill from "./SettingFill.vue";
import ShrinkScreen from "./ShrinkScreen.vue";
import Sign from "./Sign.vue";
import Snail from "./Snail.vue";
import SnailFill from "./SnailFill.vue";
import SnailFull from "./SnailFull.vue";
import SnailSolid from "./SnailSolid.vue";
import Subject from "./Subject.vue";
import Table from "./Table.vue";
import Time from "./Time.vue";
import TransferAccounts from "./TransferAccounts.vue";
import UserGroup from "./UserGroup.vue";
import Wechat from "./Wechat.vue";
import Wifi from "./Wifi.vue";
import Word from "./Word.vue";
import Workflow from "./Workflow.vue";

function install(component: Component) {
  (component as any).install = (app: App) => {
    app.component(component.name!, component);
  };
  return component;
}

export const IconAccount = install(Account);
export const IconApprove = install(Approve);
export const IconBook = install(Book);
export const IconCard = install(Card);
export const IconCardFill = install(CardFill);
export const IconCashPayment = install(CashPayment);
export const IconChartFill = install(ChartFill);
export const IconCloudDownload = install(CloudDownload);
export const IconCloudUpload = install(CloudUpload);
export const IconCoins = install(Coins);
export const IconCompany = install(Company);
export const IconContract = install(Contract);
export const IconCopy = install(Copy);
export const IconDashboard = install(Dashboard);
export const IconDashboardSolid = install(DashboardSolid);
export const IconData = install(Data);
export const IconDelete = install(Delete);
export const IconDeleteFill = install(DeleteFill);
export const IconEdit = install(Edit);
export const IconEditFill = install(EditFill);
export const IconEditSolid = install(EditSolid);
export const IconEmpower = install(Empower);
export const IconEmpowerFill = install(EmpowerFill);
export const IconError = install(Error);
export const IconErrorFill = install(ErrorFill);
export const IconExcel = install(Excel);
export const IconExpenseAccount = install(ExpenseAccount);
export const IconFileDownload = install(FileDownload);
export const IconFileDownloadFill = install(FileDownloadFill);
export const IconFileUpload = install(FileUpload);
export const IconFileUploadFill = install(FileUploadFill);
export const IconFinance = install(Finance);
export const IconFinancial = install(Financial);
export const IconFolder = install(Folder);
export const IconFolderFill = install(FolderFill);
export const IconFolderOpenFill = install(FolderOpenFill);
export const IconFullScreen = install(FullScreen);
export const IconHistogram = install(Histogram);
export const IconHistogramBlock = install(HistogramBlock);
export const IconHome = install(Home);
export const IconLink = install(Link);
export const IconLocation = install(Location);
export const IconLocationFill = install(LocationFill);
export const IconLock = install(Lock);
export const IconManage = install(Manage);
export const IconMinus = install(Minus);
export const IconMobile = install(Mobile);
export const IconOk = install(Ok);
export const IconOkFill = install(OkFill);
export const IconPdf = install(Pdf);
export const IconPermission = install(Permission);
export const IconPermissionFill = install(PermissionFill);
export const IconPlus = install(Plus);
export const IconPrint = install(Print);
export const IconPrintFill = install(PrintFill);
export const IconProcess = install(Process);
export const IconProject = install(Project);
export const IconProjectSolid = install(ProjectSolid);
export const IconQRCode = install(QRCode);
export const IconSend = install(Send);
export const IconSendFill = install(SendFill);
export const IconSettingFill = install(SettingFill);
export const IconShrinkScreen = install(ShrinkScreen);
export const IconSign = install(Sign);
export const IconSnail = install(Snail);
export const IconSnailFill = install(SnailFill);
export const IconSnailFull = install(SnailFull);
export const IconSnailSolid = install(SnailSolid);
export const IconSubject = install(Subject);
export const IconTable = install(Table);
export const IconTime = install(Time);
export const IconTransferAccounts = install(TransferAccounts);
export const IconUserGroup = install(UserGroup);
export const IconWechat = install(Wechat);
export const IconWifi = install(Wifi);
export const IconWord = install(Word);
export const IconWorkflow = install(Workflow);
