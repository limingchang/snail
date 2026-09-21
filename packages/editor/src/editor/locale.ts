/**
 * 组件层的 locale 表。
 *
 * 组件层产生的每一条用户可见字符串都在这里，与 `@snail-js/api` 的模式一致：中文默认值、
 * 接受局部覆盖的 `mergeEditorLocale`，模板里没有字符串字面量。扩展层有自己的表
 * （`extensions/variable/typing.ts` 的 `VariableLocale`），因为扩展不能依赖组件层 ——
 * 两者由宿主组合。
 *
 * ## 为什么是错误**码**而不是错误**消息**
 *
 * `editor/template.ts` 是纯的、没有 locale，因此它把失败报告为机器可读的
 * {@link TemplateErrorCode}；从码到句子的映射在这里。这让纯模块无需 locale 也能测试，
 * 也让这些字符串可翻译。
 *
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

/** 组件层能显示的全部字符串。 / Every string the component layer can show. */
export interface EditorLocale {
  /** 编辑器区域的根标签与 ARIA 标签。 / Root/ARIA label of the editor region. */
  editor: string;

  /** 设计模式的保存操作。 / Design-mode save action. */
  save: string;

  /** 保存成功。 / The save succeeded. */
  saved: string;

  /** 保存失败。 / The save failed. */
  saveFailed: string;

  /** 填写模式下打开填写对话框的操作。 / Fill-mode action that opens the fill dialog. */
  fillAction: string;

  /**
   * 打印**操作** —— 填写模式底部栏里的那个按钮。
   *
   * 命名为 `printAction` 而不是 `print`，因为 {@link EditorLocale.print} 是打印**面板**的
   * 表；一个是词，另一个是一组。
   *
   * The print **action** — the button in the fill footer.
   *
   * Named `printAction` rather than `print` because {@link EditorLocale.print} is the print
   * *panel's* table; one is a word, the other is a group.
   */
  printAction: string;

  /** 正在通过网络获取内容。 / Fetching something over the network. */
  loading: string;

  /** 网络请求失败时显示。 / Shown when a network request failed. */
  loadFailed: string;

  /** 失败提示旁边的重试操作。 / Retry action next to a failure. */
  retry: string;

  /** 模板列表为空。 / The template list is empty. */
  noTemplates: string;

  /** 模板选择器里的载入操作。 / Load action in the template picker. */
  load: string;

  /**
   * 工具栏分组标题，以 {@link ToolName} 为键。
   *
   * The toolbar section titles, keyed by {@link ToolName}.
   */
  sections: Record<ToolName, string>;

  /**
   * 共用词，否则会在每个组件里重复一遍。
   *
   * Shared words that would otherwise be repeated per component.
   */
  common: {
    /** `common` 分组：「确定」。 / `common` group: confirm. */
    confirm: string;
    /** `common` 分组：「取消」。 / `common` group: cancel. */
    cancel: string;
    /** `common` 分组：「插入」。 / `common` group: insert. */
    insert: string;
    /** `common` 分组：「更新」。 / `common` group: update. */
    update: string;
    /** `common` 分组：「删除」。 / `common` group: remove. */
    remove: string;
    /** `common` 分组：「编辑」。 / `common` group: edit. */
    edit: string;
    /** `common` 分组：「添加」。 / `common` group: add. */
    add: string;
    /** `common` 分组：「重置」。 / `common` group: reset. */
    reset: string;
    /** `common` 分组：「无」。 / `common` group: none. */
    none: string;
    /** `common` 分组：「单位」。 / `common` group: the unit. */
    unit: string;
  };

