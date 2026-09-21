/**
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

/** What the starter document's QR code encodes by default. */
export const STARTER_QR_TEXT = "https://limingchang.github.io/snail/";

/** Options for {@link createStarterDocument}. */
export interface StarterDocumentOptions {
  /**
   * Wrap the body in `page`/`pageContent`.
   *
   * Default `true`, because that is the editor's normal shape. Pass `false` for a
   * single-page editor (`multiPage: false`), whose top node holds blocks directly —
   * feeding a `page` there is the mirror of defect 37 and ProseMirror rejects it.
   */
  multiPage?: boolean;

  /** Payload for the QR code. Default {@link STARTER_QR_TEXT}. */
  qrText?: string;

  /** Replace the document's own title. */
  title?: string;
}

/** Shorthand for a text node. */
function text(value: string): JSONContent {
  return { type: "text", text: value };
}

/** A paragraph from plain text. */
function paragraph(value: string): JSONContent {
  return { type: "paragraph", content: [text(value)] };
}

/** A heading from plain text. */
function heading(level: 1 | 2 | 3, value: string): JSONContent {
  return { type: "heading", attrs: { level }, content: [text(value)] };
}

/** One table cell holding a plain paragraph. */
function cell(value: string, header = false): JSONContent {
  return {
    type: header ? "tableHeader" : "tableCell",
    content: [paragraph(value)]
  };
}

/** One row, all cells of the same kind. */
function row(values: readonly string[], header = false): JSONContent {
  return { type: "tableRow", content: values.map((value) => cell(value, header)) };
}

/**
 * Build the starter document.
 *
 * The content is deliberately a document rather than a lorem-ipsum blob: a title, a
 * clause, a real table of items, two money variables rendered both ways, a borderless
 * layout table for the signatures and a QR code. Every node type the editor offers appears
 * at least once, and the two money variables exist to show that the *same* number can be
 * printed as digits and as Chinese financial uppercase.
 */
export function createStarterDocument(options: StarterDocumentOptions = {}): JSONContent {
  const multiPage = options.multiPage ?? true;
  const title = options.title ?? "技术服务合同";

  const body: JSONContent[] = [
    heading(1, title),

    {
      type: "paragraph",
      content: [
        text("合同编号："),
        {
          type: "variable",
          attrs: {
            label: "合同编号",
            key: "contractNo",
            desc: "本合同在甲乙方系统中的编号",
            defaultValue: "SN-2026-0001",
            data: { type: "text", placeholder: "例如 SN-2026-0001" }
          }
        }
      ]
    },

    heading(2, "第一条　服务内容"),
    paragraph(
      "乙方向甲方提供下列技术服务。服务的范围、交付物与验收标准以本条约定为准，未约定的事项由双方另行协商。"
    ),

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
    {
      type: "paragraph",
      content: [
        text("本合同金额为人民币 "),
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
        text(" 元（大写："),
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
        text("）。")
      ]
    },

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
    paragraph("扫描上方二维码可核验本合同。")
  ];

  if (!multiPage) return { type: "doc", content: body };

  return {
    type: "doc",
    content: [{ type: "page", content: [{ type: "pageContent", content: body }] }]
  };
}
