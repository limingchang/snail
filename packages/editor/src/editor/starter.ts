/**
 * 编辑器的起始文档。
 *
 * ## 这个包为什么要自带一份
 *
 * 一个空的分页编辑器就是一张白纸 —— 正确，但作为第一印象毫无用处。每个想把编辑器给
 * 别人看的调用方都得手写同样的二十来行 ProseMirror JSON，而要写对那份 JSON 并不显然：
 * `page+` 文档至少需要一个 `page`，每个 page 需要 `pageContent`，表格需要
 * `tableRow` → `tableHeader`/`tableCell` → `paragraph`，布局表则需要在表格**以及**每一行
 * 上都有 `layoutMode` 属性。
 *
 * {@link createStarterDocument} 返回一份用到了编辑器所围绕的每一种节点类型的文档，因此
 * `new Editor({ content: createStarterDocument() })` 显示的是真实的一页，而不是空白页。
 *
 * ## 二维码还没有位图
 *
 * `qrcode` 节点同时存放它的载荷（`text`）和生成出来的图片（`src`），而生成图片是异步的。
 * **同步**工厂无法等待它，二维码扩展也刻意不自行生成位图（那会在每次加载、每一份文档上
 * 造成意外的异步工作）。因此起始文档只带上载荷，需要位图的宿主在编辑器就绪后调用一次
 * `regenerateQRCode()`（下面英文段落中的示例即是如此）。
 *
 * 在那之前，节点视图绘制它的「空」占位符；这是诚实，而不是坏掉。
 *
 * A starter document for the editor.
 *
 * ## Why the package ships one
 *
 * An empty paginated editor is a blank sheet of paper — correct, and useless as a first
 * impression. Every consumer that wanted to show the editor to somebody had to write the
 * same twenty lines of ProseMirror JSON by hand, and getting that JSON right is *not*
 * obvious: a `page+` document needs at least one `page`, each page needs a `pageContent`,
 * a table needs `tableRow` → `tableHeader`/`tableCell` → `paragraph`, and a layout table
 * needs the `layoutMode` attribute on the table *and* on every row.
 *
 * {@link createStarterDocument} returns a document that exercises every node type the
 * editor is built around, so `new Editor({ content: createStarterDocument() })` shows a
 * real page rather than an empty one.
 *
 * ## The QR code has no raster yet
 *
 * The `qrcode` node stores both its payload (`text`) and its generated image (`src`), and
 * generating the image is asynchronous. A *sync* factory cannot await it, and the QR
 * extension deliberately does not generate rasters on its own (that would be surprise async
 * work at load, on every document, forever). So the starter document carries the payload
 * and a host that wants the bitmap calls once, after the editor is ready:
 *
 * ```ts
 * const editor = new Editor({ content: createStarterDocument() });
 * editor.on("create", () => editor.commands.regenerateQRCode());
 * ```
 *
 * Until then the node view paints its "empty" placeholder, which is honest rather than
 * broken.
 */

import type { JSONContent } from "@tiptap/core";

/** 起始文档的二维码默认编码的内容。 / What the starter document's QR code encodes by default. */
export const STARTER_QR_TEXT = "https://limingchang.github.io/snail/";

/** {@link createStarterDocument} 的选项。 / Options for {@link createStarterDocument}. */
export interface StarterDocumentOptions {
  /**
   * 把正文包进 `page`/`pageContent`。
   *
   * 默认 `true`，因为那是编辑器的常规形态。单页编辑器（`multiPage: false`）传 `false`，
   * 它的顶层节点直接承载块级内容 —— 在那里喂一个 `page` 就是缺陷 37 的镜像，ProseMirror
   * 会拒绝它。
   *
   * Wrap the body in `page`/`pageContent`.
   *
   * Default `true`, because that is the editor's normal shape. Pass `false` for a
   * single-page editor (`multiPage: false`), whose top node holds blocks directly —
   * feeding a `page` there is the mirror of defect 37 and ProseMirror rejects it.
   */
  multiPage?: boolean;

  /**
   * 二维码的载荷。默认 {@link STARTER_QR_TEXT}。
   *
   * Payload for the QR code. Default {@link STARTER_QR_TEXT}.
   */
  qrText?: string;

  /** 替换文档自身的标题。 / Replace the document's own title. */
  title?: string;
}

/**
 * Tiptap JSON 形态里的一个 mark。
 *
 * 起了名字而不是内联书写，因为 `JSONContent["marks"]` 比 `JSONContent` *更窄*：mark 的
 * `type` 是必需的，而节点的不是。
 *
 * A mark in Tiptap's JSON shape.
 *
 * Named rather than written inline because `JSONContent["marks"]` is *narrower* than
 * `JSONContent`: a mark's `type` is required, a node's is not.
 */
