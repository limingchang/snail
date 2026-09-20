/**
 * The component layer's locale table.
 *
 * Every user-visible string the component layer produces lives here, mirroring the
 * `@snail-js/api` pattern: Chinese defaults, a `mergeEditorLocale` that takes a partial
 * override, and no string literals in a template. The extension layer has its own
 * table (`extensions/variable/typing.ts`'s `VariableLocale`) because an extension must
 * not depend on the component layer — the two are composed by the host.
 *
 * ## Why an error *code* and not an error *message*
 *
 * `editor/template.ts` is pure and has no locale, so it reports failures as a
 * machine-readable {@link TemplateErrorCode}; the mapping from that code to a sentence
 * is here. That keeps the pure module testable without a locale and keeps the strings
 * translatable.
 */

import type { ToolName } from "../typings/editor";
import type { TemplateErrorCode } from "./template";

/** Every string the component layer can show. */
export interface EditorLocale {
  /** Root/ARIA label of the editor region. */
  editor: string;

  /** Design-mode save action. */
  save: string;

  /** The save succeeded. */
  saved: string;

  /** The save failed. */
  saveFailed: string;

  /** Fill-mode action that opens the fill dialog. */
  fillAction: string;

  /**
   * The print **action** — the button in the fill footer.
   *
   * Named `printAction` rather than `print` because {@link EditorLocale.print} is the print
   * *panel's* table; one is a word, the other is a group.
   */
  printAction: string;

  /** Fetching something over the network. */
  loading: string;

  /** Shown when a network request failed. */
  loadFailed: string;

  /** Retry action next to a failure. */
  retry: string;

  /** The template list is empty. */
  noTemplates: string;

  /** Load action in the template picker. */
  load: string;

  /** The toolbar section titles, keyed by {@link ToolName}. */
  sections: Record<ToolName, string>;

  /** Shared words that would otherwise be repeated per component. */
  common: {
    confirm: string;
    cancel: string;
    insert: string;
    update: string;
    remove: string;
    edit: string;
    add: string;
    reset: string;
    none: string;
    unit: string;
  };

  /** `ToolFont`. */
  font: {
    family: string;
    size: string;
    bold: string;
    italic: string;
    underline: string;
    strike: string;
  };

  /** `ToolParagraph`. */
  paragraph: {
    style: string;
    body: string;
    align: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    alignJustify: string;
    indent: string;
    indentIncrease: string;
    indentDecrease: string;
    lineHeight: string;
    single: string;
    oneAndHalf: string;
    double: string;
    fixed: string;
    spaceBefore: string;
    spaceAfter: string;
  };

  /** `ToolInsert`. */
  insert: {
    table: string;
    layoutTable: string;
    layoutTableHint: string;
    tableSize: string;
    mergeCells: string;
    splitCell: string;
    addColumnBefore: string;
    addColumnAfter: string;
    addRowBefore: string;
    addRowAfter: string;
    deleteColumn: string;
    deleteRow: string;
    image: string;
    newPage: string;
    pageBreak: string;
  };

  /** `ToolPage`. */
  page: {
    margins: string;
    marginsPreset: string;
    top: string;
    bottom: string;
    left: string;
    right: string;
    orientation: string;
    portrait: string;
    landscape: string;
    paperSize: string;
    header: string;
    footer: string;
    addHeader: string;
    removeHeader: string;
    addFooter: string;
    removeFooter: string;
    headerFooterHeight: string;
    alignment: string;
    pageNumber: string;
    pageNumberPreset: string;
    pageNumberCustom: string;
    pageNumberTokens: string;
    pageNumberMissing: string;
    insertPageBreak: string;
    logo: string;
    addLogo: string;
    removeLogo: string;
    logoPosition: string;
    positionLeft: string;
    positionRight: string;
  };

