# `@snail-js/editor`

<p>
  <img src="https://img.shields.io/npm/v/%40tiptap%2Fcore?label=Tiptap&color=67C23A&labelColor=1e80ff"></img>
  <img src="https://img.shields.io/npm/v/element-plus?label=ElementPlus&color=67C23A"></img>
</p>

## [官方文档 | Document](https://limingchang.github.io/snail/editor)

一个基于 Tiptap 3 + Vue 3 的模板文档编辑器：提供类 Word 的工作区，支持真实分页、页眉页脚、自动分页、变量、二维码、水印以及浏览器打印。
UI 框架为 **Element Plus**。

```bash
pnpm add @snail-js/editor element-plus vue
```

```ts
import { createApp } from "vue";

import { SnailEditor } from "@snail-js/editor";
import "@snail-js/editor/style.css";

createApp(App).use(SnailEditor).mount("#app");
```

`element-plus` 是一个 **peer** 依赖（由你自行提供，本包绝不会打包第二份副本），
编辑器只导入它实际渲染的 Element Plus 组件及其组件样式。因此上面的示例中**没有**
`app.use(ElementPlus)`，也**没有** `element-plus/dist/index.css`：上面引入的那一个样式表
同时承载了编辑器主题和它所需的 Element Plus 规则。如果你的应用已经全局注册了
Element Plus，那也没有问题——导入会解析到你已安装的那份副本。

Element Plus 自身的文案（取色器的确认/清空按钮、下拉选择器的空状态等）来自编辑器内部渲染的
`el-config-provider`，默认为中文。如需使用其他语言包，请传入 `element-locale`。

`SnailEditor` 会全局注册 `SEditor` 组件。你也可以直接按需导入该组件：

```ts
import { SEditor } from "@snail-js/editor";
```

样式表在*包*级别是可选引入的，但编辑器要呈现出编辑器的外观则必须引入它：其中包含调色板、
纸张和变量徽章的样式。它的作用域限定在 `.s-editor-scope`（组件会将其挂在自己的根元素上），
因此引入它**不会**影响 Element Plus 应用中其他部分的样式。

---

## 两种模式

|  | `design`（设计） | `fill`（填写） |
| --- | --- | --- |
| 用途 | 编写模板 | 填写模板并打印 |
| 文档 | 可编辑 | 只读 |
| 工具栏 | 显示 | 隐藏 |
| 变量 | 显示为标签徽章 | 显示为变量值 |
| 操作 | 保存 | 填写 + 打印 |

### 设计模式（Design mode）

```vue
<script setup lang="ts">
import { ref } from "vue";
import { SEditor } from "@snail-js/editor";
import type { SEditorExposed } from "@snail-js/editor";

const editor = ref<SEditorExposed>();

function save() {
  const template = editor.value?.getTemplate();
  // `template` 是一个 TemplateDocument：{ version, doc, variables, page, watermark }。
  console.log(JSON.stringify(template));
}
</script>

<template>
  <SEditor
    ref="editor"
    mode="design"
    :tools="['font', 'paragraph', 'insert', 'table', 'page', 'variable', 'qrcode', 'watermark']"
    :save="{ kind: 'local', storageKey: 'my-contract' }"
    @save="save"
  />
</template>
```

### 填写模式（Fill mode）

```vue
<template>
  <!--
    `data` 是填写数据，以变量 key 为键。在填写模式下，文档渲染的是变量值而非标签，
    工具栏不显示，点击「填写」会打开填写对话框。
  -->
  <SEditor
    mode="fill"
    :data="{ 'party.name': '张三', amount: 128000, signed: true }"
    :print="{ marginBoxes: true, documentTitle: '劳动合同' }"
    @ready="(editor) => editor.chain().focus().printDocument().run()"
  />
</template>
```

填写数据也可以通过暴露出来的实例方法以编程方式提供：

```ts
editor.value?.openFillDialog();
editor.value?.fill({ "party.name": "李四" });
editor.value?.print();
```

---

## 模板（Templates）

### 内容从哪里来 —— `template`

