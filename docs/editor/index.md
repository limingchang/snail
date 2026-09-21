# 模板文档编辑器 `@snail-js/editor`

基于 [Tiptap 3](https://tiptap.dev/) 的**模板文档编辑器**。它不是一个通用的富文本输入框，
而是一台「排版机 + 模板引擎」：文档里是真的 `page` 节点，有页眉、页脚、Logo、自动分页、
变量、二维码、水印和浏览器打印。

```ts
import { SEditor } from "@snail-js/editor";
```

## 它和普通富文本编辑器差在哪

两点，都是设计上的取舍，不是「可以再补的功能」：

**一、文档是真的分页了。** 页是一等节点：`doc > page > pageContent`，
`page` 上带着纸张、方向和页边距。自动分页会真的把内容**切到下一页**（切开的是真实的
ProseMirror 节点切片，不是视觉遮罩），页眉、页脚、Logo 是 `page` 的子节点，因此换页时
会被原样复制过去。所谓「一页」在 JSON 里就是一页。

**二、填写模板不修改文档。** 变量是内联原子节点，填写模式只是把**值渲染**在节点的位置上，
文档 JSON 在两种模式下永远是同一份模板。带来的直接结果是：切回设计模式是免费的（没有任何
东西被销毁过），改段落字号变量会跟着变（值继承段落），而模板可以随时重新填写。

## 安装

```bash
pnpm add @snail-js/editor
pnpm add element-plus vue
```

`element-plus`（`>=2.9.0`）和 `vue`（`>=3.5.0`）是 peer 依赖：由使用方提供，本包不重复安装
一份，避免同一页面出现两个 Element Plus 实例。样式必须单独引入：

```ts
import "@snail-js/editor/style.css";
```

```ts
// main.ts
import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "@snail-js/editor/style.css";
import App from "./App.vue";

createApp(App).use(ElementPlus).mount("#app");
```

## 快速上手

`mode` 默认是 `design`，页面 / 变量 / 二维码 / 水印 / 打印扩展默认注册，工具栏默认给出
`["font", "paragraph", "insert", "table", "page"]` 五组。

内容用 `createStarterDocument()` 装一份真实文档，第一次打开就能看到主标题、二级标题、正文、
金额变量（小写与中文大写各一次）、普通表格、无边框布局表和二维码 —— 空文档也能用，只是这些
能力都得自己先写一遍 ProseMirror JSON 才看得见。注意二维码节点只存内容，位图既不随文档保存、
也不自动生成，需要在编辑器就绪后调一次 `regenerateQRCode()`。

<script setup>
import BasicEditor from "./examples/basic-editor.vue";
import basicEditorSource from "./examples/basic-editor.vue?raw";
import ModeSwitch from "./examples/mode-switch.vue";
import modeSwitchSource from "./examples/mode-switch.vue?raw";
import FillDialog from "./examples/fill-dialog.vue";
import fillDialogSource from "./examples/fill-dialog.vue?raw";
import VariableTypes from "./examples/variable-types.vue";
import variableTypesSource from "./examples/variable-types.vue?raw";
</script>

<DemoBlock title="最小可用示例" description="v-model 绑定的内容可以是 JSON 文档、HTML 字符串，或一整份 TemplateDocument。" :code="basicEditorSource">
  <BasicEditor />
</DemoBlock>

### 填写模式

填写模式的文档是只读的，工具栏默认不渲染，变量按值显示。填写数据通过 `data` 传入，
按变量的 `key` 查表（`company.name` 这样的点号路径同样有效）。

<DemoBlock title="填写模式" description="点「打开填写对话框」可以看到按变量类型生成的表单。" :code="fillDialogSource">
  <FillDialog />
</DemoBlock>

## 两种模式

同一个组件的两种用法，模式决定了几乎其他一切：

| | `design` 设计 | `fill` 填写 |
| --- | --- | --- |
| 用途 | 编写模板 | 填好并打印 |
| 文档 | 可编辑 | 只读 |
| 工具栏 | 按 `tools` 渲染 | 默认不渲染 |
| 变量 | 显示为带标签的徽标，点击可编辑 | 显示为解析后的值 |
| 持久化 | 保存模板 | 不保存任何东西 |
| 模板列表 | 按源的 `load` 策略 | 默认等操作员手动载入 |
| 页面设置 | 可改纸张 / 方向 / 页边距 | 只读 |

`mode` 是**响应式的**。当前实现会 `watch` 模式并就地 `setEditable()`、通知变量的渲染层重画，
文档和选区都不受影响，所以设计 ↔ 填写可以随时来回切，切回去时不需要重新载入模板。

<DemoBlock title="模式切换" description="同一个 SEditor 实例、同一份文档、同一个选区。" :code="modeSwitchSource">
  <ModeSwitch />
</DemoBlock>

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { EditorMode } from "@snail-js/editor";

const mode = ref<EditorMode>("design");
</script>

<template>
  <!-- 或者 v-model:mode，组件会 emit update:mode -->
  <SEditor v-model="doc" :mode="mode" :data="values" @update:mode="mode = $event" />
</template>
```

`design?: boolean` 是 `mode` 的旧写法，仍然接受，但两者同时给出时 `mode` 优先。

## 模板的来源与保存

### 来源：`TemplateSource`

| `kind` | 字段 | 行为 |
| --- | --- | --- |
| `local` | `content?` | 直接把文档交给编辑器，最简单的一种 |
| `remote` | `url`、`headers?` | 启动时用 `GET` 拉一次该 URL，响应可以是 JSON 文档、JSON 字符串或 HTML |
| `remote-list` | `url`、`headers?`、`contentUrl?`、`load?` | 拉一个模板列表，选中后再拉某一个条目的内容 |

`load` 只有两个取值，这是明确的产品规则：

- **`"auto"`**：编辑器就绪后立刻请求列表，并渲染列表里的**第一条**。适合「只有一个模板，
  打开就是这个」的场景。
- **`"manual"`（默认）**：什么都不请求。列表渲染出来之后在下面出现一个「载入」按钮，
  由人挑一条再放进来。这也是填写模式想要的：打印员自己选模板，页面不能在背后替他选。

```ts
const template = {
  kind: "remote-list",
  url: "/api/contract-templates",
  contentUrl: (item) => `/api/contract-templates/${item.id}/content`,
  load: "manual"
} as const;
```

列表响应可以是裸数组，也可以是 `{ data: [...] }`；每个条目需要 `id` 和 `name`
（`description`、`updatedAt` 可选，`updatedAt` 原样显示不做本地化）。条目里直接带
`doc` / `content` / `template` 时，选中它不会再发一次请求。一条读不出来的条目会被跳过，
而不是让整个列表变空。

### 保存：`TemplateSaveTarget`

| `kind` | 字段 | 写入位置 |
| --- | --- | --- |
| `local` | `storageKey?`、`session?` | `session: true` 写 `sessionStorage`，否则写 `localStorage`；默认键是 `snail-editor-template` |
| `remote` | `url`、`method?`、`headers?`、`structured?` | `POST`（默认）或 `PUT` 到 `url` |

`structured` 决定请求体是什么，这一条必须说清楚：

- **`structured: true`（默认）**：请求体是整份 `TemplateDocument` 的 JSON，
  `Content-Type: application/json`。
- **`structured: false`**：请求体是序列化后的 **HTML 字符串**，`Content-Type: text/html`。
  给只存 markup 的后端用。

两种情况的响应都不会被解析，只有 `status` 会进 `SaveResult`；非 2xx 会在 `SaveResult.error`
上带一个码，同时 `save()` 会把它重新抛出。

```ts
const save = { kind: "remote", url: "/api/contract-templates", method: "PUT" } as const;
```

`onSave` 无论有没有配置保存目标都会被调用，所以「用自己的后端存」只需要给 `onSave`。

### 存下来的东西：`TemplateDocument`

```ts
interface TemplateDocument {
  version: number;              // 写入时的 TEMPLATE_VERSION，当前是 1
  doc: JSONContent;             // ProseMirror 文档本身
  variables?: TemplateVariableSummary[];
  page?: TemplatePageSetup;
  watermark?: TemplateWatermark;
  meta?: Record<string, unknown>;
}
```

刻意**不只是** `doc`：

- `variables` 是模板声明的变量清单（`key` / `label` / `type` / `required`）。
  一个只想校验模板、预览、或列出模板的后端，不应该为了知道「这份模板要填什么」
  去遍历一棵 ProseMirror 树。
- `page` 是纸张、方向、页边距和页数，`watermark` 是水印设置。有了它们，
  渲染方不需要编辑器就能把这张纸画出来 —— 因为水印不在 `doc` 里（见[水印](#水印)）。
- `version` 让未来的版本有东西可以迁移。写入时会剥掉所有下划线开头的易变属性
  （历史遗留的 `_updateTimestamp` 就是这样一个属性），否则同一份模板每次序列化都会不同，
  「文档变了吗」这个问题就永远答不上来。

模板内容也可能是 HTML 字符串或一整份 `TemplateDocument`，`parseTemplateInput` 三种都收。

## 变量

变量是文档里的**内联原子节点**（`inline`、`atom`、不可拖动）。它的类型和配置是同一个字段
`data`，而 `data.type` 就是判别式 —— 不存在「类型和配置对不上」的第二种可能：

```ts
import type { VariableAttrs } from "@snail-js/editor";

const attrs: VariableAttrs = {
  label: "甲方名称",
  key: "company.name",
  desc: "营业执照上的全称",
  defaultValue: "",
  data: { type: "text", placeholder: "请输入甲方全称", maxLength: 60 },
  keySource: "manual"
};
```

### 九种类型

<DemoBlock title="变量类型" description="表格由 VARIABLE_TYPES 生成，所以不会和源码里的类型集合脱节。" :code="variableTypesSource">
  <VariableTypes />
</DemoBlock>

各类型的关键字段：

| 类型 | 关键字段 | 说明 |
| --- | --- | --- |
| `text` | `placeholder`、`maxLength` | `maxLength` 是软上限，只影响对话框的计数与渲染时的省略 |
| `number` | `precision`、`thousands`、`min`、`max` | `precision` 缺省时「按原样」渲染：填 `3.50` 就不会变成 `3.5` |
| `money` | `precision`（默认 2）、`currency`、`thousands`（默认 `true`）、`chineseUppercase` | 见下文中文大写 |
| `boolean` | `trueText`（默认「是」）、`falseText`（默认「否」） | 把 `true` / `false` 写成词 |
| `date` | `format`（默认 `YYYY年MM月DD日`）、`resolveToday` | 字面值 `"today"` 在 `resolveToday` 为真时解析为当天 |
| `select` | `options`、`multiple`、`joinWith`（默认「、」） | `options` 为空时对话框退化为自由输入 |
| `image` | `source`（`upload` / `signature`）、`accept`、`maxSizeMb`（默认 2）、`width` | 签名板画出来的也是一张图 |
| `formula` | `expression`、`precision`、`prefix`、`suffix` | 由其他变量算出来的值 |
| `system` | `systemKey`、`format` | 由文档自己提供的值 |

### 解析出来的两种类型

`formula` 和 `system` 用户填不了，它们的值由文档算出来：

**`formula`** 的表达式只允许数字、`+ - * / ( )`、逗号、变量 key，以及固定表里的函数：

```text
SUM(item1.price, item2.price) * 1.06
```

函数是 `SUM`、`AVG`、`MIN`、`MAX`、`ROUND`、`IF`、`ABS`（即 `FORMULA_FUNCTIONS`）。
不使用 `eval` / `new Function`：表达式来自存下来的模板数据，如果按 JavaScript 求值，
打开一份模板就等于运行它。公式可以引用另一个公式（`total = SUM(sub1, sub2)`），
环会在解析时被检出并报成一条 `VariableIssue`，而不是把编辑器挂住。

**`system`** 的 `systemKey` 决定取值：

| `systemKey` | 渲染 |
| --- | --- |
| `page` | `3` |
| `total` | `12` |
| `pageLabel` | `第 3 页` |
| `pageOfTotal` | `第 3 页，共 12 页` |
| `date` | 按 `format`（默认 `YYYY年MM月DD日`） |
| `time` | 按 `format`（默认 `HH:mm:ss`） |

「现在」是**注入**的，不是现读时钟：这样解析是确定的，同一份文档在填写和打印之间也不会
出现两个不同的时间。文档里的页码不靠 `system` 变量，而是靠 `pageNumber` 节点，
原因见[页眉页脚与页码](#页眉页脚与页码)。

### `money` 与中文大写

`chineseUppercase` 不是另一个类型，而是**同一个数字的另一种渲染** —— 合同通常同时需要
小写数字和大写金额。大写用的是财务体：

```text
1234500  →  壹拾贰万叁仟肆佰伍拾元整
1000001  →  壹佰万零壹元整
0        →  零元整
```

「壹拾」不是「拾」：合同金额保留占位符。转换在整数「分」上做，所以 `0.1 + 0.2` 这类
二进制噪声不会改变印出来的数字。

### `keySource`：`innerVariable` 是一种输入方式，不是类型

旧版把 `innerVariable` 当成一个变量**类型**。它其实只回答「用户怎么挑这个 key」：

- `keySource: "manual"`（默认）：用户手写一个 key，`company.name` 这样的点号路径按嵌套取。
- `keySource: "inner"`：key 来自调用方通过 `variable.innerVariable` 传进来的一棵树
  （`{ label, key, children? }`）。

值长什么样、怎么校验、怎么渲染，两种方式完全一样。所以它住在 `VariableAttrs.keySource`，
不在 `VariableData` 里。

### 填写数据的解析与校验

`data` 是按 key 查表的对象（`VariableFillData`），多出来的 key 会被忽略。填写的顺序是：

1. `data` 里有值就用它；
2. 没有就用 `defaultValue`；
3. 还没有就按类型给一个「空」——`number` / `money` / `formula` 给 `0`，`boolean` 给 `否`，
   文本给空串。

`validateFill` 决定什么会挡住提交（`severity: "error"`），什么只是提示（`"warning"`），
并把问题挂在对应字段上：

| 检查 | 结果 |
| --- | --- |
| `text` / `number` / `money` / `date` / `select` / `image` 既没有填写值也没有 `defaultValue` | error「必填项未填写」 |
| `number` 超出 `min` / `max` | error「超出允许的范围」 |
| `select` 的值不在 `options` 里（`options` 为空时不检查） | error「选项不在允许的范围内」 |
| `image` 值为空，或按体积估算超过 `maxSizeMb` | error |
| `text` 超过 `maxLength` | **warning**，因为渲染时会省略，文档仍然可出 |
| `formula` 语法错、引用了不存在的变量、或存在循环引用 | 按情况给 error |

`boolean`、`formula`、`system` 不会被判「必填」：`boolean` 的空值有明确的渲染（否），
`formula` 的值是算出来的，`system` 的值由文档提供。公式的检查是结构性的 ——
表达式能不能解析、它读到的名字在不在、引用图有没有环 —— 三件事都能只靠模板回答，
所以用户还没输入任何东西时对话框就能把问题指出来。
对话框和纸张用的是同一套解析函数，所以两者不可能给出不同的答案。

## 扩展

**一切按需注册。** 一个扩展如果不在你的 `extensions` 数组里，它就**不贡献节点类型、不贡献
命令、也不贡献工具栏分组**。工具栏有两道闸门：你必须在 `tools` 里点名它，
**并且**它的扩展真的注册了 —— 两者缺一不可。

```ts
import { Page, Variable, QRCode, Watermark, Print } from "@snail-js/editor";

const extensions = [Page, Variable, QRCode, Watermark, Print];
```

### `Page` / `PageContent` / `PageHeader` / `PageFooter` / `PageLogo` / `PageNumber`

页面模块是文档的骨架。`Page` 是一个 Node，它的 `content` 是**根据实际注册了哪些家具节点
动态算出来的表达式**（`(pageHeader | pageContent | pageFooter | pageLogo)*`），
所以砍掉页眉不会留下一个「content 表达式里有不存在的节点」的 schema。

`Page.configure()` 的选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `paperFormat` | `"A4"` | 具名尺寸（`A3` `A4` `A5` `Letter` `Legal`）或自定义 `{ name, width, height }`（毫米） |
| `orientation` | `"portrait"` | `"portrait"` / `"landscape"` |
| `margins` | 四边 `"20mm"` | 逐边对象或 CSS 简写字符串（`"10mm 20mm"`）。单位永远写在字符串里 |
| `header` | 注册 `PageHeader` | 传 `false` 把页眉从 schema 里拿掉 |
| `footer` | 注册 `PageFooter` | 同上 |
| `logo` | 注册 `PageLogo` | 同上 |
| `pageNumber` | 注册 `PageNumber` | 同上；它是页眉/页脚内容里的内联节点 |
| `pagination` | `PageContent` 默认开启 | `{ autoPagination?, tolerance? }`，或 `false` 保留节点但不自动切页 |
| `HTMLAttributes` | `{}` | 加在 `<section>` 上 |

**页眉、页脚和 Logo 是默认包含的**，要丢掉它们就显式关掉：

```ts
Page.configure({ header: false, footer: false, logo: false })
```

节点：`page`、`pageContent`、`pageHeader`、`pageFooter`、`pageLogo`、`pageNumber`。
详见下一节。

### `Variable`

节点：`variable`（内联原子）。选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `mode` | `"design"` | 该渲染徽标还是渲染值 |
| `values` | `{}` | 填写数据。改它请优先用 `setVariableValues(editor, values)` |
| `innerVariable` | `[]` | 调用方给的 key 目录树 |
| `locale` | 内置中文 | 局部覆盖（未填写、必填项未填写、公式语法错误……） |
| `onRequestEdit` | — | 设计模式下点击变量时回调 `(attrs, pos)`；`pos` 为 `-1` 表示取不到位置 |

命令：`insertVariable(attrs)`、`updateVariable(pos, attrs)`、`removeVariable(pos)`、`getVariables()`。

`updateVariable` 按**位置**寻址，不按选区。旧版用 `updateAttributes("variable", …)`，
Tiptap 只会改选区内的节点，所以除非选区正好是一个 `NodeSelection`，编辑会静默失败，
而跨多个变量的区间会把同一组属性套给所有变量。

### `QRCode`

节点：`qrcode`（块级原子，可拖动 —— 拖动走的是真正的 ProseMirror 拖拽，进文档也进撤销栈）。
选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `errorCorrectionLevel` | `"M"` | `"H"` 更抗物理损伤，但在同样的物理尺寸下编码更密，手机更难扫 |
| `dpi` | `300` | 给 `mm` / `cm` 尺寸算栅格分辨率 |
| `HTMLAttributes` | `{}` | 合进渲染出的 `<img>` |
| `onError` | 控制台 | 生成是异步的，失败无法用命令返回值报告，所以必须在这里订阅 |

节点属性：`text`（载荷）、`src`（`data:` URL）、`alt`、`size`（默认 `30mm`）、
`position`（默认距内容盒原点 `10mm, 10mm`）、`color`（`{ dark, light }`）、`margin`（静区，
单位是 QR 模块数，默认 4）。`text` 进 schema 这件事本身就是修复：旧版的载荷根本没进 schema，
每次保存都会丢掉。

命令：`insertQRCode(attrs?)`、`updateQRCode(attrs)`、`removeQRCode()`、
`regenerateQRCode()`、`moveQRCode(dx, dy)`、`hasQRCode()`。

`hasQRCode()` 是从文档里**推导**出来的，不是一个标志位。旧版用一个永不重置的
`storage.qrcode.hasQRCode` 挡着，删掉二维码之后这个编辑器一生都再也插不进第二个。

### `Watermark`

**扩展**（不是节点）：水印是画在页上的**指令**，不是文档内容。选项与默认值见[水印](#水印)。
命令：`setWatermark(options)`（局部合并，如只改 `angle`）、`removeWatermark()`、
`toggleWatermark(enabled?)`。设置同时放在 `editor.storage.watermark.settings`，
读它不需要知道装饰是怎么造的。

### `Print`

**扩展**：在**当前文档**里注入 `@media print`，由 `beforeprint` / `afterprint` 切换。
选项见[打印](#打印)。命令：`printDocument()` 和它的别名 `print()`（同一条流水线，
只是名字和组件的暴露 API 一致）。没有 DOM 时返回 `false`，不抛异常。

### `ParagraphStyle`

给 `paragraph` 和 `heading` 加上块级样式属性：`textIndent`（首行缩进）、
`paragraphStart` / `paragraphEnd`（段前 / 段后）。选项只有一个 `types`
（默认 `["paragraph", "heading"]`）。

首行缩进的单位是 `em`，而一个汉字正好是一个 `em`，所以工具栏里的「首行缩进 N 字符」写进文档的
就是 `N em` —— 旧版那个按钮写死的 `2em` 也就是两个字符。读回时只认 `em` / `rem`：文档里带的
绝对缩进（`24pt`、`10mm`）不会被悄悄改写成另一个长度。

命令：`setParagraphStyle({ textIndent?, paragraphStart?, paragraphEnd? })`；
`null` 表示移除该属性，而它和 `"0"` 是不同的值 —— 旧版默认成 `"0"`，
于是每一段都被写上 `text-indent: 0;` 并序列化出去。

为什么不是 Tiptap 自己的 `LineHeight`：那是 **mark**，表达不了首行缩进，
而且文本被切开时会消失。首行缩进和段间距是**块**的属性。

### `LayoutMode`

布局表模式：给 `table` / `tableRow` 打上 `layout-mode` 类，让无边框的「用表格排版」
（签名栏、两栏条款抬头）不继承主题的单元格边框。选项 `types`（默认 `["tableRow"]`，
`table` 永远包含）、`className`（默认 `"layout-mode"`）。没有命令。

### 顶层组件的 `extensions` 选项

```ts
<SEditor
  :extensions="{
    heading: { levels: [1, 2, 3] },
    table: { resizable: false },
    paragraphStyle: true,
    layoutMode: true,
    placeholder: '在这里起草条款…',
    characterLimit: 20000,
    disable: ['watermark', 'print']
  }"
