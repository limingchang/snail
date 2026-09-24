# 扩展

**一切按需注册。** 一个扩展如果不在你的 `extensions` 数组里，它就**不贡献节点类型、不贡献
命令、也不贡献工具栏分组**。工具栏有两道闸门：你必须在 `tools` 里点名它，
**并且**它的扩展真的注册了 —— 两者缺一不可。

```ts
import { Page, Variable, QRCode, Watermark, Print } from "@snail-js/editor";

const extensions = [Page, Variable, QRCode, Watermark, Print];
```

## `Page` / `PageContent` / `PageHeader` / `PageFooter` / `PageRegion` / `PageLogo` / `PageNumber`

页面模块是文档的骨架。`Page` 是一个 Node，它的 `content` 是**根据实际注册了哪些家具节点
动态算出来的表达式**，所以砍掉页眉不会留下一个「content 表达式里有不存在的节点」的 schema。

表达式是一条**顺序**（`pageHeader? pageContent pageFooter?`），不是联合：联合只能表达「这些节点里
任意一个、任意顺序、任意个数」，于是同时插入页眉和页脚时，顺序取决于命令谁先跑 —— 页脚跑到页眉
前面，那就不是文档了。顺序表达式让「存成错误顺序」不可能：插错位置会被 ProseMirror 拒绝。

`Page.configure()` 的选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `paperFormat` | `"A4"` | 具名尺寸（`A3` `A4` `A5` `Letter` `Legal`）或自定义 `{ name, width, height }`（毫米） |
| `orientation` | `"portrait"` | `"portrait"` / `"landscape"` |
| `margins` | 四边 `"20mm"` | 逐边对象或 CSS 简写字符串（`"10mm 20mm"`）。单位永远写在字符串里 |
| `header` | 注册 `PageHeader` | 传 `false` 把页眉从 schema 里拿掉 |
| `footer` | 注册 `PageFooter` | 同上 |
| `region` | 注册 `PageRegion` | 页眉 / 页脚的左中右三格；只在 `content: "block*"` 的家具里存在 |
| `logo` | 注册 `PageLogo` | 传 `false` 把 Logo 从 schema 里拿掉；`maxBytes` 默认 200 KB |
| `pageNumber` | 注册 `PageNumber` | 同上；它是某一格**段落里的内联节点** |
| `pagination` | `PageContent` 默认开启 | `{ autoPagination?, tolerance? }`，或 `false` 保留节点但不自动切页 |
| `HTMLAttributes` | `{}` | 加在 `<section>` 上 |

**页眉、页脚和 Logo 是默认包含的**，要丢掉它们就显式关掉：

```ts
Page.configure({ header: false, footer: false, logo: false })
```

节点：`page`、`pageContent`、`pageRegion`、`pageHeader`、`pageFooter`、`pageLogo`、`pageNumber`。
详见下一节。

### 自动分页的节奏（为什么粘贴一大段不会卡死）

分页是**测量 + 移动**的循环：每个「移动」都是一次事务，而每次事务都会重画那一页。一次性贴进几十页
内容时，旧实现会在**同一帧里**做上百次这样的循环 —— 主线程被占满，感受上就是卡死；输入法输入多个
汉字时，它还会在**拼写未结束**时改文档，浏览器于是重启拼写、再触发变更、再分页。

现在有四道约束：

- **每次 pass 有时间预算**（`DEFAULT_PASS_BUDGET_MS`，默认 12 ms，< 一帧）：用超了就带着
  `interrupted: true` 收手，插件在**下一帧**继续 —— 浏览器有机会在两次 pass 之间绘制，所以大粘贴
  是「分几帧排完」而不是「卡住」；
- **拼写期间不动文档**：`compositionstart` 到 `compositionend` 之间跳过，结束后补跑一次；
- **拖动表格列宽期间不动文档**：`prosemirror-tables` 的列宽拖动在 `mousedown` 时记下**绝对位置**、
  在 `mouseup` 时按它改文档；分页这时搬动内容会让那个位置过期，插件在改文档时抛错、于是**永远清不掉
  「正在拖动」状态**——症状是列宽只能调一次、之后整块编辑器都变成宽度调整的光标。所以分页在拖动期间
  让路（松手本身是一次文档变更，会立刻排下一轮），另有一个兜底：`mouseup` 的下一个宏任务里若发现拖动
  状态还在，就替插件清掉（`extensions/table/resizeGuard.ts`）；