```ts
// 1. 内联（Inline）。最简单的方式。
{ kind: "local", content: templateDocument }

// 2. 单个模板，在 ready 时请求一次。请求失败时会在文档上方弹出提示，
//    编辑器仍保持可用。
{ kind: "remote", url: "/api/templates/7", headers: { Authorization: "…" } }

// 3. 模板列表。`load` 决定 ready 时的行为：
//    "auto"   —— 先获取列表，然后获取并渲染列表中的第一项。
//    "manual" —— （默认）获取列表，不渲染任何内容，并在列表后显示「载入」按钮。
//                这是填写模式想要的行为：由操作者自行选择模板。
{
  kind: "remote-list",
  url: "/api/templates",
  contentUrl: (item) => `/api/templates/${item.id}/content`, // 默认为 `${url}/${id}`
  load: "manual"
}
```

列表响应可以是一个裸数组、`{ data: [...] }` 包裹结构，或者由 `{ id, name, doc }` 组成的
数组——如果列表项自带文档内容，则无需发起第二次请求。
缺少 `id` 的列表项会被跳过，而不会导致整个列表为空。

### 内容保存到哪里 —— `save`

```ts
{ kind: "local", storageKey: "my-contract", session: false }   // localStorage / sessionStorage
{ kind: "remote", url: "/api/templates", method: "POST" }      // 以 JSON 形式保存 TemplateDocument
{ kind: "remote", url: "/api/templates", structured: false }   // 改为保存 HTML 字符串
```

无论配置了哪种保存目标，**每次**保存都会调用 `onSave({ template, design })`。
如果你想通过自己的 API 来持久化，可以只传 `onSave` 而不传任何 `save` 目标。

### 存储的内容是什么

`getTemplate()` 返回一个 `TemplateDocument`：

```ts
{
  version: 1,
  doc: { /* ProseMirror JSON */ },
  variables: [{ key, label, type, required }],
  page: { paperFormat, orientation, margins, pageCount },
  watermark: { enabled, text, angle, … }
}
```

`version` 字段保证了一个版本写入的模板能被下一个版本正确读取；易变的簿记属性
（`_updateTimestamp` 以及其他任何下划线开头的属性）会被剔除，因此对同一份未修改的文档
保存两次，得到的 JSON 在字节级别完全一致。

---

## 扩展的选择性启用规则

**导入并配置某个扩展，才会使对应的工具栏分区出现。** 一个分区只有在调用方在 `tools`
中点名了它，**并且**该扩展已在 schema 中注册时才会渲染：

```ts
// 没有 `qrcode` 选项且设置了 `disable: ["qrcode"]` ⇒ 没有 `qrcode` 节点类型、
// 没有对应命令，也没有「二维码」分区——即使在 `tools` 中点名了它也一样。
<SEditor :tools="['font', 'qrcode']" :extensions="{ disable: ['qrcode'] }" />
```

工具栏的显示门控依据的是已注册的扩展集合（`editor.extensionManager.extensions`），
而不仅仅是 `tools` 字符串列表——旧版工具栏只检查该列表，导致某个分区可能在背后
什么都没有的情况下渲染出来，其中的每个命令都解析为 `false`。

| 分区 | 需要的扩展 |
| --- | --- |
| 格式 `font` | `textStyle` |
| 段落 `paragraph` | `paragraphStyle` |
| 插入 `insert` | `variable`、`qrcode`、`page` 或 `image`（任意一个） |
| 表格 `table` | `table` |
| 页面 `page` | `page` |
| 变量 `variable` | `variable` |
| 二维码 `qrcode` | `qrcode` |
| 水印 `watermark` | `watermark` |
| 打印 `print` | `print` |

`multiPage: false` 只会移除页面**节点**，而绝不会移除文档本身：此时顶层节点变为标准的
`block+` 型 `Document`，而不是 `page+` 型，因此不会出现 ProseMirror 的
`Schema is missing its top node type (doc)` 错误。

---

## 发布主题更新

每一个颜色、尺寸和字体族都是 `.s-editor-scope` 上的 CSS 自定义属性，因此应用可以在
不重新构建的情况下为某个编辑器实例单独换肤：