type MarkJSON = NonNullable<JSONContent["marks"]>[number];

/** 文本节点的简写，可选地带 marks。 / Shorthand for a text node, optionally with marks. */
function text(value: string, marks?: MarkJSON[]): JSONContent {
  return marks ? { type: "text", text: value, marks } : { type: "text", text: value };
}

/**
 * `bold` mark，旧版的默认标题都带着它。
 *
 * The `bold` mark, which the legacy default headings carried.
 */
function bold(): MarkJSON {
  return { type: "bold" };
}

/**
 * 一个 `textStyle` mark。
 *
 * `fontSize`、`fontFamily` 与 `lineHeight` 是*同一个* mark 的三个属性 —— `TextStyleKit`
 * 把它们都加到 `textStyle` 上 —— 所以一个辅助函数就能描述一段文字的全部排版，而不是三个
 * mark 争抢它。
 *
 * A `textStyle` mark.
 *
 * `fontSize`, `fontFamily` and `lineHeight` are three attributes of the *same* mark —
 * `TextStyleKit` adds all of them to `textStyle` — so one helper describes a run's whole
 * typography instead of three marks competing for it.
 */
function style(attrs: Record<string, string>): MarkJSON {
  return { type: "textStyle", attrs };
}

/**
 * 三种排版角色，取自旧版模板，好让新文档看起来像旧文档：黑色字体的 18pt 加粗标题、
 * 楷体的 15pt 加粗标题，以及宋体的 14pt/28pt 正文。
 *
 * The three typographic roles, taken from the legacy template so a new document looks like
 * an old one: an 18pt bold heading in a black face, a 15pt bold heading in a Kai face, and
 * 14pt/28pt body text in a Song face.
 */
const H1_STYLE = { fontSize: "18pt", lineHeight: "2", fontFamily: "SimHei, sans-serif" };
const H2_STYLE = { fontSize: "15pt", lineHeight: "1.5", fontFamily: "KaiTi, serif" };
const BODY_STYLE = { fontSize: "14pt", lineHeight: "28pt", fontFamily: "SimSun, serif" };

/**
 * 一个已经应用好对齐方式与排版的标题：一级居中（它是文档标题），二级左对齐（它是条款序号）。
 *
 * `textIndent: "0"` 是故意写上的，而不是留成 `null`：标题不能继承首行缩进，显式的零把
 * 这一点写进文档，而不是依赖样式表。
 *
 * A heading with its alignment and typography already applied: level 1 is centred (it is the
 * document's title), level 2 is flush left (it is a clause number).
 *
 * `textIndent: "0"` is written on purpose rather than left `null`: a heading must not inherit
 * a first-line indent, and an explicit zero says so in the document instead of relying on
 * the stylesheet.
 */
function heading(level: 1 | 2, value: string): JSONContent {
  return {
    type: "heading",
    attrs: { level, textAlign: level === 1 ? "center" : "left", textIndent: "0" },
    content: [text(value, [bold(), style(level === 1 ? H1_STYLE : H2_STYLE)])]
  };
}

/** 一段带样式的正文。 / One styled body run. */
function run(value: string): JSONContent {
  return text(value, [style(BODY_STYLE)]);
}

/**
 * 两端对齐的正文段落，首行缩进两个字符。
 *
 * A justified body paragraph whose first line is indented by two characters.
 */
function paragraph(content: JSONContent[] | string): JSONContent {
  return {
    type: "paragraph",
    attrs: { textAlign: "justify", textIndent: "2em" },
    content: typeof content === "string" ? [run(content)] : content
  };
}

/**
 * 居中、不缩进的段落 —— 二维码下方的说明文字。
 *
 * A centred, unindented paragraph — the caption under the QR code.
 */
function caption(value: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { textAlign: "center", textIndent: "0" },
    content: [text(value, [style(BODY_STYLE)])]
  };
}

/**
 * 一个只装普通段落的表格单元格（表格不是正文，所以不缩进）。
 *
 * One table cell holding a plain paragraph (a table is not prose, so it is not indented).
 */
function cell(value: string, header = false): JSONContent {
  return {
    type: header ? "tableHeader" : "tableCell",
    content: [{ type: "paragraph", content: [run(value)] }]
  };
}

/** 一行，所有单元格同一种类型。 / One row, all cells of the same kind. */
function row(values: readonly string[], header = false): JSONContent {
  return { type: "tableRow", content: values.map((value) => cell(value, header)) };
}