  /** `ToolFont`。 / `ToolFont`. */
  font: {
    /** `font` 分组：「字体」。 / `font` group: the font family. */
    family: string;
    /** `font` 分组：「字号」。 / `font` group: the font size. */
    size: string;
    /** `font` 分组：「字体颜色」。 / `font` group: the font colour. */
    color: string;
    /** `font` 分组：「字体背景色」。 / `font` group: the font background colour. */
    backgroundColor: string;
    /** `font` 分组：「加粗」。 / `font` group: bold. */
    bold: string;
    /** `font` 分组：「斜体」。 / `font` group: italic. */
    italic: string;
    /** `font` 分组：「下划线」。 / `font` group: underline. */
    underline: string;
    /** `font` 分组：「删除线」。 / `font` group: strikethrough. */
    strike: string;
  };

  /** `ToolParagraph`。 / `ToolParagraph`. */
  paragraph: {
    /** `paragraph` 分组：「样式」。 / `paragraph` group: the paragraph style. */
    style: string;
    /** `paragraph` 分组：「正文」。 / `paragraph` group: body text. */
    body: string;
    /** `paragraph` 分组：「对齐」。 / `paragraph` group: alignment. */
    align: string;
    /** `paragraph` 分组：「左对齐」。 / `paragraph` group: align left. */
    alignLeft: string;
    /** `paragraph` 分组：「居中」。 / `paragraph` group: centre. */
    alignCenter: string;
    /** `paragraph` 分组：「右对齐」。 / `paragraph` group: align right. */
    alignRight: string;
    /** `paragraph` 分组：「两端对齐」。 / `paragraph` group: justify. */
    alignJustify: string;
    /** `paragraph` 分组：「首行缩进」。 / `paragraph` group: the first-line indent. */
    indent: string;
    /**
     * 缩进输入框后面显示的单位。
     *
     * 缩进是用**字符数**表示的，不是一个抽象数字：「首行缩进 2」对中文作者就是两个字符，
     * 而 `2em` 正好就是它（一个中日韩字形就是一个 em）。旧面板只有一个开关，硬编码成
     * 两个字符。
     *
     * Suffix shown after the indent input.
     *
     * The indent is expressed in **characters**, not in an abstract number: "首行缩进 2"
     * means two characters to a Chinese author, and `2em` is exactly that (one CJK glyph is
     * one em). The legacy panel only had an on/off toggle, hardcoded to two characters.
     */
    indentUnit: string;
    /** `paragraph` 分组：「增加缩进」。 / `paragraph` group: increase the indent. */
    indentIncrease: string;
    /** `paragraph` 分组：「减少缩进」。 / `paragraph` group: decrease the indent. */
    indentDecrease: string;
    /** `paragraph` 分组：「行距」。 / `paragraph` group: the line height. */
    lineHeight: string;
    /** `paragraph` 分组：「单倍行距」。 / `paragraph` group: single spacing. */
    single: string;
    /** `paragraph` 分组：「1.5 倍行距」。 / `paragraph` group: 1.5 line spacing. */
    oneAndHalf: string;
    /** `paragraph` 分组：「两倍行距」。 / `paragraph` group: double spacing. */
    double: string;
    /** `paragraph` 分组：「固定值」。 / `paragraph` group: a fixed line height. */
    fixed: string;
    /** `paragraph` 分组：「段前」。 / `paragraph` group: the space before the paragraph. */
    spaceBefore: string;
    /** `paragraph` 分组：「段后」。 / `paragraph` group: the space after the paragraph. */
    spaceAfter: string;
  };

  /** `ToolInsert`。 / `ToolInsert`. */
  insert: {
    /** `insert` 分组：「插入变量」。 / `insert` group: insert a variable. */
    variable: string;
    /** `insert` 分组：「插入二维码」。 / `insert` group: insert a QR code. */
    qrcode: string;
    /** `insert` 分组：「插入图片」。 / `insert` group: insert an image. */
    image: string;
    /** `insert` 分组：「新页面」。 / `insert` group: a new page. */
    newPage: string;
    /** `insert` 分组：「分页」。 / `insert` group: a page break. */
    pageBreak: string;
  };