/>
```

`disable` 里的名字会被整个从 schema 里拿掉；`heading` / `table` / `placeholder` /
`characterLimit` 只在创建时生效（改这些本来就等于重建编辑器）。
`undo` / `redo` 由 `@tiptap/extensions` 的 `UndoRedo` **无条件注册** —— 一个没有撤销的
文档编辑器不是文档编辑器。分页事务全部带 `addToHistory: false`，
所以 Ctrl+Z 撤销的是你打的字，永远不会是分页。

## 页眉页脚与页码

Word 那样的页眉 / 页脚在这里就是 `page` 的**子节点**：`pageHeader`、`pageFooter`、
`pageLogo`，内容是普通块（`content: "block*"`），所以页眉里的文字可以正常选中、
排版、对齐。一页没有页眉也是合法状态（`addHeader` 是幂等的，
`removeHeader` 在没有页眉时不报错）。

家具节点的属性：`height`（**CSS 像素**，默认 50，页眉右对齐、页脚居中）、
`align`、`showLine`（家具与正文之间画一条线，默认关）。

命令：

| 命令 | 作用 |
| --- | --- |
| `addHeader(pageIndex?)` / `addFooter(pageIndex?)` | 给还没有页眉 / 页脚的页加上（默认所有页）；已存在的页会沿用第一份家具的属性 |
| `removeHeader(pageIndex?)` / `removeFooter(pageIndex?)` | 移除 |
| `setHeaderHeight(h, pageIndex?)` / `setFooterHeight(h, pageIndex?)` | 设高度 |
| `setHeaderAlign(a, pageIndex?)` / `setFooterAlign(a, pageIndex?)` | 设对齐 |
| `applyPageNumberFormat(format)` | 把每一页页码的格式设为 `format`；这一页还没有页码时**顺手建一个**（优先页脚，没有页脚就用页眉）。没有家具可放、或格式本来就一样时返回 `false` |
| `addLogo(attrs?, pageIndex?)` / `removeLogo(pageIndex?)` / `setLogoPosition(position, pageIndex?)` | Logo（`src`、`width` 默认 `30mm`、`height` 默认 `auto`、`position` 左 / 中 / 右、`offsetX` / `offsetY` 毫米） |

`pageIndex` 是 1 起的页码，省略就作用于所有页 —— 「只有部分页有页眉」是被支持的状态，
不是坏掉的状态。

**页眉 / 页脚点一下就能编辑。** 家具的内容是普通块，光标进去以后选中、排版、对齐都和正文一样。
唯一要补的是「刚加上去的空页眉」：里面只有一个空段落，点在它的留白上时浏览器可能把**整块页眉**
当成一个节点选中，看起来就像「页眉点不进去，一打字整块页眉被替换」。这里在 ProseMirror 自己的
映射之后再补一步 —— 只有当这次点击的结果正好是**选中了这个家具节点**时，才把选区改成家具内部的
文本选区（`planFurnitureClick`）；光标已经在里面、你选中了页码或二维码、点击落在别处，全都不动。
所以它只修正坏掉的那一种结果，不和 ProseMirror 抢映射。

### 页码是一个节点

页码是内联原子节点 `pageNumber`，属性只有一个 `format`，默认 `第{page}页，共{total}页`。
`{page}` 是当前页、`{total}` 是总页数，两者都在**渲染时**替换；`#` 与 `&`（以及
`$index` / `$total`）是等价的写法，同样认得，所以一个存了很久的模板不会突然印不出数字。