```css
.my-contract-editor.s-editor-scope {
  --se-color-primary: #1677ff;
  --se-color-print: #f53f3f;
  --se-variable-money: #0f9b8e;
  --se-font-size-body: 14pt;
}
```

`--se-*` 是本包自己的变量；同一作用域内的 `--el-*` 是它覆写的 Element Plus 令牌，
目的是让 Element Plus 自身的控件与旧版设计保持一致。

---

## 与 0.1.x 的差异

**UI 框架。** `ant-design-vue` 已被 **Element Plus** 取代。通过上述限定作用域的
`--se-*`/`--el-*` 样式层，配色尽可能贴近旧版设计：Ant Design 的 `#1677ff` 仍然是工具栏
的蓝色，但 Element Plus 自带的 `#409eff` 不再是第二个「意外的主色」。

**移除的类型。** 变量类型 `object`、`list` 和 `checkbox` 已被移除。`object` 没有子字段
编辑器，会渲染成 `[object Object]`；`list` 只是用逗号把数组字符串化，没有重复项语义；
`checkbox` 不过是伪装成多选的单个布尔值。旧版的 `innerVariable` 保留了下来，但改为一种
*输入方式*（`keySource: "inner"`，即在调用方的数据树上进行选择），而不再是一种类型。

**新增的类型。** `select`、`image`/签名、`formula` 和 `system`（页码/总页数/日期）
加入了原有的 `text`、`number`、`money`、`boolean` 和 `date`。每个类型都在同一个
可辨识联合（discriminated union）中携带自己的配置，因此类型与其载荷不会再出现不一致——
旧版包将 `type` 和 `data` 作为平级字段存储，没有任何机制保证二者同步。

**重命名的属性和命令。**

| 0.1.x | 1.0 |
| --- | --- |
| `design?: boolean` | `mode: "design" \| "fill"`（仍接受 `design`，已废弃） |
| `mutilPage`（原文如此） | `multiPage` |
| `browserPrint()` | `printDocument()`（及别名 `print()`） |
| `editor.storage.qrcode.hasQRCode` | `editor.commands.hasQRCode()` |
| 页眉/页脚的 `textFormat` | 带有 `format` 属性的真正的 `pageNumber` 节点 |

**值得了解的行为修复。**

- 模式、文档和扩展集合现在是**响应式监听**的，而不是在创建时固化。
- 支持撤销/重做。分页事务被标记为 `addToHistory: false`，因此撤销操作永远不会重放分页过程。
- 选择「正文」会生成普通段落，而不是 `<h0>`。
- 页码格式为自由格式（`{page}`/`{total}`，同时兼容旧模板的 `#`/`&` 写法），不再局限于
  三种硬编码的预设。
- 页边距按模型自身的单位编辑；旧版面板在毫米模型上按厘米编辑，导致 20 mm 的页面显示为
  2.54 cm。
- 远程模板加载失败时会在文档上方显示错误，编辑器仍保持可用，而不是渲染出一片空白。
- 第二个编辑器实例或重新挂载都能正常工作。旧版的扩展工厂会向模块级数组中追加内容，导致
  第二个实例报错 `Duplicate extension names found`。

---

## 开发（Development）

```bash
pnpm build       # 打包 + 输出 dist/style.css
pnpm typecheck   # vue-tsc --noEmit
pnpm test        # vitest，Node 环境
```

编辑器自身可测试的核心是纯模板层（`src/editor/template.ts`）以及扩展内部的分页引擎和
变量解析器。这里刻意不使用 jsdom：分页依赖真实的布局，用 jsdom 做测试只会断言一个虚构的
结果。



### 代码仓库
- ![Static Badge](https://img.shields.io/badge/snail-js?style=flat&label=gitee&labelColor=F56C6C&link=https%3A%2F%2Fgitee.com%2Flimich%2Fsnail)
- ![Static Badge](https://img.shields.io/badge/snail-js?style=flat&label=github&labelColor=F56C6C&link=https%3A%2F%2Fgihub.com%2Flimingchang%2Fsnail)

### 作者
- mc.lee