  /**
   * `ToolTable`。
   *
   * 自成一个组，而不是 `insert` 下的几个条目：表格工具作用于光标已经在的那个表格，这与
   * 插入新东西是两回事。
   *
   * `ToolTable`.
   *
   * A group of its own rather than entries under `insert`: the table tools act on the table
   * the caret is already in, which is a different job from inserting something new.
   */
  table: {
    /** `table` 分组：「插入表格」。 / `table` group: insert a table. */
    table: string;
    /** `table` 分组：「插入布局表」。 / `table` group: insert a layout table. */
    layoutTable: string;
    /**
     * `table` 分组：「一般用于分栏布局」。
     *
     * `table` group: the hint that layout tables are used for columns.
     */
    layoutTableHint: string;
    /** `table` 分组：「表格」。 / `table` group: the table size picker. */
    tableSize: string;
    /** `table` 分组：「合并单元格」。 / `table` group: merge cells. */
    mergeCells: string;
    /** `table` 分组：「取消合并」。 / `table` group: split a cell. */
    splitCell: string;
    /** `table` 分组：「左侧插入列」。 / `table` group: insert a column to the left. */
    addColumnBefore: string;
    /** `table` 分组：「右侧插入列」。 / `table` group: insert a column to the right. */
    addColumnAfter: string;
    /** `table` 分组：「上方插入行」。 / `table` group: insert a row above. */
    addRowBefore: string;
    /** `table` 分组：「下方插入行」。 / `table` group: insert a row below. */
    addRowAfter: string;
    /** `table` 分组：「删除当前列」。 / `table` group: delete the current column. */
    deleteColumn: string;
    /** `table` 分组：「删除当前行」。 / `table` group: delete the current row. */
    deleteRow: string;
  };

  /** `ToolPage`。 / `ToolPage`. */
  page: {
    /** `page` 分组：「页边距」。 / `page` group: the page margins. */
    margins: string;
    /** `page` 分组：「预设边距」。 / `page` group: the preset margins. */
    marginsPreset: string;
    /** `page` 分组：「上」。 / `page` group: the top margin. */
    top: string;
    /** `page` 分组：「下」。 / `page` group: the bottom margin. */
    bottom: string;
    /** `page` 分组：「左」。 / `page` group: the left margin. */
    left: string;
    /** `page` 分组：「右」。 / `page` group: the right margin. */
    right: string;
    /** `page` 分组：「纸张方向」。 / `page` group: the paper orientation. */
    orientation: string;
    /** `page` 分组：「纵向」。 / `page` group: portrait. */
    portrait: string;
    /** `page` 分组：「横向」。 / `page` group: landscape. */
    landscape: string;
    /** `page` 分组：「纸张大小」。 / `page` group: the paper size. */
    paperSize: string;
    /** `page` 分组：「页眉」。 / `page` group: the header. */
    header: string;
    /** `page` 分组：「页脚」。 / `page` group: the footer. */
    footer: string;
    /** `page` 分组：「启用页眉」。 / `page` group: enable the header. */
    addHeader: string;
    /** `page` 分组：「移除页眉」。 / `page` group: remove the header. */
    removeHeader: string;
    /** `page` 分组：「启用页脚」。 / `page` group: enable the footer. */
    addFooter: string;
    /** `page` 分组：「移除页脚」。 / `page` group: remove the footer. */
    removeFooter: string;
    /** `page` 分组：「页眉页脚高度」。 / `page` group: the header and footer height. */
    headerFooterHeight: string;
    /** `page` 分组：「页码」。 / `page` group: the page number. */
    pageNumber: string;
    /** `page` 分组：「预设样式」。 / `page` group: a preset page-number pattern. */
    pageNumberPreset: string;
    /** `page` 分组：「自定义」。 / `page` group: a custom page-number pattern. */
    pageNumberCustom: string;
    /**
     * `page` 分组：「支持 {page} 当前页、{total} 总页数；# 与 & 同样可用」。
     *
     * `page` group: the page-number tokens the pattern accepts.
     */
    pageNumberTokens: string;
    /**
     * 页码 / Logo 的「不显示」选项：放到 `"none"` 就是移除。
     *
     * The "not shown" option for page numbers / logos: set to `"none"` to remove.
     */
    pageNumberHidden: string;
    /**
     * 三个区域的槽位名：左 / 中 / 右。
     *
     * The three region slot names: left / centre / right.
     */
    slotLeft: string;
    /** `page` 分组：「中」。 / `page` group: the centre slot. */
    slotCenter: string;
    /** `page` 分组：「右」。 / `page` group: the right slot. */
    slotRight: string;
    /** `page` 分组：「插入分页符」。 / `page` group: insert a page break. */
    insertPageBreak: string;
    /** `page` 分组：「Logo」。 / `page` group: the logo. */
    logo: string;
    /** 选择一张图片作为 Logo。 / Choose an image to use as the logo. */
    logoUpload: string;
    /**
     * 图片超过扩展允许的大小时提示（扩展默认 200 KB）。
     *
     * Shown when the image exceeds the size the extension allows (200 KB by default).
     */
    logoTooLarge: string;
  };