关键是：**节点里没有数字。** 标签由所在 `page` 的 `index` 现算，
`index` 缺失或过旧时退化为「它是第几个 page」。所以：

- 加一页、删一页、移动一页之后，**每一页的页码都对**，而且**没有改写任何文本**；
- 「第 X 页，共 Y 页」里的 `total` 来自文档的页数，同样不需要重写；
- 从页脚复制的页码节点在新页上自己就显示新数字。

旧版是把页码当文本「盖」进每一页的（`textFormat` 模板 + `schema.text("")`），
结果是默认文档里点「新页面」直接抛异常，而且 `__flush*` 在每一页上都盖 `index = 1`
从不重排 —— 结构一变页码就全错。

### 页码格式：选一个格式就是「要页码」

「页面」页签里的页码格式下拉列的是 `第{page}页，共{total}页`、`{page}`、`{page} / {total}`
这类常用写法，旁边 `?` 图标的提示里写着可用的占位符（`{page}` 当前页、`{total}` 总页数，
`#` 与 `&` 等价）。选中一个格式走 `applyPageNumberFormat(format)`，它**不只是改属性**：

1. 优先放进每一页的**页脚**，这一页没有页脚就用**页眉**；两者都没有的页不动；
2. 每页只放一个 —— 已经有页码的页只改它的 `format`，不会又多出一个；
3. 从后往前改，因为插入会移动它后面的位置（旧版 `__flush*` 从前往后盖，位置一错页码全错）。