  /** `ToolVariable`. */
  variable: {
    insert: string;
    list: string;
    empty: string;
    label: string;
    key: string;
    type: string;
    desc: string;
    defaultValue: string;
    required: string;
    keySource: string;
    keySourceManual: string;
    keySourceInner: string;
    pickInner: string;
    typeOptions: Record<string, string>;
    maxLength: string;
    placeholder: string;
    precision: string;
    thousands: string;
    min: string;
    max: string;
    currency: string;
    chineseUppercase: string;
    trueText: string;
    falseText: string;
    dateFormat: string;
    resolveToday: string;
    options: string;
    optionLabel: string;
    optionValue: string;
    optionDescription: string;
    moveUp: string;
    moveDown: string;
    multiple: string;
    joinWith: string;
    imageSource: string;
    imageUpload: string;
    imageSignature: string;
    imageAccept: string;
    imageMaxSize: string;
    imageWidth: string;
    formula: string;
    formulaExpression: string;
    formulaPreview: string;
    formulaReference: string;
    systemKey: string;
    systemKeys: Record<string, string>;
    keyPicker: string;
    title: string;
    createTitle: string;
    editTitle: string;
    errorLabel: string;
    errorKey: string;
    errorDuplicateKey: string;
    errorFormula: string;
    errorOptions: string;
  };

  /** `ToolQrcode`. */
  qrcode: {
    text: string;
    size: string;
    position: string;
    top: string;
    left: string;
    margin: string;
    color: string;
    background: string;
    insert: string;
    update: string;
    remove: string;
    regenerate: string;
    exists: string;
    notExists: string;
    insertFailed: string;
  };

  /** `ToolWatermark`. */
  watermark: {
    enable: string;
    kind: string;
    text: string;
    image: string;
    angle: string;
    opacity: string;
    greyscale: string;
    tiled: string;
    fontSize: string;
    color: string;
    apply: string;
    remove: string;
  };

  /** `ToolPrint`. */
  print: {
    action: string;
    paper: string;
    orientation: string;
    margins: string;
    marginBoxes: string;
    marginBoxesHint: string;
    documentTitle: string;
    usingDocumentSetup: string;
  };

  /** The fill dialog. */
  fill: {
    title: string;
    submit: string;
    systemValue: string;
    systemHint: string;
    imageUpload: string;
    signature: string;
    formulaComputed: string;
    noVariables: string;
    issueCount: string;
  };

  /** The template picker. */
  template: {
    title: string;
    manualHint: string;
  };

  /** A failure reported by the pure template layer. */
  errors: Record<TemplateErrorCode, string>;

  /** The hint shown while the editor has not been created yet. */
  notReady: string;
}