/**
 * 构建起始文档。
 *
 * 内容刻意是一份文档，而不是一段 lorem-ipsum 填充，并且遵循中文合同实际具有的形态：
 * 一个**居中**的一级标题、一个左对齐的二级条款号、一个首行**缩进两个字符**且含有变量的
 * 条款、一张真实的明细表格、两个分别以小写与大写打印的金额变量、一张用于签名的无边框
 * 布局表，以及一个二维码。编辑器提供的每种节点类型都至少出现一次，那两个金额变量是为了
 * 展示*同一个*数字既能以数字、也能以中文财务大写打印。
 *
 * 对齐与缩进是文档属性（`textAlign`、`textIndent`），不是样式建议：段落面板读回的就是
 * 它们，打印看到的也是它们，所以一份省略了它们的起始文档会让用户看到一个控件全都显示
 * 「未设置」的工具栏。
 *
 * Build the starter document.
 *
 * The content is deliberately a document rather than a lorem-ipsum blob, and it follows the
 * shape a Chinese contract actually has: a **centred** level-1 title, a flush-left level-2
 * clause number, a clause whose first line is **indented by two characters** and which
 * contains a variable, a real table of items, two money variables printed both ways, a
 * borderless layout table for the signatures and a QR code. Every node type the editor
 * offers appears at least once, and the two money variables exist to show that the *same*
 * number can be printed as digits and as Chinese financial uppercase.
 *
 * Alignment and indent are document attributes (`textAlign` / `textIndent`), not styling
 * advice: they are what the paragraph panel reads back and what a print sees, so a starter
 * document that omitted them would show a user a toolbar whose controls all read "not set".
 */
export function createStarterDocument(options: StarterDocumentOptions = {}): JSONContent {
  const multiPage = options.multiPage ?? true;
  const title = options.title ?? "技术服务合同";

  const body: JSONContent[] = [
    heading(1, title),

    heading(2, "第一条　服务内容"),

    // A first-line indent of two characters (2em is exactly two Han characters) around a
    // variable: the shape every clause in a Chinese contract has.
    paragraph([
      run("合同编号："),
      {
        type: "variable",
        attrs: {
          label: "合同编号",
          key: "contractNo",
          desc: "本合同在甲乙方系统中的编号",
          defaultValue: "SN-2026-0001",
          data: { type: "text", placeholder: "例如 SN-2026-0001" }
        }
      },
      run("。乙方向甲方提供下列技术服务，服务的范围、交付物与验收标准以本条约定为准，未约定的事项由双方另行协商。")
    ]),

    {
      type: "table",
      content: [
        row(["序号", "服务项目", "数量", "金额（元）"], true),
        row(["1", "系统设计与开发", "1 项", "80,000.00"]),
        row(["2", "上线支持与培训", "1 项", "20,000.00"]),
        row(["3", "一年期运维", "12 月", "36,000.00"])
      ]
    },

    heading(2, "第二条　合同金额"),
    paragraph([
      run("本合同金额为人民币 "),
      {
        type: "variable",
        attrs: {
          label: "合同金额（小写）",
          key: "amount",
          desc: "含税总价",
          defaultValue: 136000,
          data: { type: "money", precision: 2, currency: "￥", thousands: true }
        }
      },
      run(" 元（大写："),
      {
        type: "variable",
        attrs: {
          label: "合同金额（大写）",
          key: "amountInWords",
          desc: "与小写金额一致，用于防止篡改",
          defaultValue: 136000,
          data: { type: "money", chineseUppercase: true }
        }
      },
      run("）。")
    ]),

    // A borderless two-column table: the layout table exists for positioning, so its cells
    // start empty of decorative content and it carries `layoutMode` on the table and on
    // every row — that is what the layout-mode extension reads to drop the borders.
    {
      type: "table",
      attrs: { layoutMode: true },
      content: [
        {
          type: "tableRow",
          attrs: { layoutMode: true },
          content: [cell("甲方（盖章）："), cell("乙方（盖章）：")]
        },
        {
          type: "tableRow",
          attrs: { layoutMode: true },
          content: [cell("日期："), cell("日期：")]
        }
      ]
    },

    {
      type: "qrcode",
      attrs: { text: options.qrText ?? STARTER_QR_TEXT }
    },
    caption("扫描上方二维码可核验本合同。")
  ];

  if (!multiPage) return { type: "doc", content: body };

  return {
    type: "doc",
    content: [{ type: "page", content: [{ type: "pageContent", content: body }] }]
  };
}