这条命令存在的理由是一个真实的死路：**刚打开的页脚里是空的**，没有页码节点可改，于是
「开启页脚 → 选页码格式」只能得到一句「没有页脚节点」。选格式本身就是添加页码的方式，所以
缺的那个由它建出来，而不是让用户自己先想办法插一个。

### 插入页码

```ts
editor.chain().focus().insertPageNumber("第{page}页 / 共{total}页").run();
```

选区是块的 `NodeSelection`（内联节点放不进去）时返回 `false`，不抛异常：旧版正是从这个
状态里抛出了 `RangeError`，被工具栏显示成「插入失败」。

## 打印

走**浏览器自己的打印**，没有 iframe、没有新窗口、没有新依赖：

- 打印样式是注入到**当前文档**里的一个 `<style>`（`@media print { … }`）；
- `beforeprint` / `afterprint` 负责挂上和撤下；
- `@page` 的尺寸和方向来自**文档自己的页面设置**（`page` 节点的 `paperFormat` / `orientation`），
  没有显式设置时按 A4 纵向；
- 打印前会等字体（`document.fonts.ready`）和图片就绪，各带 3 秒超时，
  所以「字体还没加载完就分页」这个老问题不会发生；
- 每一页一条 `break-after` 规则（`:nth-of-type` 按页码生成），**最后一页是 `auto`**，
  不会多印一张白纸；