  /** `ToolVariable`。 / `ToolVariable`. */
  variable: {
    /** `variable` 分组：「插入新变量」。 / `variable` group: insert a new variable. */
    insert: string;
    /** `variable` 分组：「文档变量」。 / `variable` group: the variables of the document. */
    list: string;
    /**
     * `variable` 分组：「本文档暂无变量」。
     *
     * `variable` group: shown when the document has no variables.
     */
    empty: string;
    /** `variable` 分组：「变量名称」。 / `variable` group: the variable name. */
    label: string;
    /** `variable` 分组：「变量 Key」。 / `variable` group: the variable key. */
    key: string;
    /** `variable` 分组：「变量类型」。 / `variable` group: the variable type. */
    type: string;
    /** `variable` 分组：「变量描述」。 / `variable` group: the variable description. */
    desc: string;
    /** `variable` 分组：「默认值」。 / `variable` group: the default value. */
    defaultValue: string;
    /** `variable` 分组：「必填」。 / `variable` group: required. */
    required: string;
    /** `variable` 分组：「Key 来源」。 / `variable` group: where the key comes from. */
    keySource: string;
    /** `variable` 分组：「手动输入」。 / `variable` group: a key typed by hand. */
    keySourceManual: string;
    /**
     * `variable` 分组：「内置变量」。
     *
     * `variable` group: a built-in variable as the key source.
     */
    keySourceInner: string;
    /** `variable` 分组：「选择内置变量」。 / `variable` group: pick a built-in variable. */
    pickInner: string;
    /**
     * `ToolVariable` 分组：按类型 key 索引的文案表。
     *
     * `variable` group: the variable-type labels, keyed by type.
     */
    typeOptions: Record<string, string>;
    /** `variable` 分组：「最大长度」。 / `variable` group: the maximum length. */
    maxLength: string;
    /** `variable` 分组：「占位提示」。 / `variable` group: the placeholder hint. */
    placeholder: string;
    /** `variable` 分组：「小数位」。 / `variable` group: the decimal places. */
    precision: string;
    /** `variable` 分组：「千分位」。 / `variable` group: thousands separators. */
    thousands: string;
    /** `variable` 分组：「最小值」。 / `variable` group: the minimum. */
    min: string;
    /** `variable` 分组：「最大值」。 / `variable` group: the maximum. */
    max: string;
    /** `variable` 分组：「货币符号」。 / `variable` group: the currency symbol. */
    currency: string;
    /**
     * `variable` 分组：「同时输出中文大写」。
     *
     * `variable` group: also print Chinese financial uppercase.
     */
    chineseUppercase: string;
    /** `variable` 分组：「「是」显示文本」。 / `variable` group: the text shown for true. */
    trueText: string;
    /** `variable` 分组：「「否」显示文本」。 / `variable` group: the text shown for false. */
    falseText: string;
    /** `variable` 分组：「日期格式」。 / `variable` group: the date format. */
    dateFormat: string;
    /**
     * `variable` 分组：「「today」按当前日期解析」。
     *
     * `variable` group: resolve the literal today against the current date.
     */
    resolveToday: string;
    /** `variable` 分组：「选项列表」。 / `variable` group: the option list. */
    options: string;
    /** `variable` 分组：「显示文本」。 / `variable` group: the option display text. */
    optionLabel: string;
    /** `variable` 分组：「实际值」。 / `variable` group: the stored option value. */
    optionValue: string;
    /** `variable` 分组：「说明」。 / `variable` group: the option description. */
    optionDescription: string;
    /** `variable` 分组：「上移」。 / `variable` group: move up. */
    moveUp: string;
    /** `variable` 分组：「下移」。 / `variable` group: move down. */
    moveDown: string;
    /** `variable` 分组：「允许多选」。 / `variable` group: allow multiple selections. */
    multiple: string;
    /**
     * `variable` 分组：「多选连接符」。
     *
     * `variable` group: the separator between multiple selections.
     */
    joinWith: string;
    /** `variable` 分组：「图片来源」。 / `variable` group: where the image comes from. */
    imageSource: string;
    /** `variable` 分组：「上传」。 / `variable` group: upload. */
    imageUpload: string;
    /** `variable` 分组：「手写签名」。 / `variable` group: draw a signature. */
    imageSignature: string;
    /** `variable` 分组：「接受的文件类型」。 / `variable` group: the accepted file types. */
    imageAccept: string;
    /** `variable` 分组：「最大体积 (MB)」。 / `variable` group: the maximum file size in MB. */
    imageMaxSize: string;
    /** `variable` 分组：「渲染宽度」。 / `variable` group: the rendered width. */
    imageWidth: string;
    /** `variable` 分组：「公式」。 / `variable` group: the formula. */
    formula: string;
    /** `variable` 分组：「表达式」。 / `variable` group: the expression. */
    formulaExpression: string;
    /** `variable` 分组：「实时预览」。 / `variable` group: a live preview. */
    formulaPreview: string;
    /** `variable` 分组：「插入变量引用」。 / `variable` group: insert a variable reference. */
    formulaReference: string;
    /** `variable` 分组：「系统值」。 / `variable` group: the system value. */
    systemKey: string;
    /**
     * `ToolVariable` 分组：按系统值名字索引的文案表。
     *
     * `variable` group: the system values, keyed by name.
     */
    systemKeys: Record<string, string>;
    /**
     * `variable` 分组：「从内置变量中选择」。
     *
     * `variable` group: pick from the built-in variables.
     */
    keyPicker: string;
    /** `variable` 分组：「变量」。 / `variable` group: the panel title. */
    title: string;
    /** `variable` 分组：「插入新变量」。 / `variable` group: the insert dialog title. */
    createTitle: string;
    /** `variable` 分组：「编辑变量」。 / `variable` group: the edit dialog title. */
    editTitle: string;
    /**
     * `variable` 分组：「请填写变量名称」。
     *
     * `variable` group: the missing variable-name error.
     */
    errorLabel: string;
    /** `variable` 分组：「请填写变量 Key」。 / `variable` group: the missing variable-key error. */
    errorKey: string;
    /**
     * `variable` 分组：「该 Key 已被其他变量使用」。
     *
     * `variable` group: the duplicate-key error.
     */
    errorDuplicateKey: string;
    /**
     * `variable` 分组：「公式无法解析，请检查表达式」。
     *
     * `variable` group: the unparsable-formula error.
     */
    errorFormula: string;
    /**
     * `variable` 分组：「请至少配置一个有效选项」。
     *
     * `variable` group: the no-valid-option error.
     */
    errorOptions: string;
  };