- **连续自我调度的上限**（`MAX_CONSECUTIVE_PASSES`）：预算让 pass 能要求下一帧，这个阀门保证一个
  真的稳定不下来的排版不会无限空转；任何一次用户编辑都会把计数清零，所以正常的排版工作不会被砍断。

`MAX_STEPS`（单次 pass 的硬上限）仍在，它防的是「某个节点视图测量出错」这种异常。

## `Variable`

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

## `QRCode`

节点：`qrcode`（块级原子，可拖动 —— 拖动走的是真正的 ProseMirror 拖拽，进文档也进撤销栈）。
选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `errorCorrectionLevel` | `"M"` | `"H"` 更抗物理损伤，但在同样的物理尺寸下编码更密，手机更难扫 |
| `dpi` | `300` | 给 `mm` / `cm` 尺寸算栅格分辨率 |
| `HTMLAttributes` | `{}` | 合进渲染出的 `<img>` |
| `onError` | 控制台 | 生成是异步的，失败无法用命令返回值报告，所以必须在这里订阅 |

节点属性：`text`（载荷）、`src`（`data:` URL）、`alt`、`size`（默认 `30mm`）、
`position`（默认距**页面左上角** `10mm, 10mm`）、`color`（`{ dark, light }`）、`margin`（静区，
单位是 QR 模块数，默认 4）、`page`（所在页面，默认 `null` 即「不指定」）。`text` 进 schema
这件事本身就是修复：旧版的载荷根本没进 schema，每次保存都会丢掉。

命令：`insertQRCode(attrs?)`、`updateQRCode(attrs)`、`removeQRCode()`、
`regenerateQRCode()`、`moveQRCode(dx, dy)`、`setQRCodePage(anchor)`、`hasQRCode()`。

`hasQRCode()` 是从文档里**推导**出来的，不是一个标志位。旧版用一个永不重置的
`storage.qrcode.hasQRCode` 挡着，删掉二维码之后这个编辑器一生都再也插不进第二个。

#### 位图是派生的，所以扩展自己画

文档只存载荷，屏幕要的是图。扩展在文档打开后会为每一个「有载荷、还没有位图」的节点补上位图，所以
**宿主不需要记得调 `regenerateQRCode()`**：在一份只带载荷的模板上，漏掉那一步的结果是页面上一张
加载失败的图片（只剩 `alt` 文字），直到用户自己打开面板按一次「更新」。

生成要等一次 canvas，而在这几毫秒里自动分页完全可能把内容在页面之间搬一次。所以写回时用的不是
`await` 之前那个位置，而是重新找一遍节点（`resolveQRCodePosition`）：原位还在就写原位，被搬走了就
按载荷找到它。位置过期不是「别再写了」的理由，而是「先找到它」的理由。

### 坐标相对的是页面，不是正文盒

二维码 `position: absolute` 的包含块是**页面**（`.s-editor-page-inner`，整张纸）。这里有两处细节，
它们合起来才让「位置」真的等于纸上的位置：

- **页边距不在正文盒上。** 正文盒（`pageContent`）是已定位的，因此它也是绝对定位后代的包含块 —— 而
  浏览器用的是它的**内容边**（不是内边距边）当原点，所以只要页边距是它的内边距，`left: 10mm` 就会落在
  「页边距 + 10mm」处（实测：二维码 `x: 0` 时左边缘位于纸内 20 mm）。现在页边距是**内层包裹元素**的
  内边距，正文盒本身没有内边距，内容边与内边距边重合 —— 无论浏览器取哪一个，原点都是纸的左上角。
- **内层包裹元素不是已定位的**（`base.scss` 里那条 `> *:not(.s-editor-page-content-inner)`）：它的
  内容边在纸内 20 mm 处，一旦成为包含块，二维码就会额外多出这段边距。

元素在 DOM 里的位置与它的定位基准是两件事：二维码节点仍然是正文里的一个块（ProseMirror 的节点就必须
待在它所在的位置，把它搬到页面的 DOM 里会破坏节点视图的所有权），但绝对定位解析的是最近的**已定位**
祖先，而链上唯一合格的就是整张纸。断言见 `tests/editor/panelLayout.spec.ts`。

## 二维码放在第几页