- `print-color-adjust: exact` 加在包裹元素上（默认 `[data-print-root], .s-editor-paper,
  .ProseMirror`），因为 Chrome / Safari 不打印 `<body>` 自己的背景；
- 打印时隐藏工具栏：给你自己的元素加 `data-print-hidden` 属性即可，
  够不着的地方用 `hiddenSelectors`。

选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `paperFormat` / `orientation` / `margins` | 文档自己的设置 | 显式给了就覆盖所有页 |
| `marginBoxes` | `false` | 让浏览器画它自己的页眉页脚（含页码） |
| `documentTitle` | — | 「另存为 PDF」时建议的文件名 |
| `onBeforePrint` / `onAfterPrint` | — | 前后回调 |
| `onWarning` | — | 打印结果与文档不完全一致时的回调 |
| `onError` | 控制台 | 流水线本身失败 |

### 诚实的边界

- **一页一个尺寸做不到。** 一份 `@page` 规则管整篇文档，所以**第一页的纸张与方向胜出**，
  其余不同尺寸的页通过 `onWarning` 报出（`code: "mixed-page-setup"`，并列出每一页解析后的
  尺寸）。旧版在这里是 `alert()` 之后**拒绝打印** —— 用户要的是纸，什么都没拿到是最差的答案。
- **`@page` 的 margin box 只有 Chromium 131+ 支持。** `counter(page)` / `counter(pages)`
  在 Firefox / Safari 上不会渲染，所以它们是**可选的**（`marginBoxes: true` 才生成）。
  另有一条前提：`@page { margin: 0 }` 会让 Chrome 干脆不生成 margin box，
  所以开启它们时页边距不能是 0。