  /** `ToolQrcode`。 / `ToolQrcode`. */
  qrcode: {
    /** `qrcode` 分组：「二维码内容」。 / `qrcode` group: the payload the code encodes. */
    text: string;
    /** `qrcode` 分组：「尺寸」。 / `qrcode` group: the size. */
    size: string;
    /** `qrcode` 分组：「位置」。 / `qrcode` group: the position. */
    position: string;
    /** `qrcode` 分组：「上」。 / `qrcode` group: the top offset. */
    top: string;
    /** `qrcode` 分组：「左」。 / `qrcode` group: the left offset. */
    left: string;
    /** `qrcode` 分组：「边距」。 / `qrcode` group: the margin. */
    margin: string;
    /** `qrcode` 分组：「前景色」。 / `qrcode` group: the foreground colour. */
    color: string;
    /** `qrcode` 分组：「背景色」。 / `qrcode` group: the background colour. */
    background: string;
    /** `qrcode` 分组：「插入二维码」。 / `qrcode` group: insert a QR code. */
    insert: string;
    /** `qrcode` 分组：「更新二维码」。 / `qrcode` group: update the QR code. */
    update: string;
    /** `qrcode` 分组：「删除二维码」。 / `qrcode` group: remove the QR code. */
    remove: string;
    /** `qrcode` 分组：「重新生成」。 / `qrcode` group: regenerate the bitmap. */
    regenerate: string;
    /** `qrcode` 分组：「文档中已存在二维码」。 / `qrcode` group: shown when a QR code exists. */
    exists: string;
    /** `qrcode` 分组：「文档中暂无二维码」。 / `qrcode` group: shown when there is no QR code. */
    notExists: string;
    /** `qrcode` 分组：「二维码插入失败」。 / `qrcode` group: shown when insertion failed. */
    insertFailed: string;
  };