`page` 可以是一个 1 起的页码，也可以是相对的 `"first"` / `"last"` —— 相对的取值会跟着页数变化，
所以「盖在最后一页」在追加一页之后仍然成立。`setQRCodePage(anchor)` 在**一个**事务里既把节点搬到
目标页的正文里、又写下这个属性，所以撤销一次就同时退回两者。

为什么「在第 3 页」就是「节点住在第 3 页」：绝对定位的元素画在哪个页面上，取决于它在 DOM 里的位置，
而 DOM 的位置由 ProseMirror 决定。没有任何别的机制能把一个元素画进另一页的盒子，把 DOM 元素搬出
ProseMirror 给它的位置又会破坏节点视图的所有权。所以**新的**搬动只在用户选页码的那一次事务里发生；
起始文档里的示例二维码则直接放在正文靠前的位置，因此它天然就在第一页上。

面板里的页面清单来自文档真实的页数：一页的文档只有「第一页」，两页的是「第一页 / 最后一页」，
更长的文档中间那几页按页码列出。尺寸单位只提供 `mm` / `cm`（二维码是要印在纸上的，屏幕像素不是
能拿去印刷的尺寸），而模型仍然认识 `px`，旧模板里存下的 `px` 尺寸照样能打开。

二维码的调整只在**设计模式**下可用：页面上鼠标是手型，点击就弹出选项；填写模式下是默认箭头，
点击不做任何事。


## `ParagraphStyle`

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

## `LayoutMode`

布局表模式：给 `table` / `tableRow` 打上 `layout-mode` 类，让无边框的「用表格排版」
（签名栏、两栏条款抬头）不继承主题的单元格边框。选项 `types`（默认 `["tableRow"]`，
`table` 永远包含）、`className`（默认 `"layout-mode"`）。没有命令。

## 顶层组件的 `extensions` 选项

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

家具节点的属性：`height`（**CSS 像素**，默认 50）、`showLine`（家具与正文之间画一条线，默认关）。

命令：

| 命令 | 作用 |
| --- | --- |
| `addHeader(pageIndex?)` / `addFooter(pageIndex?)` | 给还没有页眉 / 页脚的页加上（默认所有页）；已存在的页会沿用第一份家具的属性。新家具自带左 / 中 / 右三个空区域，并且**按 header → 正文 → footer 的顺序**插入 |
| `removeHeader(pageIndex?)` / `removeFooter(pageIndex?)` | 移除 |
| `setHeaderHeight(h, pageIndex?)` / `setFooterHeight(h, pageIndex?)` | 设高度（对三个区域一起生效） |
| `setPageNumberSlot(side, slot)` | 把页码放进 `页眉 / 页脚 × 左 / 中 / 右` 中的一格；缺的页眉、页脚或区域会**先建出来** |
| `applyPageNumberFormat(format)` | 改每一页页码的格式；还没有页码的页会在**默认位置（页脚中间）**建一个 |
| `removePageNumber()` | 移除所有页码，被占用的区域随之恢复可编辑 |
| `setLogo(placement, attrs?, pageIndex?)` | 把 Logo 放进某一格（`attrs`：`src`、`width` 默认 `30mm`、`height` 默认 `auto`） |
| `removeLogo(pageIndex?)` / `setLogoSize(attrs, pageIndex?)` | 移除 / 改尺寸 |

`pageIndex` 是 1 起的页码，省略就作用于所有页 —— 「只有部分页有页眉」是被支持的状态，
不是坏掉的状态。

### 页眉页脚是「左中右三段」

一个页眉 / 页脚不是一整块，而是 `pageRegion` 的三个区域：**左 / 中 / 右各一格，各自可编辑**，
各自按位置对齐（左格左对齐、中格居中、右格右对齐 —— 这就是 `SLOT_ALIGN`）。

- **为什么必须是文档节点。** 「每格可编辑」「页码只占其中一格」「那一格不能再编辑」每一句都是对
  **文档**的陈述：CSS 分栏说不清光标在哪一格，页码也只能是文本的兄弟节点而不是「放进某一格」。
- **不变量由一处保证。** 区域缺失、重复、顺序不对（旧模板就是这种），都由 `planBandRegions`
  一次性补成三格：散落的块进中间那格、重复的槽位合进第一格、空掉的那格补一个段落（没有段落就点不进去）。