- **文档自己的 `pageNumber` 节点在哪儿都印得出来**，因为它就是正文里的 DOM 文本。
  所以即使 margin box 不被支持，页码也不会丢 —— 这正是页码做成节点而不是 `@page` 内容的理由。
- **水印必须是真实 DOM**，不能是 CSS 背景：打印对话框里的「背景图形」是用户可关的，
  而水印恰恰是最需要打出来的东西。

## 水印

水印是一个 widget 装饰，**每个 `page` 上一个覆盖层**：真实元素、`aria-hidden`、
`pointer-events: none`、`contenteditable="false"`，`z-index` 高于二维码（二维码是纸上的内容，
水印是纸上的指示）。

选项与默认值：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 关掉时不渲染任何东西 |
| `text` | `""` | 文字水印的内容 |
| `imageSrc` | `""` | 图片水印；同时给出时它优先于 `text` |
| `angle` | `-30` | 角度，直接交给 CSS / SVG `rotate()` |
| `opacity` | `0.12` | `0…1` |
| `greyscale` | `false` | 灰阶渲染 |
| `tiled` | `false` | 平铺整张纸，而不是居中一个 |
| `fontSize` | `"48px"` | 文字水印的字号 |
| `color` | `"#000000"` | 文字水印的颜色 |

平铺水印是一格一格的**真实内联 `<svg>`**，不是 `repeating` 的 CSS 背景图 ——
背景图会被「背景图形」设置丢掉，而平铺水印（复印件的防伪）恰恰最需要活下来。