  /** `ToolWatermark`。 / `ToolWatermark`. */
  watermark: {
    /** `watermark` 分组：「启用水印」。 / `watermark` group: enable the watermark. */
    enable: string;
    /** `watermark` 分组：「水印类型」。 / `watermark` group: the watermark kind. */
    kind: string;
    /** `watermark` 分组：「文字水印」。 / `watermark` group: a text watermark. */
    text: string;
    /** `watermark` 分组：「图片水印」。 / `watermark` group: an image watermark. */
    image: string;
    /** `watermark` 分组：「旋转角度」。 / `watermark` group: the rotation angle. */
    angle: string;
    /** `watermark` 分组：「透明度」。 / `watermark` group: the opacity. */
    opacity: string;
    /** `watermark` 分组：「灰度」。 / `watermark` group: greyscale. */
    greyscale: string;
    /** `watermark` 分组：「平铺」。 / `watermark` group: tile it. */
    tiled: string;
    /** `watermark` 分组：「字号」。 / `watermark` group: the font size. */
    fontSize: string;
    /** `watermark` 分组：「颜色」。 / `watermark` group: the colour. */
    color: string;
    /** `watermark` 分组：「应用水印」。 / `watermark` group: apply the watermark. */
    apply: string;
    /** `watermark` 分组：「移除水印」。 / `watermark` group: remove the watermark. */
    remove: string;
  };

  /** `ToolPrint`。 / `ToolPrint`. */
  print: {
    /** `print` 分组：「打印」。 / `print` group: print. */
    action: string;
    /** `print` 分组：「纸张」。 / `print` group: the paper. */
    paper: string;
    /** `print` 分组：「方向」。 / `print` group: the orientation. */
    orientation: string;
    /** `print` 分组：「页边距」。 / `print` group: the margins. */
    margins: string;
    /** `print` 分组：「渲染页码」。 / `print` group: render the page number into the margin box. */
    marginBoxes: string;
    /**
     * `ToolPrint` 分组：`@page` margin box 的浏览器支持说明。
     *
     * `print` group: browser support for @page margin boxes.
     */
    marginBoxesHint: string;
    /** `print` 分组：「文档标题」。 / `print` group: the document title. */
    documentTitle: string;
    /**
     * `print` 分组：「跟随文档设置」。
     *
     * `print` group: follow the setup stored in the document.
     */
    usingDocumentSetup: string;
  };

