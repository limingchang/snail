# 组件接口

`SEditor` 的 props 与 `typings/editor.ts` 里的 `SEditorProps` 一一对应：

| prop | 类型 | 默认 |
| --- | --- | --- |
| `modelValue` | `TemplateContent` | — |
| `mode` | `"design" \| "fill"` | `"design"` |
| `design` | `boolean` | 已废弃，`mode` 优先 |
| `doc` | `TemplateContent` | — |
| `data` | `VariableFillData` | `{}` |
| `tools` | `readonly ToolName[]` | `["font", "paragraph", "insert", "table", "page"]` |
| `multiPage` | `boolean` | `true` |
| `template` | `TemplateSource` | — |
| `save` | `TemplateSaveTarget` | — |
| `page` / `variable` / `watermark` / `print` / `qrcode` | 各扩展选项 | — |
| `extensions` | `SEditorExtensionOptions` | — |
| `locale` | `Partial<EditorLocale>` | 内置中文 |
| `onSave` / `onChange` | 回调 | — |

事件：`update:modelValue`、`change`（带 `template` 与 `html`）、`save`（`SaveResult`）、
`ready`（Tiptap 的 `Editor`）、`update:mode`。

`ref` 上暴露（`SEditorExposed`）：`editor`、`getJSON()`、`getHTML()`、`getTemplate()`、
`setTemplate(content)`、`fill(values)`、`openFillDialog()`、`print()`、`save()`、
`loadTemplateList()`、`selectTemplate(id)`、`focus()`。

`ToolName` 的十个成员是 `font`、`paragraph`、`insert`、`table`、`qrcode`、`variable`、
`page`、`watermark`、`print`、`template`，其中九个是页签（见[工具栏分组](#工具栏分组)），
`template` 例外 —— 模板列表是工作区里的选择器，不是要展开工具栏才能用的东西。

全部面向用户的文案都走 `locale`，默认中文：分组名、按钮、变量对话框、填写对话框、
页码提示都在内。`locale` 是浅合并的局部覆盖，只改你关心的那几个键。

## 已知的清晰边界

- 水印只影响视图与打印，不进文档 JSON。
- 一页一个纸张尺寸做不到：`@page` 全篇一条，第一页的尺寸胜出并给一条 warning。
- `@page` margin box（浏览器自画的页码）只有 Chromium 131+ 渲染；文档自己的
  `pageNumber` 节点不受影响。
- 打印依赖浏览器自己的打印对话框，无法在没有窗口的环境里工作（SSR / 测试里命令返回 `false`）。
- 变量的 `image` 类型把图片以 `data:` URL 存在节点属性里，所以大图会直接放大模板体积
  （`maxSizeMb` 默认 2 MB 就是为此设的上限）。