**水印只存在于视图里，永远不进入文档 JSON**：它是 widget 装饰，
不能被复制、不能被导出、也不会出现在 `getJSON()` 的结果里。它作为**模板设置**随
`TemplateDocument.watermark` 一起存下来，所以渲染方从模板上读它、
而不是去 `doc` 里找（这正是 `TemplateDocument` 要带 `watermark` 字段的原因）。

## 工具栏分组

工具栏的页签就是 `ToolName` 的成员，而每个分组只在**两件事同时成立**时出现：你在 `tools` 里点名它，
并且它背后的扩展真的注册了 —— 所以没装水印扩展的应用不会看到一个空的「水印」页签。

| 分组 | `tools` 名字 | 依赖的扩展 | 内容 |
| --- | --- | --- | --- |
| 格式 | `font` | `textStyle` | 字体、字号、加粗 / 斜体 / 下划线 / 删除线、**字体颜色**、**字体背景色** |
| 段落 | `paragraph` | `paragraphStyle` | 样式（正文 / H1–H6）、对齐、行距、**首行缩进 N 字符**、段前 / 段后 |
| 插入 | `insert` | `variable` / `qrcode` / `page` / `image` 任一 | **插入变量**、**插入二维码**、新页面、分页、插入图片 |
| 表格 | `table` | `table` | 插入表格（8×8 网格）、插入布局表、合并 / 取消合并、加删行列 |
| 页面 | `page` | `page` | 纸张、方向、页边距、页眉页脚、页码、logo |
| 变量 | `variable` | `variable` | 文档里的变量列表，编辑 / 移除 |
| 二维码 | `qrcode` | `qrcode` | 二维码内容、尺寸、位置、颜色、边距 |
| 水印 | `watermark` | `watermark` | 文字 / 图片、角度、透明度、灰度、平铺 |
| 打印 | `print` | `print` | 纸张 / 方向 / 页边距覆盖、`@page` margin box、文档标题 |