- **旧模板能打开。** `content` 仍然是 `block*`：一份在区域存在之前保存的模板，页眉里放的是普通块，
  schema 收得下，运行时再被规范化 —— 而不是在解析时把用户的文字丢掉。唯一的例外是**挂在 `page` 上的
  旧版 logo**，它会让新页面结构直接解析失败，所以由 `migrateFurnitureContent` 在进编辑器之前搬到
  `position` 指定的那一格。

### 双击才编辑

页眉页脚是家具：它在每一页重复，而且写正文时误点进去从来不是用户的意图。所以：

- **双击某个区域**进入编辑，光标落在里面，该区域变成可编辑，透明度 1；
- 已经在编辑时，**单击同一页眉 / 页脚的另一格**即可切换；
- **点正文或按 `Esc`** 退出，透明度回到 0.8；
- **填写模式与打印始终是 1**（那是输出，不是编辑）；
- **放着页码或 Logo 的那一格永远不可编辑**：里面是原子节点，没有可输入的文本，让光标进得去只会
  提供一个误删的机会。双击这样一格会弹出一条提示说明原因，而不是什么都不发生。

拦截分两层，因为任何一层单独都有洞：CSS 让没在编辑的区域 `pointer-events: none; user-select: none`
（点击放不进光标），事务过滤器再拒绝「没打开页眉时改到了家具」的文档变更（`Ctrl+A`、跨页眉的粘贴、
使用方自己的命令都走这里）。撤销 / 重做和分页事务带 `addToHistory: false`，照常放行。

### 改一页等于改每一页

页眉不是「第一页的页眉」，而是**每一页的页眉**；文档模型里每条栏各有一份区域，所以模型层面改一页
不会动其他页 —— 同步插件（`createFurnitureSyncPlugin`）补上的就是这一致性：一次**用户编辑**之后，
把被改过的那条栏的每一格内容复制到同侧其他栏的同一格。规则有三条：

- **被锁定的目标格跳过**：里面有页码或 Logo，那些由各自的命令统一维护，铺一段文字进去会抹掉它们；
- **内容已经相同就跳过**：因此它是幂等的，不会和规范化、分页互相追逐；
- **只有真的用户编辑才触发**（`addToHistory: false` 的分页 / 规范化事务不触发）。

### 输入法组合期间不改文档

输入法在 `compositionend` 之前只在浏览器里维护那段拼音，此时从编辑器外部改文档会让组合被取消 ——
用户看到的就是「打了一串拼音，中文没上屏」。两处会改文档的地方因此都带同一道闸门：分页器，以及
**区域规范化插件**（它会整体替换条带的子节点，比搬动内容更粗暴）。组合结束后，组合自己的提交事务
就会让被推迟的那一次规范化补跑。

### 页码是一个节点

页码是内联原子节点 `pageNumber`，属性只有一个 `format`，默认 `第{page}页，共{total}页`。
`{page}` 是当前页、`{total}` 是总页数，两者都在**渲染时**替换；`#` 与 `&`（以及
`$index` / `$total`）是等价的写法，同样认得，所以一个存了很久的模板不会突然印不出数字。

它是**内联**节点，所以永远住在某一格里的段落中 —— 直接放进区域（`block*`）会是非法文档，
写入时会自动补一个段落。

关键是：**节点里没有数字。** 标签由所在 `page` 的 `index` 现算，
`index` 缺失或过旧时退化为「它是第几个 page」。所以：

- 加一页、删一页、移动一页之后，**每一页的页码都对**，而且**没有改写任何文本**；
- 「第 X 页，共 Y 页」里的 `total` 来自文档的页数，同样不需要重写；
- 从页脚复制的页码节点在新页上自己就显示新数字。

旧版是把页码当文本「盖」进每一页的（`textFormat` 模板 + `schema.text("")`），
结果是默认文档里点「新页面」直接抛异常，而且 `__flush*` 在每一页上都盖 `index = 1`
从不重排 —— 结构一变页码就全错。

### 页码格式与位置

「页面」页签里是两个下拉：**位置**（页眉 / 页脚的左中右六格，外加「不显示」）和**格式**
（`第{page}页，共{total}页`、`{page}`、`{page} / {total}` 等，也可以自己输入）。格式旁边 `?` 图标的
提示里写着可用的占位符。它们背后是两条命令，规则一致：