/** The built-in Chinese strings. */
export const DEFAULT_EDITOR_LOCALE: EditorLocale = {
  editor: "合同编辑器",
  save: "保存",
  saved: "保存成功",
  saveFailed: "保存失败",
  fillAction: "填写",
  printAction: "打印",
  loading: "加载中…",
  loadFailed: "加载失败",
  retry: "重试",
  noTemplates: "暂无模板",
  load: "载入",
  notReady: "编辑器尚未就绪",

  sections: {
    font: "格式",
    paragraph: "段落",
    insert: "插入",
    table: "表格",
    qrcode: "二维码",
    variable: "变量",
    page: "页面",
    watermark: "水印",
    print: "打印",
    template: "模板"
  },

  common: {
    confirm: "确定",
    cancel: "取消",
    insert: "插入",
    update: "更新",
    remove: "删除",
    edit: "编辑",
    add: "添加",
    reset: "重置",
    none: "无",
    unit: "单位"
  },

  font: {
    family: "字体",
    size: "字号",
    bold: "加粗",
    italic: "斜体",
    underline: "下划线",
    strike: "删除线"
  },

  paragraph: {
    style: "样式",
    body: "正文",
    align: "对齐",
    alignLeft: "左对齐",
    alignCenter: "居中",
    alignRight: "右对齐",
    alignJustify: "两端对齐",
    indent: "首行缩进",
    indentIncrease: "增加缩进",
    indentDecrease: "减少缩进",
    lineHeight: "行距",
    single: "单倍行距",
    oneAndHalf: "1.5 倍行距",
    double: "两倍行距",
    fixed: "固定值",
    spaceBefore: "段前",
    spaceAfter: "段后"
  },

  insert: {
    table: "插入表格",
    layoutTable: "插入布局表",
    layoutTableHint: "一般用于分栏布局",
    tableSize: "表格",
    mergeCells: "合并单元格",
    splitCell: "取消合并",
    addColumnBefore: "左侧插入列",
    addColumnAfter: "右侧插入列",
    addRowBefore: "上方插入行",
    addRowAfter: "下方插入行",
    deleteColumn: "删除当前列",
    deleteRow: "删除当前行",
    image: "插入图片",
    newPage: "新页面",
    pageBreak: "分页"
  },

  page: {
    margins: "页边距",
    marginsPreset: "预设边距",
    top: "上",
    bottom: "下",
    left: "左",
    right: "右",
    orientation: "纸张方向",
    portrait: "纵向",
    landscape: "横向",
    paperSize: "纸张大小",
    header: "页眉",
    footer: "页脚",
    addHeader: "启用页眉",
    removeHeader: "移除页眉",
    addFooter: "启用页脚",
    removeFooter: "移除页脚",
    headerFooterHeight: "页眉页脚高度",
    alignment: "对齐",
    pageNumber: "页码格式",
    pageNumberPreset: "预设样式",
    pageNumberCustom: "自定义",
    pageNumberTokens: "支持 {page} 当前页、{total} 总页数；# 与 & 为旧版别名",
    pageNumberMissing: "当前页脚没有页码节点，请先启用页脚",
    insertPageBreak: "插入分页符",
    logo: "Logo",
    addLogo: "添加 Logo",
    removeLogo: "移除 Logo",
    logoPosition: "Logo 位置",
    positionLeft: "左",
    positionRight: "右"
  },

  variable: {
    insert: "插入新变量",
    list: "文档变量",
    empty: "本文档暂无变量",
    label: "变量名称",
    key: "变量 Key",
    type: "变量类型",
    desc: "变量描述",
    defaultValue: "默认值",
    required: "必填",
    keySource: "Key 来源",
    keySourceManual: "手动输入",
    keySourceInner: "内置变量",
    pickInner: "选择内置变量",
    typeOptions: {
      text: "文本",
      number: "数字",
      money: "￥人民币",
      boolean: "布尔(是否)",
      date: "日期",
      select: "选项",
      image: "图片/签名",
      formula: "公式",
      system: "系统变量"
    },
    maxLength: "最大长度",
    placeholder: "占位提示",
    precision: "小数位",
    thousands: "千分位",
    min: "最小值",
    max: "最大值",
    currency: "货币符号",
    chineseUppercase: "同时输出中文大写",
    trueText: "「是」显示文本",
    falseText: "「否」显示文本",
    dateFormat: "日期格式",
    resolveToday: "「today」按当前日期解析",
    options: "选项列表",
    optionLabel: "显示文本",
    optionValue: "实际值",
    optionDescription: "说明",
    moveUp: "上移",
    moveDown: "下移",
    multiple: "允许多选",
    joinWith: "多选连接符",
    imageSource: "图片来源",
    imageUpload: "上传",
    imageSignature: "手写签名",
    imageAccept: "接受的文件类型",
    imageMaxSize: "最大体积 (MB)",
    imageWidth: "渲染宽度",
    formula: "公式",
    formulaExpression: "表达式",
    formulaPreview: "实时预览",
    formulaReference: "插入变量引用",
    systemKey: "系统值",
    systemKeys: {
      page: "当前页码",
      total: "总页数",
      pageLabel: "第 X 页",
      pageOfTotal: "第 X 页，共 Y 页",
      date: "当前日期",
      time: "当前时间"
    },
    keyPicker: "从内置变量中选择",
    title: "变量",
    createTitle: "插入新变量",
    editTitle: "编辑变量",
    errorLabel: "请填写变量名称",
    errorKey: "请填写变量 Key",
    errorDuplicateKey: "该 Key 已被其他变量使用",
    errorFormula: "公式无法解析，请检查表达式",
    errorOptions: "请至少配置一个有效选项"
  },

  qrcode: {
    text: "二维码内容",
    size: "尺寸",
    position: "位置",
    top: "上",
    left: "左",
    margin: "边距",
    color: "前景色",
    background: "背景色",
    insert: "插入二维码",
    update: "更新二维码",
    remove: "删除二维码",
    regenerate: "重新生成",
    exists: "文档中已存在二维码",
    notExists: "文档中暂无二维码",
    insertFailed: "二维码插入失败"
  },

  watermark: {
    enable: "启用水印",
    kind: "水印类型",
    text: "文字水印",
    image: "图片水印",
    angle: "旋转角度",
    opacity: "透明度",
    greyscale: "灰度",
    tiled: "平铺",
    fontSize: "字号",
    color: "颜色",
    apply: "应用水印",
    remove: "移除水印"
  },

  print: {
    action: "打印",
    paper: "纸张",
    orientation: "方向",
    margins: "页边距",
    marginBoxes: "渲染页码",
    marginBoxesHint: "使用 @page margin box，Chromium 131+ 支持，Firefox/Safari 不支持；不支持时文档自身的页码节点仍然打印",
    documentTitle: "文档标题",
    usingDocumentSetup: "跟随文档设置"
  },

  fill: {
    title: "填写变量",
    submit: "确定",
    systemValue: "文档自动提供",
    systemHint: "该值由文档在填写或打印时自动生成，无需手工输入",
    imageUpload: "上传图片",
    signature: "手写签名",
    formulaComputed: "由公式计算",
    noVariables: "本文档没有可填写的变量",
    issueCount: "有 {count} 项需要修正"
  },

  template: {
    title: "模板列表",
    manualHint: "请选择模板后点击「载入」"
  },

  errors: {
    "invalid-template": "模板数据无法识别",
    "not-a-json-document": "模板内容不是合法的 JSON 文档",
    "storage-unavailable": "当前环境不支持本地存储",
    "storage-write-failed": "写入本地存储失败",
    "network-unavailable": "当前环境不支持网络请求",
    "network-error": "网络请求失败",
    "response-error": "服务端返回了错误状态",
    "invalid-list": "模板列表格式不正确"
  }
};