几点值得单独说明：

- **插入与表格是两个页签。** 它们曾经是同一个：表格工具住在「插入」里，于是那个页签同时表达
  「往里放一个新东西」和「改你正踩着的这张表」。拆开之后，光标在表格里时一步就能点到表格操作，
  「插入」只描述插入。`table` 不再是 `insert` 的别名，`DEFAULT_TOOLS` 里两者都在。
- **字体颜色和背景色是同一个 `textStyle` mark 的属性**，和字体、字号一样作用于选区。它们本来就
  已经注册（`TextStyleKit` 默认包含 `Color` 与 `BackgroundColor`，只有显式传 `false` 才关掉），
  以前缺的只是控件。颜色面板里的「清空」写的是 `null`，于是走 `unsetColor` —— 而不是往文档里写一条
  `color: ;` 空声明。
- **首行缩进按字符数设置。** 一个汉字正好是一个 `em`，所以输入 `2` 写进文档的就是 `text-indent: 2em`
  （也就是旧版按钮写死的那个值）。旁边两个箭头按钮是 ±1 字符的快捷方式。
- **「插入变量」自己不弹对话框。** 它把事件交给 `SEditor`，因为变量节点自己的点击回调也要打开同一个
  对话框；两个所有者正是旧版对话框被共享、并把上一个变量的状态带进下一个的原因。
- **「插入二维码」的内容取文档的第一个标题**（没有标题时用一个默认链接），所以一次点击插入的是有内容
  的二维码而不是空载荷；插进去之后可以在「二维码」页签里改内容和外观。位图是异步生成的，不会插两次。
- **`template` 不是页签**：模板列表是工作区里的选择器，不是要展开工具栏才能用的东西。

## 组件接口

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