  /** 填写对话框。 / The fill dialog. */
  fill: {
    /** `fill` 分组：「填写变量」。 / `fill` group: the fill dialog title. */
    title: string;
    /** `fill` 分组：「确定」。 / `fill` group: confirm. */
    submit: string;
    /** `fill` 分组：「文档自动提供」。 / `fill` group: shown for a value the document supplies. */
    systemValue: string;
    /**
     * `fill` 分组：「该值由文档在填写或打印时自动生成，无需手工输入」。
     *
     * `fill` group: explains that the value is generated automatically.
     */
    systemHint: string;
    /** `fill` 分组：「上传图片」。 / `fill` group: upload an image. */
    imageUpload: string;
    /** `fill` 分组：「手写签名」。 / `fill` group: draw a signature. */
    signature: string;
    /** `fill` 分组：「由公式计算」。 / `fill` group: shown for a value a formula computes. */
    formulaComputed: string;
    /**
     * `fill` 分组：「本文档没有可填写的变量」。
     *
     * `fill` group: shown when there is nothing to fill in.
     */
    noVariables: string;
    /**
     * `fill` 分组：「有 {count} 项需要修正」。
     *
     * `fill` group: how many fields need fixing, with a count placeholder.
     */
    issueCount: string;
  };

  /** 模板选择器。 / The template picker. */
  template: {
    /** `template` 分组：「模板列表」。 / `template` group: the template list title. */
    title: string;
    /**
     * `template` 分组：「请选择模板后点击「载入」」。
     *
     * `template` group: the hint telling the user to pick a template and press load.
     */
    manualHint: string;
  };

  /** 纯模板层报告的失败。 / A failure reported by the pure template layer. */
  errors: Record<TemplateErrorCode, string>;

  /** 编辑器尚未创建时显示的提示。 / The hint shown while the editor has not been created yet. */
  notReady: string;
}

/** 内置的中文字符串。 / The built-in Chinese strings. */
export const DEFAULT_EDITOR_LOCALE: EditorLocale = {
  editor: "模板文档编辑器",
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
    color: "字体颜色",
    backgroundColor: "字体背景色",
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
    indentUnit: "字符",
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
    variable: "插入变量",
    qrcode: "插入二维码",
    image: "插入图片",
    newPage: "新页面",
    pageBreak: "分页"
  },

  table: {
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
    deleteRow: "删除当前行"
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
    pageNumber: "页码",
    pageNumberPreset: "预设样式",
    pageNumberCustom: "自定义",
    pageNumberTokens: "支持 {page} 当前页、{total} 总页数；# 与 & 同样可用",
    pageNumberHidden: "不显示",
    slotLeft: "左",
    slotCenter: "中",
    slotRight: "右",
    insertPageBreak: "插入分页符",
    logo: "Logo",
    logoUpload: "选择图片",
    logoTooLarge: "图片过大，请选择 200 KB 以内的图片"
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
 * 在默认值之上合并一份局部覆盖。
 *
 * 只显式合并一层嵌套，而不是通用地深合并：嵌套分组是一个固定且已知的集合，通用深合并
 * 会静默接受写错的分组名。覆盖里点名的分组只替换它点到的那些键。
 *
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
    table: { ...DEFAULT_EDITOR_LOCALE.table, ...overrides.table },
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

/**
 * {@link ToolName} 分组的标题，对未来出现的名字有兜底。
 *
 * The label for a {@link ToolName} section, with a total fallback for a future name.
 */
export function sectionLabel(locale: EditorLocale, name: ToolName): string {
  return locale.sections[name] ?? name;
}

/**
 * 把 {@link TemplateErrorCode} 变成一句话。
 *
 * Turn a {@link TemplateErrorCode} into a sentence.
 */
export function describeTemplateError(locale: EditorLocale, code: TemplateErrorCode): string {
  return locale.errors[code] ?? code;
}