/**
 * Merge a partial override over the defaults.
 *
 * One level of nesting is merged explicitly rather than deep-merged generically: the
 * nested groups are a fixed, known set, and a generic deep merge would silently accept a
 * typo'd group name. A group named in the override replaces only the keys it names.
 */
export function mergeEditorLocale(overrides?: Partial<EditorLocale>): EditorLocale {
  if (!overrides) return DEFAULT_EDITOR_LOCALE;

  return {
    ...DEFAULT_EDITOR_LOCALE,
    ...overrides,
    sections: { ...DEFAULT_EDITOR_LOCALE.sections, ...overrides.sections },
    common: { ...DEFAULT_EDITOR_LOCALE.common, ...overrides.common },
    font: { ...DEFAULT_EDITOR_LOCALE.font, ...overrides.font },
    paragraph: { ...DEFAULT_EDITOR_LOCALE.paragraph, ...overrides.paragraph },
    insert: { ...DEFAULT_EDITOR_LOCALE.insert, ...overrides.insert },
    page: { ...DEFAULT_EDITOR_LOCALE.page, ...overrides.page },
    variable: {
      ...DEFAULT_EDITOR_LOCALE.variable,
      ...overrides.variable,
      typeOptions: { ...DEFAULT_EDITOR_LOCALE.variable.typeOptions, ...overrides.variable?.typeOptions },
      systemKeys: { ...DEFAULT_EDITOR_LOCALE.variable.systemKeys, ...overrides.variable?.systemKeys }
    },
    qrcode: { ...DEFAULT_EDITOR_LOCALE.qrcode, ...overrides.qrcode },
    watermark: { ...DEFAULT_EDITOR_LOCALE.watermark, ...overrides.watermark },
    print: { ...DEFAULT_EDITOR_LOCALE.print, ...overrides.print },
    fill: { ...DEFAULT_EDITOR_LOCALE.fill, ...overrides.fill },
    template: { ...DEFAULT_EDITOR_LOCALE.template, ...overrides.template },
    errors: { ...DEFAULT_EDITOR_LOCALE.errors, ...overrides.errors }
  };
}

/** The label for a {@link ToolName} section, with a total fallback for a future name. */
export function sectionLabel(locale: EditorLocale, name: ToolName): string {
  return locale.sections[name] ?? name;
}

/** Turn a {@link TemplateErrorCode} into a sentence. */
export function describeTemplateError(locale: EditorLocale, code: TemplateErrorCode): string {
  return locale.errors[code] ?? code;
}