1. **每页只有一个页码**：移动到新格子会删掉旧的那个，并且**保留原来的格式**；
2. **缺什么建什么**：「放到页脚中间」在一份没有页脚的文档上会先把页脚建出来 —— 选位置就是在表达
   「我要这个家具」；
3. **从后往前改**，并且每次编辑后都从**当前事务的文档**重新读位置（旧版 `__flush*` 从前往后盖，
   位置一错页码全错）。

选格式本身就是添加页码的方式，所以「开启页脚 → 选格式」这条路上不会再出现「没有页脚节点」的死路：
缺的那个由命令建出来。

### Logo

Logo 用的是**同一套模型**：`setLogo({ side, slot }, { src })` 把它放进某一格，那一格随之不可编辑，
同一时刻只有一个 Logo（换位置会移动它、保留图片本身）。图片以 `data:` URL 存进文档 —— 模板是**一份**
可独立打开的产物，指向一个打开模板时可能不存在的文件不算模板 —— 所以文件大小就是文档大小：
扩展默认拒绝超过 **200 KB** 的图片（`Page.configure({ logo: { maxBytes } })` 可改），面板上的
「选择图片」用的就是同一个上限。

### 插入页码

```ts
editor.chain().focus().insertPageNumber("第{page}页 / 共{total}页").run();
```

选区是块的 `NodeSelection`（内联节点放不进去）时返回 `false`，不抛异常：旧版正是从这个
状态里抛出了 `RangeError`，被工具栏显示成「插入失败」。

## 水印

水印是一个 widget 装饰，**每个 `page` 上一个覆盖层**：真实元素、`aria-hidden`、
`pointer-events: none`、`contenteditable="false"`，`z-index` 高于二维码（二维码是纸上的内容，
水印是纸上的指示）。

选项与默认值：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 关掉时不渲染任何东西 |
| `text` | `"水印"` | 文字水印的内容；开启后立刻看得见东西，所以默认不是空串（显式传 `""` 仍然是空） |
| `imageSrc` | `""` | 图片水印；同时给出时它优先于 `text` |
| `angle` | `-45` | 角度，直接交给 CSS / SVG `rotate()`；负值是逆时针，也就是经典的水印样子 |
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

### 为什么改设置一定会重画

ProseMirror 用 widget 的 `key` 判断两个装饰是不是同一个东西：**键相同就沿用页面上已有的 DOM**，不再
调用 `toDOM()`。第一版的键只有页码，于是 `setWatermark({ text: … })` 改了状态却没改画面 ——
「水印只有第一次设置时生效」。现在键里编进了设置本身的指纹（`watermarkSettingsKey`）：设置变了键就
变，装饰被替换、新设置真的画出来；设置没变键也不变，所以同一个水印不会每次事务都重建 DOM。

删除水印之所以「看起来正常」，正是因为它先把装饰集清空（键消失）再重新创建。另外，文字水印的默认值
是「水印」——**缺省**（没写 `text`）时用默认值，显式传 `text: ""` 才是「不要文字」，所以打开开关就
看得到东西。


## 打印

走**浏览器自己的打印**，没有 iframe、没有新窗口、没有新依赖。而打印出来的是**编辑器自己的纸**，
不是整个网页：打印前把编辑器里的 `.s-editor-page` 深拷贝进一个挂在 `<body>` 下的
`div.s-editor-print-root`（并把编辑器根元素的 class 抄过去，主题变量与全局类选择器因此在副本里
照样生效），配套的 `<style>` 让这个容器在屏幕上不可见、而在 `@media print` 下是 `<body>` 唯一可见
的孩子。于是无论宿主页面上有什么（侧边栏、导航、别的组件），打印对话框里能渲染的只有那几页纸。

这份「只留容器」的样式是**随副本一起挂上、一起撤下**的：如果它常驻在注入的样式表里，之后再按一次
裸的 `Ctrl+P`（不走这条流水线、没有副本）就会把所有东西都藏起来，打出一张白纸。

### `Print`

**扩展**：在**当前文档**里注入 `@media print`，由 `beforeprint` / `afterprint` 切换。
命令：`printDocument()` 和它的别名 `print()`（同一条流水线，只是名字和组件的暴露 API 一致）。没有 DOM 时返回 `false`，不抛异常。

其余的机制：

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