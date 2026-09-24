<script setup>
import IconBasic from "./examples/icon/basic.vue";
import iconBasicSource from "./examples/icon/basic.vue?raw";
import IconElementPlus from "./examples/icon/element-plus.vue";
import iconElementPlusSource from "./examples/icon/element-plus.vue?raw";
import IconBrowse from "./examples/icon/browse.vue";
import iconBrowseSource from "./examples/icon/browse.vue?raw";

import ClickCopyBasic from "./examples/click-copy/basic.vue";
import clickCopyBasicSource from "./examples/click-copy/basic.vue?raw";
import ClickCopyAdvanced from "./examples/click-copy/advanced.vue";
import clickCopyAdvancedSource from "./examples/click-copy/advanced.vue?raw";

import AliCaptcha2 from "./examples/ali-captcha/captcha2.vue";
import aliCaptcha2Source from "./examples/ali-captcha/captcha2.vue?raw";
import AliCaptchaPnvs from "./examples/ali-captcha/pnvs.vue";
import aliCaptchaPnvsSource from "./examples/ali-captcha/pnvs.vue?raw";

import PopupMenuBasic from "./examples/popup-menu/basic.vue";
import popupMenuBasicSource from "./examples/popup-menu/basic.vue?raw";
import PopupMenuAsync from "./examples/popup-menu/async.vue";
import popupMenuAsyncSource from "./examples/popup-menu/async.vue?raw";

import WordCloudBasic from "./examples/word-cloud/basic.vue";
import wordCloudBasicSource from "./examples/word-cloud/basic.vue?raw";
import WordCloudCustom from "./examples/word-cloud/custom.vue";
import wordCloudCustomSource from "./examples/word-cloud/custom.vue?raw";
</script>

# @snail-js/vue

`@snail-js/vue` 是一个 Vue 3 组件库，定位只有一句话：**补 Element Plus 没有的东西**。

它不重写 Element Plus 已经提供的任何组件 —— 没有按钮、表格、表单、弹窗、分页、面包屑。那些组件
在 Element Plus 里已经有了，而且比一个副业组件库做得好。这个包存在的理由是另外两类东西：

- **图标集**：`@element-plus/icons-vue` 里**没有**的字形 —— 表格与行列控制、页面设置、合同业务
  特有的标记（变量、二维码、印章、收支），以及品牌标记。凡是 Element Plus 已经提供的图标都被
  删掉了（21 个），所以两套图标是**互补**关系而不是重叠关系：通用的走 Element Plus，它没有的走这里。
- **四个自用组件**：点击复制 `SClickCopy`、阿里验证码 `AliCaptcha`、右键菜单 `SPopUpMenu`、
  3D 词云 `SWordCloud`。

三条约束贯穿整个包：

| 约束 | 含义 |
| --- | --- |
| 不依赖 Element Plus | `peerDependencies` 只有 `vue >= 3.5.0`。`SIcon` 根元素是普通的 `<i class="s-icon">` 而不是 `<el-icon>`，所以在没装 Element Plus 的项目里也能画自己的图标 |
| 按需引入真的奏效 | `sideEffects` 只声明样式表；图标桶是显式的 70 行列表而不是 `import.meta.glob`；组件注册表是静态字面量而不是命名空间对象 |
| 主题在运行时可变 | 所有设计令牌都是 CSS 自定义属性（`--s-*`），一个 Sass 变量都没留，换主题不需要重新编译这个库 |

::: tip 为什么「不重复造」不是洁癖
重复实现一遍 `el-button` 只会得到两个需要同时维护、行为又略有差异的按钮，而且消费者还得记住
哪一个是「本包的」。所以这里的判断标准是硬的：**只有 Element Plus 没有等价物时，组件才会被加进来。**
:::


## 安装

```bash
pnpm add @snail-js/vue
```

唯一的运行时依赖是 `@floating-ui/vue`（右键菜单定位用），peer 只有 `vue >= 3.5.0`
（`AliCaptcha` 用到了 3.5 才有的 `useId()`）。

### 样式表

```ts
import "@snail-js/vue/style.css";
```

导入一次即可（放在应用入口，或任何保证只执行一次的模块里）。这是 `package.json` 里**真实导出**的
`./style.css` 子路径 —— 0.1.x 的 `index.css` 从来没出现在 `exports` 里，也没有被文档提过，它只是
「恰好存在」，打包器并不保证你能 import 到它。

样式表里没有页面级重置：0.1.x 开头那句 `body { margin: 0 auto; }` 已经删掉，所有规则都收在 `s-`
前缀的类名下面。一个会重排宿主页面布局的组件库不是库，是框架。

### 全量注册

```ts
import { createApp } from "vue";
import SnailVue from "@snail-js/vue";
import "@snail-js/vue/style.css";

createApp(App).use(SnailVue).mount("#app");
```

插件把静态注册表里的东西一次性注册到 app 上：

| 注册的名字 | 说明 |
| --- | --- |
| `SIcon`、`SClickCopy`、`SContextMenu`、`AliCaptcha`、`SWordCloud`、`SWordTag` | 六个组件 |
| `IconAccount` … `IconWorkflow` | 70 个图标，按各自的组件名注册 |

两个例外值得单独说：`SContextMenuItem` 是 `SContextMenu` 内部的一行，应用永远不会在模板里直接写它，
所以不注册；而图标必须注册 —— `<SIcon icon="IconVariable">` 这种**字符串**写法需要一个注册表才有
名字可以解析。

### 按需引入

```vue
<script setup lang="ts">
import { SClickCopy, SIcon, IconVariable } from "@snail-js/vue";
</script>

<template>
  <SIcon :icon="IconVariable" />
  <SClickCopy text="hello" />
</template>
```

按需引入才是让 bundle 变小的那个选择，包里有三处设计专门为它服务：

- `package.json` 的 `sideEffects` 只有 `**/*.css`，所以只 import 一个 `SClickCopy` 时，其余组件和
  70 个图标都可以被摇掉；
- 图标桶是显式的 `import` / `export` 列表，不是 `import.meta.glob({ eager: true })` ——
  后者会把**每一个**图标拖进每一个使用者的 bundle；
- 组件注册表是静态对象字面量，不是 `import * as components`。命名空间对象对打包器是不透明的：
  只要读了其中一个成员，其余成员就必须保留。

代价只有一个：**字符串形式的图标名需要先注册**。不想装插件又要按名字渲染时，自己注册那一个即可
（`app.component("IconVariable", iconComponents.IconVariable)`），或者干脆把组件本身交给 `icon`。

## 组件总览

| 组件 | 它解决什么 | 导出 |
| --- | --- | --- |
| [SIcon](#sicon) | 运行时解析任意图标：本包图标、Element Plus 图标、插槽里的任意 SVG | `SIcon` |
| [图标集](#图标集) | 70 个 Element Plus 没有的字形，以及怎么遍历、怎么重新生成 | `Icon*`、`iconComponents`、`IconName` |
| [SClickCopy](#sclickcopy) | 点击复制，带可见且可读的反馈，含 http 与旧浏览器的兜底路径 | `SClickCopy` |
| [AliCaptcha](#alicaptcha) | 阿里云两个验证码产品：号码认证 PNVS 与验证码 2.0 | `AliCaptcha`、`acquireScript` |
| [SPopUpMenu](#spopupmenu) | 右键菜单：异步权限、异步命令、程序化关闭 | `createContextMenu`、`SPopUpMenu`、`SContextMenu` |
| [SWordCloud](#swordcloud) | 绕球面旋转的 3D 词云 | `SWordCloud`、`SWordTag` |
| [主题](#主题) | `--s-*` 设计令牌，以及它们和 `--el-*` 的关系 | — |
| [与 0.1.x 的差异](#与-0-1-x-的差异) | 破坏性变更清单 | — |

## SIcon

`SIcon` 是每个图标都要经过的那层包装。它存在的理由是**图标在编译期不一定是已知的**：名字可能来自
接口、来自配置，也可能是一个第三方图标组件。直接写 `<IconVariable />` 永远是首选（编译期就知道是
谁，最好摇树），`SIcon` 负责剩下的情况。

<DemoBlock
  title="基础用法"
  description="直接当组件用、交给 icon 属性、或者把自己的 SVG 放进默认插槽。"
  :code="iconBasicSource"
>
  <IconBasic></IconBasic>
</DemoBlock>

### 属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `icon` | `IconName \| Component \| (string & {})` | — | 一个组件，或一个已注册的图标名。`IconName` 是本包图标名的联合类型，所以字符串字面量有补全；`string & {}` 那一支让任何其他已注册的名字也合法 |
| `color` | `string` | — | 覆盖继承来的文字颜色 |
| `size` | `string \| number` | — | 图标盒子的尺寸；数字按 px 读取 |
| `spin` | `boolean` | `false` | 持续旋转，给加载/进度图标用 |

### 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `click` | `event: MouseEvent` | 图标被点击；原生事件原样转发，不做任何加工 |

### 插槽

| 插槽 | 作用域 | 说明 |
| --- | --- | --- |
| 默认 | — | 没有可解析的 `icon` 时渲染它 |

`SIcon` 不暴露任何方法：它没有需要命令式驱动的东西。

### 尺寸与颜色从哪来

每个内置图标都自带 `width="1em" height="1em"` 和 `fill="currentColor"`，所以它天然跟着字号与文字
颜色走 —— 不写任何样式表也是对的尺寸、对的颜色。`size` 只是给某一个调用点换盒子；`color` 只是覆盖
继承值。`inheritAttrs` 保持打开，`class`、`style`、ARIA 属性都会落到根元素上，和消费一个普通元素
的预期一致。

两点细节值得知道：

- 根元素是 `<i class="s-icon">`，不是 `<el-icon>`。这个包的全部意义就是提供 Element Plus 没有的
  图标，所以它不能依赖 Element Plus 才能画出来；但它也继承了和 `<el-icon>` 一样的行为（跟着
  `color` / `font-size` 走，可以嵌进 `<el-icon>` 里），并且样式表里有一条
  `.s-icon > svg { width: 1em; height: 1em }` 兜住插槽里那些没写尺寸的 SVG（没有尺寸的 SVG 默认
  是 300×150px）。
- `.s-icon` 没有默认 margin。0.1.x 的 `.s-icon { margin: 0 5px }` 会在宿主页的每个图标周围
  静默多出空隙；间距属于调用点，不属于图标。

### 与 Element Plus 图标混用

两套图标是互补的，所以「一个页面里同时出现两套」不是异常而是常态。`icon` 接受任何组件，于是四种
写法都成立：

| 场景 | 写法 | 为什么可以 |
| --- | --- | --- |
| 本包图标（首选） | `<SIcon :icon="IconVariable" />` | 组件是 import 进来的，编译期已知，最好摇树 |
| Element Plus 图标 | `<SIcon :icon="ElIconEdit" />` | `icon` 就是一个组件，不关心它来自哪个包 |
| 放进 `el-icon` | `<el-icon><SIcon :icon="ElIconSearch" /></el-icon>` | `SIcon` 跟着 `font-size` 走，嵌进去尺寸自动对齐 |
| 已注册的名字 | `<SIcon icon="IconVariable" />` | 名字走 Vue 的组件注册表，需要 `app.use(SnailVue)` 或自己 `app.component` 注册 |

<DemoBlock
  title="四种解析方式"
  description="前三种不需要任何注册；第四种需要名字已经在当前 app 上注册过。"
  :code="iconElementPlusSource"
>
  <IconElementPlus></IconElementPlus>
</DemoBlock>

::: warning 本包不依赖 @element-plus/icons-vue
上表的第二种、第三种写法用的是 Element Plus 的图标包，它**不是** `@snail-js/vue` 的依赖，
需要你自己安装。反过来也成立：本包不 import 它，所以只用本包图标时它不会进你的 bundle。
:::

## 图标集

70 个图标，全部在 `packages/vue/src/icon/icons/` 下，一个文件一个图标，文件名前面加 `Icon` 就是
组件名（`Variable.vue` → `IconVariable`）。它们都是普通的 SVG 组件，`import` 进来当组件用是最直接
的用法。

<DemoBlock
  title="浏览图标集"
  description="iconComponents 的键就是 IconName 的全部成员，所以可以直接遍历。"
  :code="iconBrowseSource"
>
  <IconBrowse></IconBrowse>
</DemoBlock>

### 导出与类型

| 导出 | 类型 | 用途 |
| --- | --- | --- |
| `IconAccount` … `IconWorkflow` | 组件 | 70 个具名导出，一个文件一个 |
| `iconComponents` | `as const` 的字面量对象 | 按键遍历、按名字查组件；插件注册的就是它 |
| `IconName` | `keyof typeof iconComponents` | 图标名的联合类型，`<SIcon icon="…">` 的补全来源 |
| `IconComponentMap` | `Readonly<Record<string, Component>>` | 结构化类型，给「我要遍历整个集合」的消费方用 |

### 这些图标为什么存在

因为 `@element-plus/icons-vue` 里没有它们。0.1.x 的图标集有 91 个，其中 21 个是 Element Plus 已经
提供的字形，那些被**删除**了 —— 两套图标因此是互补的，同时装两套也不会出现两个同名图标互相覆盖。

大致可以分成几类：

| 类别 | 例子 |
| --- | --- |
| 表格与行列 | `IconTable`、`IconAddColumnBefore`、`IconAddColumnAfter`、`IconDeleteColumn`、`IconDeleteRow`、`IconMergeCells`、`IconUnmergeCells`、`IconHistogramBlock` |
| 页面设置 | `IconNewPage`、`IconPageMargin`、`IconPageOrientation`、`IconPageSize`、`IconShrinkScreen` |
| 合同业务 | `IconContract`、`IconVariable`、`IconQRCode`、`IconCoins`、`IconTransferAccounts`、`IconExpenseAccount`、`IconFinancial`、`IconFinance`、`IconCashPayment`、`IconApprove`、`IconSign`、`IconProcess` |
| 组织与权限 | `IconAccount`、`IconCompany`、`IconUserGroup`、`IconPermission`、`IconPermissionFill`、`IconEmpower`、`IconEmpowerFill`、`IconManage` |
| 文件与格式 | `IconExcel`、`IconWord`、`IconPdf`、`IconFileUpload`、`IconFileUploadFill`、`IconFileDownload`、`IconFileDownloadFill`、`IconCloudUpload`、`IconCloudDownload` |
| 品牌与状态 | `IconSnail`、`IconSnailFill`、`IconSnailFull`、`IconSnailSolid`、`IconWechat`、`IconWifi`、`IconOk`、`IconDashboard`、`IconDashboardSolid` |

完整清单用上面的示例直接看 —— 它就是 `iconComponents` 本身，不会和源码脱节。

### 重新生成

图标桶是**生成物**，文件头也这么写着：do not edit by hand。新增或删除 `.vue` 文件之后，在
`packages/vue` 下运行：

```bash
node ./scripts/generate-icons.mjs
```

它按文件名的字典序重写 `src/icon/icons/index.ts`（三部分：`import`、具名 `export`、`iconComponents`
字面量），末尾的 `IconName` 与 `IconComponentMap` 是固定模板。生成器刻意**不**用 Vite 的
`import.meta.glob({ eager: true })`：eager glob 会把每一个图标都拉进每一个使用者的 bundle，而那正是
这个包要避免的摇树失败。显式列表让打包器只看得到你真正 import 的那几个。

## SClickCopy

复制到剪贴板，并且让「成功/失败」这件事**看得见、也读得出来**。

<DemoBlock
  title="基础用法"
  description="text 属性 + 成功/失败事件；文案在成功后就地替换成 successMessage。"
  :code="clickCopyBasicSource"
>
  <ClickCopyBasic></ClickCopyBasic>
</DemoBlock>

<DemoBlock
  title="富文本、插槽作用域与程序化调用"
  description="html 只是加分项；插槽作用域给出 state / label / copy；模板 ref 上暴露了 copy()。"
  :code="clickCopyAdvancedSource"
>
  <ClickCopyAdvanced></ClickCopyAdvanced>
</DemoBlock>

### 属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `text` | `string` | — | 要复制的文本；与默认插槽二选一 |
| `html` | `string` | — | 同一份内容的 `text/html` 版本，仅在浏览器支持 `ClipboardItem` 且富文本写入成功时使用 |
| `source` | `"text" \| "slot"` | `"text"` | 从哪个来源取值；`text` 为空时无论如何都会退回插槽文本 |
| `label` | `string` | `"复制"` | 空闲态文案，同时是控件的无障碍名字 |
| `successMessage` | `string` | `"复制成功"` | 成功后就地替换 `label` |
| `errorMessage` | `string` | `"复制失败"` | 失败后就地替换 `label` |
| `duration` | `number` | `1500` | 反馈文案停留的毫秒数 |
| `disabled` | `boolean` | `false` | 禁止激活，并把控件移出 Tab 顺序 |

### 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `success` | `ClickCopySuccessPayload`：`{ text: string; html?: string; source: "text" \| "slot" }` | 剪贴板**真的**写入成功 |
| `error` | `ClickCopyErrorPayload`：`{ error: unknown; text: string }` | 所有路径都失败，或者根本没有内容可复制 |

### 插槽

默认插槽的作用域是 `ClickCopySlotProps`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `state` | `"idle" \| "success" \| "error"` | 当前反馈状态，插槽里的内容可以据此换样式 |
| `label` | `string` | 当前应该可见的文案（`label` 或成功/失败文案） |
| `copy` | `() => Promise<boolean>` | 从插槽内部触发一次复制 |

### 暴露的方法

| 成员 | 类型 | 说明 |
| --- | --- | --- |
| `copy` | `() => Promise<boolean>` | 立刻复制，效果与用户点击完全一致；只有某条路径**真的**成功才返回 `true` |
| `state` | `ClickCopyState` | 当前反馈状态（Vue 会在公开实例上解包这个 ref） |

### 复制是怎么成功的

按顺序尝试三条路径，任何一条真正成功才算成功：

1. `navigator.clipboard.write([new ClipboardItem({…})])` —— 同时写 `text/html` 与 `text/plain`；
2. `navigator.clipboard.writeText(text)`；
3. 一个临时 `<textarea>` + `document.execCommand("copy")` —— 已废弃，但它是**明文 http 源、
   多数 WebView、未获授权的非顶层 frame** 里唯一还能用的路径，而那些环境里
   `navigator.clipboard` 干脆不存在（不是「调用失败」，是「没有这个属性」）。

只有第 3 条返回了真实结果才算成功，这一点和 0.1.x 不同：那时的代码 `await` 一个不存在的
`navigator.clipboard`，异步抛出，界面毫无反应，`clearTimeout` 还写在定时器自己的回调里。
`html` 因此只会让复制**更有可能**成功，永远不会让它失败 —— 富文本写不进去就退回纯文本。

### 无障碍与 DOM

根元素永远是同一个 `<span class="s-click-copy" role="button">`，成败只改它的类名和文案，所以
状态切换不会销毁用户刚点过的那个节点、焦点也不会掉回 `<body>`。文案本身带
`aria-live="polite"`：换字**就是**反馈，不再放一个视觉隐藏的节点重复播报。

用 `role="button"` 的 span 而不是真正的 `<button>`，是因为它经常被放进 `<button>`、`<a>` 或表格
单元格里，而那些位置不允许嵌套交互元素。Enter 与 Space 由组件自己处理（并阻止 Space 滚动页面）。
`disabled` 时 `tabindex` 变成 `-1` 并带上 `aria-disabled`。

可用的类名钩子：`.is-success`、`.is-error`、`.is-disabled`，以及修饰符 `is-overlay`。

::: tip 从 0.1.x 的 `s-click-copy` 迁过来
0.1.x 会把 `.s-click-copy-parent` 写进**消费方的** `parentElement` 且从不移除，只为让样式表里一条
hover 规则能找到它。那个钩子没有了。要做「容器角上的悬浮复制按钮」，把容器设成
`position: relative`，再给控件加 `class="is-overlay"` 即可。
:::

## AliCaptcha

一个组件，两个产品，由 `product` 属性显式选择。

| | `product: "pnvs"` | `product: "captcha2"` |
| --- | --- | --- |
| 产品 | 号码认证服务 图形验证码 | 验证码 2.0（V3 架构） |
| loader | `ct4.js`，由你自己托管 | 阿里云 CDN 上的 `AliyunCaptcha.js` |
| 全局配置 | — | `window.AliyunCaptchaConfig = { region, prefix }`，必须在脚本标签之前设置 |
| 入口 | `window.initAlicom4(config, handler)` | `window.initAliyunCaptcha(config)` |
| 成功结果 | `onSuccess` + `getValidate()` | `success(captchaVerifyParam)` |
| 实例方法 | `showCaptcha` / `reset` / `destroy` | `show` / `hide` / `refresh` / `destroyCaptcha` |

两个产品的 props 是**可辨识联合**：PNVS 没有 `sceneId`，验证码 2.0 没有 `captchaId`，TypeScript
会直接拒绝混着写，而不是让 SDK 在运行时报错。

### 验证码 2.0

<DemoBlock
  title="captcha2（验证码 2.0）"
  description="没有真实控制台凭据时不会挂载组件 —— 填上 SceneId 与 prefix 之后它才会加载 SDK 并初始化。"
  :code="aliCaptcha2Source"
>
  <AliCaptcha2></AliCaptcha2>
</DemoBlock>

### 号码认证 PNVS

<DemoBlock
  title="pnvs（号码认证服务）"
  description="ct4.js 不再内置：必须由你自己的站点托管，再把 URL 交给 scriptSrc。"
  :code="aliCaptchaPnvsSource"
>
  <AliCaptchaPnvs></AliCaptchaPnvs>
</DemoBlock>

### 属性

两个产品共有的：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `product` | `"pnvs" \| "captcha2"` | — | **必填**，决定下面哪一组属性生效 |
| `disabled` | `boolean` | `false` | 禁用内置的触发按钮 |

`product: "pnvs"`：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `captchaId` | `string` | — | 号码认证服务控制台的验证码 id |
| `scriptSrc` | `string` | — | 你托管的 `ct4.js` 地址。**缺少它只会得到一个 `missing-script-src` 错误事件**，没有默认值 |
| `handle` | `(captchaObj: CaptchaObj) => void` | — | 旧式回调，拿到实例时调用一次；`ready` 事件做的是同一件事 |

`product: "captcha2"`：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `sceneId` | `string` | — | 验证码 2.0 控制台的 `SceneId` |
| `prefix` | `string` | — | 控制台概览页的**身份标**。它不是资源路径：SDK 拿它拼自己的请求域名，填成路径会让验证以「像网络错误」的方式失败 |
| `region` | `"cn" \| "sgp"` | `"cn"` | 数据驻留区域 |
| `mode` | `"popup" \| "embed"` | `"popup"` | 渲染模式；无痕验证只支持 `popup` |
| `element` | `string \| HTMLElement` | 组件自己的挂载节点 | 控件渲染到哪里；传选择器原样透传，传元素会补一个生成的 id |
| `button` | `string \| HTMLElement` | 组件自己的按钮 | 触发控件的东西；**即使用实例的 `show()` 也必须提供**，`embed` 模式下内置按钮是隐藏的（隐藏元素依然能收到程序化 click） |
| `scriptSrc` | `string` | 阿里云 CDN 地址 | 只在使用代理时覆盖 |
| `triggerLabel` | `string` | `"点击验证"` | 内置触发按钮的文案 |
| `handle` | `(instance: Captcha2Instance) => void` | — | 旧式回调，拿到实例时调用一次；`ready` 事件做的是同一件事 |

### 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `success` | `{ product: "pnvs"; result: CaptchaSuccessResult }` 或 `{ product: "captcha2"; captchaVerifyParam: string }` | 验证通过。`result` 就是 `getValidate()` 的返回值，`captchaVerifyParam` 必须交给服务端二次校验 |
| `fail` | `{ product: "pnvs" }` 或 `{ product: "captcha2"; result: unknown }` | 用户没通过，或 SDK 判定失败 |
| `error` | `AliCaptchaError` | 其他一切失败，永远带一个机器可读的 `code` |
| `close` | — | 用户关掉了控件 |
| `ready` | `AliCaptchaInstance` | 实例已存在，命令式方法从这一刻起可用 |

### 插槽

| 插槽 | 说明 |
| --- | --- |
| `trigger` | 内置触发按钮的内容（只在 `captcha2` 下渲染） |

### 暴露的方法

| 成员 | 说明 |
| --- | --- |
| `show()` | 打开验证：PNVS 是 `showCaptcha()`，验证码 2.0 是 `show()`。实例还不存在时发一个 `not-ready` 错误事件，而不是静默什么都不做 |
| `hide()` | 关闭验证。实例不存在时是 no-op —— 「隐藏一个从没显示过的东西」不值得报错 |
| `reset()` | 重新布防：PNVS 是 `reset()`，验证码 2.0 退化为 `refresh()` |
| `refresh()` | 刷新验证：验证码 2.0 是 `refresh()`，PNVS 退化为 `reset()` |
| `instance` | 活的 SDK 实例，挂载完成前或卸载后是 `null` |

两个产品的实例方法名重叠但不同，而且 PNVS 的 loader 是消费方托管的第三方构建，编译期不可能知道
具体版本，所以每个调用都是特征检测：按顺序试第一个存在的方法。这就是上表里 `reset` 与 `refresh`
互相退化的原因。

### 错误码

`error` 事件里的 `AliCaptchaError` 带 `code`，可以不用匹配文案就分支处理：

| `code` | 什么时候出现 |
| --- | --- |
| `invalid-props` | 缺 `captchaId`（pnvs），或缺 `sceneId` / `prefix`（captcha2） |
| `missing-script-src` | `product="pnvs"` 但没给 `scriptSrc` |
| `script-load-failed` | 脚本加载失败，或加载完却没有定义预期的全局函数 |
| `script-timeout` | 10 秒内没有变为可用（`DEFAULT_SCRIPT_TIMEOUT_MS`） |
| `init-failed` | SDK 初始化失败，或它自己报了错 |
| `not-ready` | 在 `ready` 之前调用了 `show()` |
| `unsupported-environment` | 在浏览器之外的文档里尝试加载脚本 |

### 脚本与生命周期

- **每页每个 URL 只加载一次。** 阿里云明确要求「请勿重复引入，重复引入可能导致验证失败」，所以
  脚本加载是一个按 URL 引用计数的池：同一 URL 的多个验证码共用一次加载、一个 `<script>` 标签，
  卸载时释放租约。`acquireScript` 也导出了 —— 需要提前预热（组件还没进 DOM）时，用它申请同一个
  URL，池会把两边合成一次加载。
- **不再内置任何 SDK。** 0.1.x 把一个 14.9 KB 的第三方 `ct4.js`（Geetest 派生）冻在 npm 包里，
  没有出处说明也没有升级路径；现在 PNVS 的 loader 由你自己托管，验证码 2.0 用阿里云 CDN 的地址
  （官方建议动态加载而不是自托管，因为那个 bundle 会为安全原因在服务端更新）。
- **props 只在挂载时读一次。** 阿里云不允许重新初始化同一个场景，所以改 `sceneId` / `captchaId`
  不会触发重新初始化；场景真的变了就换 `:key` 重新挂载。
- **SSR 安全。** 模块导入时不碰 `window` / `document`，初始化从 `onMounted` 才开始；在服务端渲染
  时拿到的是一个 `error` 事件，而不是让渲染崩掉。
- **卸载是尽力而为的销毁。** `hide` / `hideCaptcha` 与 `destroyCaptcha` / `destroy` 都会试一遍
  （V3 架构没有文档化的 `destroy`），并且一定会释放脚本租约 —— 0.1.x 每次卸载都漏掉注入的标签、
  超时定时器和监听器。

## SPopUpMenu

右键菜单，分三层，可以只用其中一层：

| 层 | 文件 | 里面有什么 |
| --- | --- | --- |
| 纯状态机 | `menu.ts` | `createItemSnapshot`、`resolveItems`、`runCommand` —— 不 import Vue、不碰 DOM，可以在纯 Node 里单测 |
| 展示层 | `ContextMenu.vue` / `MenuItem.vue` | `SContextMenu`、`SContextMenuItem`，接收**已解析**的行，负责键盘模型与 Floating UI 定位 |
| 命令式工厂 | `SPopUpMenu.ts` | `createContextMenu`、旧名字 `SPopUpMenu`、`closeAllContextMenus` |

<DemoBlock
  title="基础用法"
  description="在区域里点右键打开；也可以不传指针（锚定焦点元素），并且能程序化关闭。"
  :code="popupMenuBasicSource"
>
  <PopupMenuBasic></PopupMenuBasic>
</DemoBlock>

<DemoBlock
  title="异步权限与异步命令"
  description="display / enabled 是函数时先隐藏后解析；命令被 await，失败会保留菜单并把错误报一次。"
  :code="popupMenuAsyncSource"
>
  <PopupMenuAsync></PopupMenuAsync>
</DemoBlock>

### 打开一个菜单

```ts
import { createContextMenu } from "@snail-js/vue";

const handle = createContextMenu<RowContext>(options, items, event);
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `options` | `SPopUpMenuOptions<TContext>` | 菜单级选项，见下表 |
| `items` | `SPopUpMenuItemOptions<TContext>[]` | 行，惰性解析：菜单立刻在指针处打开，异步判定结束后行才出现 |
| `pointer` | `MouseEvent \| { clientX, clientY } \| { x, y }` | 打开位置。**省略它就是键盘调用的情形**，菜单锚定到当前焦点元素的底边；什么都没有时锚定视口中心 |

返回 `SPopUpMenuHandle`：

| 成员 | 说明 |
| --- | --- |
| `close()` | 关闭这个菜单（连同它的子菜单）。**幂等**，关掉之后再调也不会出错 |
| `isOpen` | 这个菜单是否还开着 |

`SPopUpMenu` 是同一个函数的旧名字，`SPopUpMenu(options, items)` 这种两参数调用依然编译得过，
只是拿不到按指针定位（第三个参数传事件即可）。另外导出 `closeAllContextMenus()`，用于路由切换或
打开弹窗之前一次性收干净，没有菜单开着时也安全。

### 菜单选项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `width` | `number` | 由内容决定 | 面板固定宽度（px） |
| `minWidth` | `number` | 样式表的 `120px` | 面板最小宽度（px） |
| `align` | `"left" \| "center" \| "right"` | `"left"` | 面板内文字对齐（`TextAlign` 是这个类型的旧别名） |
| `context` | `TContext` | — | 交给每个 `command` 的唯一参数 |
| `closeOnClick` | `boolean` | `true` | 激活一行后是否关闭；行自己的设置优先 |
| `onError` | `(error: unknown, item?: SPopUpMenuItemOptions<TContext>) => void` | — | 每一次判定失败与每一次命令失败都会报一次。**报错器自己抛异常不会影响菜单** |
| `loadingText` | `string` | `"加载中…"` | 第一轮解析还在飞、又什么都还没显示时的提示行 |
| `zIndex` | `number` | `--s-z-index-context-menu` | 面板层级；子菜单按深度往上加 |
| `position` | `{ x: number; y: number }` | — | 不传指针时的兜底打开位置（视口坐标，同 `clientX` / `clientY`） |

### 行选项

`SPopUpMenuItemOptions<TContext>`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `label` | `string` | 行文字；`separator` 行渲染时不显示文字 |
| `icon` | `Component \| IconName \| (string & {})` | 经 `SIcon` 渲染。字符串先在本包图标集里查，查不到再交给 Vue 的全局注册表 |
| `hoverColor` | `string` | 单行 hover 颜色，以行内自定义属性写入。保留兼容用，新代码请改主题里的 `--s-color-primary` |
| `display` | `boolean \| ((context) => boolean \| Promise<boolean>)` | 这一行是否显示。**是函数时先隐藏，解析完才决定**（fail-closed） |
| `enabled` | `boolean \| ((context) => boolean \| Promise<boolean>)` | 这一行是否可激活。是函数时先禁用，解析完才决定 |
| `command` | `(context: TContext) => void \| Promise<void>` | 激活时调用。返回的 Promise 会被 `await`：期间该行显示忙碌态，**失败保留菜单**、成功才关（除非 `closeOnClick` 是 `false`） |
| `children` | `SPopUpMenuItemOptions<TContext>[]` | 子菜单，任意层级。带 `children` 的行不会执行 `command` |
| `separator` | `boolean` | 渲染成分隔线，忽略 `label` / `command` / `display` |
| `danger` | `boolean` | 用危险色渲染（破坏性命令） |
| `disabled` | `boolean` | 静态禁用，等价于 `enabled: false` |
| `closeOnClick` | `boolean` | 单行覆盖菜单级的 `closeOnClick` |
| `id` | `string` | 跨多次解析保持稳定的行标识（键盘高亮与焦点用）；不传会自动生成 |

### 反着失败，而不是顺着失败

0.1.x 的判定默认值全是 `true`：行一开始就是可见、可点，`display()` 的 reject 没有处理函数。后果
比看上去严重 —— 一个「还没拿到权限」的行在解析期间**是可以点的**，而一次 reject 会留下 unhandled
rejection，并且让那一行**永远**可见、可点。

现在的规则是反过来的：

- `display` 是函数的行，解析完成之前**不显示**；
- `enabled` 是函数的行，解析完成之前**不可激活**；
- 解析抛错 → 这一行隐藏或禁用，并且通过 `onError` **恰好报一次**；
- 菜单先在指针处打开，再等判定结果，所以「右键立刻有反应」和「权限不能提前点」同时成立。

### 键盘与关闭

| 按键 | 行为 |
| --- | --- |
| ↑ / ↓ | 在当前面板内移动焦点（循环） |
| Home / End | 跳到第一行 / 最后一行 |
| → | 展开当前行的子菜单（该行有子菜单且可用时） |
| ← | 有子菜单就收起它；根菜单上则请求关闭整个菜单 |
| Enter / Space | 就是按钮自身的激活行为（行是真正的 `<button role="menuitem">`） |
| Escape | 关闭整个菜单栈。它在**组件之外的** `document` 捕获阶段监听，所以焦点已经跑出面板时也能关 |

除此之外，`pointerdown`（捕获阶段）落在菜单之外时关闭所有菜单 —— 捕获阶段是为了让菜单先关掉，再
把这次点击交给用户点到的东西。关闭时焦点会还给打开菜单之前的那个元素，键盘用户不会掉回 `<body>`。

同一时刻只允许一个根菜单：打开新菜单会先关掉旧的，这也正是右键菜单该有的行为。

### 直接渲染展示层

`SContextMenu` 可以脱离工厂单独使用，接收的是解析后的行（`ResolvedMenuItem[]`）：

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `items` | `ResolvedMenuItem[]` | — | 要渲染的行 |
| `reference` | Floating UI 的参考元素 | `null` | 虚拟元素（在指针处打开）或真实元素（子菜单） |
| `placement` | Floating UI 的 `Placement` | `"bottom-start"` | 优先放置位置 |
| `width` / `minWidth` | `number` | — | 面板宽度 |
| `align` | `MenuTextAlign` | `"left"` | 文字对齐 |
| `busyId` | `string \| null` | `null` | 正在执行命令的那一行 |
| `loadingText` | `string` | `"加载中…"` | 加载提示文案 |
| `loading` | `boolean` | `false` | 是否还有一轮解析在飞 |
| `zIndex` | `number` | — | 面板层级 |
| `autofocus` | `boolean` | `true` | 挂载后聚焦第一个可用行 |
| `depth` | `number` | `0` | 嵌套深度，只用来让子菜单压在父面板之上 |

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `activate` | `id: string` | 某一行被激活 |
| `close` | — | 面板请求关闭（根列表上按 ←） |
| `keepOpen` | — | 指针进入本面板，取消待执行的 hover 关闭 |

`SContextMenuItem` 是内部的一行，props 是 `{ item, active, busy, expanded? }`，事件是 `activate`
与 `hover`；它不会被插件注册，应用通常不需要直接写它。

定位用 `@floating-ui/vue`：`offset(4)` + `flip({ padding: 8 })` + `shift({ padding: 8 })` +
`size({ padding: 8 })`，`strategy: "fixed"`，并用 `autoUpdate` 跟随滚动、缩放与动画。面板被
teleport 到 `<body>`，所以 `overflow: hidden` 或带 `transform` 的祖先不会裁掉它；`size` 中间件
会把面板高度压到可用空间以内并让列表滚动，而不是让一个大菜单跑到屏幕外面去。

## SWordCloud

绕球面旋转的 3D 词云。那个投影外观（均匀球面分布 + `D / (D - z)` 透视）是逐字节保留下来的，改造的
是**它怎么动**。

<DemoBlock
  title="基础用法"
  description="不传 radius 时填满父容器宽度并按 1:1 取半径；点击与 start() / stop() 都能看到。"
  :code="wordCloudBasicSource"
>
  <WordCloudBasic></WordCloudBasic>
</DemoBlock>

<DemoBlock
  title="权重、颜色与尺寸范围"
  description="权重按排名归一化；color 钉住单个词；colors 是循环使用的调色板。"
  :code="wordCloudCustomSource"
>
  <WordCloudCustom></WordCloudCustom>
</DemoBlock>

### 属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `words` | `readonly (string \| { text: string; weight?: number; color?: string })[]` | `[]` | 要渲染的词。字符串就是默认权重的词 |
| `hotWords` | `readonly string[]` | — | **已废弃**的 `words` 别名，只为让 0.1.x 的调用还能编译；两个都给时 `words` 生效，并在 DEV 下打一条警告 |
| `radius` | `number` | 由父容器宽度推导 | 球半径（px）。省略时填满父容器宽度、按 `aspect-ratio: 1` 取半径 —— 大多数布局要的就是这个；0.1.x 强制要求这个属性并渲染一个 `2 * radius` 的盒子 |
| `baseFontSize` | `number` | `16` | `scale === 1` 时的字号（px） |
| `fontSizeRange` | `readonly [number, number]` | — | 逐帧字号的下限与上限（在 `baseFontSize` 与深度缩放之后生效）。两端顺序无关，内部会排序 |
| `speed` | `number` | `5` | `1…10` 的转速刻度，超出范围会被夹住 |
| `colors` | `readonly string[]` | 主题的五个状态色 | 按词的下标循环取色的调色板 |
| `pauseOnHover` | `boolean` | `true` | 指针悬停时暂停 |

### 事件

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `wordClick` | `{ text: string; index: number; weight: number; event: MouseEvent }` | 某个词被点击。`weight` 是归一化后的 `0…1` |

### 暴露的方法

| 成员 | 说明 |
| --- | --- |
| `start()` | 开始（或继续）旋转；只要还有暂停条件成立就是 no-op |
| `stop()` | 停下，词留在原地；重复调用安全 |
| `isRunning` | 循环当前是否在跑 |

### 权重与颜色

权重是**相对重要程度**，不是绝对值：`12` 和 `1200` 一样合法，内部按排名归一化到 `0…1`，所以
原始词频可以直接丢进来。用排名而不是 min/max 缩放，是因为真实词频是长尾分布 —— min/max 会把除了
最大的那个词以外的所有词都压到尺寸区间的最底部。全部权重相等时统一取 `1`（区间顶部），而不是
除以零。

颜色按词的下标**确定性地**取：`color` 钉住单个词，否则用 `colors` 循环，再否则用内置调色板
（`--s-color-primary`、`--s-color-success`、`--s-color-info`、`--s-color-warning`、`--s-color-danger`
五个令牌的引用，所以它跟着应用主题走而不需要重建）。0.1.x 的 `randomColor()` 是在渲染函数**里面**
调的，于是任何一次重渲染 —— hover、resize、父组件更新 —— 都会把整个词云的颜色重新洗一遍。

### 动画

- 整个词云只有**一个** `requestAnimationFrame` 循环，所有标签的帧在同一个回调里算完。0.1.x 是
  每个标签一个 `setInterval`（15ms 周期），而且每个标签的 `style` getter 每帧都读
  `offsetWidth` / `offsetHeight`：N 个定时器 + N 次强制重排，永远如此。
- 旋转的是**单位方向**，每帧重新归一化，所以标签不可能飞出球面。0.1.x 把已经改过的 `z` 喂给下一次
  旋转且从不归一化，`scale = D / (D - z)` 会在 `z` 接近直径时失控，把标签甩出盒子。
- 尺寸只在布局变化时测一次（挂载、容器 resize、字体加载完成、词表或尺寸属性变化），绝不在每帧里测。
- 指针悬停（`pauseOnHover`）、词云不在视口内（`IntersectionObserver`）、标签页隐藏、以及
  `prefers-reduced-motion` 下循环都会停；最后一种情况会静态画一次，然后停住不动。
- 卸载时循环、观察者、监听器全部拆掉。0.1.x 的 `onUnmounted` 只清了两个定时器中的一个，
  组件销毁后动画还在跑。

### SWordTag

`SWordTag` 也导出了，它单独看就是一个「绝对定位、带深度缩放的文字标签」，但它的公共契约是围绕词云
设计的：它自己不持有定时器、旋转状态或测量循环，只暴露四个成员。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `text` | `string` | 词文字 |
| `color` | `string` | 已经解析好的颜色 |

| 事件 | 参数 |
| --- | --- |
| `click` | `event: MouseEvent`（原生事件原样转发） |

| 暴露的成员 | 说明 |
| --- | --- |
| `place(frame)` | 应用一帧：`translate3d`、`opacity`、`font-size`、`font-weight`、`z-index` 一次性写完 |
| `measure()` | 当前字号下的渲染尺寸，只应在布局变化时调用 |
| `reset()` | 清掉行内字号，让标签回到继承的基准字号再测量 |
| `element` | 标签元素，挂载前是 `null` |

球面数学与颜色模型在 `wordCloud/model.ts` 里，刻意**没有**从包的入口再导出：它们是词云的内部实现，
每个函数接收的都是数字而不是组件数据。确实需要时按路径导入即可。

## 主题

所有设计令牌都是 CSS 自定义属性，挂在 `:root` 上，前缀 `--s-`。

### 令牌

| 分组 | 令牌 | 默认值 |
| --- | --- | --- |
| 调色板 | `--s-color-primary` | `var(--el-color-primary, #409eff)` |
| | `--s-color-success` | `var(--el-color-success, #67c23a)` |
| | `--s-color-warning` | `var(--el-color-warning, #e6a23c)` |
| | `--s-color-danger` | `var(--el-color-danger, #f56c6c)` |
| | `--s-color-info` | `var(--el-color-info, #909399)` |
| 文字 | `--s-color-text-primary` | `var(--el-text-color-primary, #303133)` |
| | `--s-color-text-regular` | `var(--el-text-color-regular, #606266)` |
| | `--s-color-text-secondary` | `var(--el-text-color-secondary, #909399)` |
| | `--s-color-text-disabled` | `var(--el-text-color-disabled, #c0c4cc)` |
| | `--s-color-text-inverse` | `#ffffff` |
| 表面与描边 | `--s-color-bg` | `var(--el-bg-color, #ffffff)` |
| | `--s-color-bg-hover` | `var(--el-fill-color-light, #f5f7fa)` |
| | `--s-color-bg-disabled` | `var(--el-fill-color-lighter, #fafafa)` |
| | `--s-color-border` | `var(--el-border-color, #dcdfe6)` |
| | `--s-color-border-light` | `var(--el-border-color-lighter, #ebeef5)` |
| | `--s-color-border-strong` | `rgba(0, 0, 0, 0.15)` |
| 圆角 | `--s-radius-sm` / `-md` / `-lg` / `-full` | `2px` / `4px` / `8px` / `9999px` |
| 间距 | `--s-space-xs` / `-sm` / `-md` / `-lg` / `-xl` | `4px` / `8px` / `12px` / `16px` / `24px` |
| 字体 | `--s-font-size-xs` / `-sm` / `-md` / `-lg` | `12px` / `13px` / `14px` / `16px` |
| | `--s-font-family` | `inherit` |
| | `--s-line-height` | `1.5` |
| 阴影 | `--s-shadow-md` | `0 6px 12px rgba(0, 0, 0, 0.175)` |
| 层级 | `--s-z-index-context-menu` | `3000` |
| | `--s-z-index-captcha` | `3100` |

### 和 `--el-*` 的关系

凡是用到 Element Plus 自己调色板的地方，令牌都写成 `var(--el-…, <回退值>)`：

- 装了 Element Plus 的应用里，`--s-*` **自动跟着** Element Plus 主题走，不会和它打架；
- 没装 Element Plus 的应用里，回退值就是 Element Plus 的默认色，观感一模一样，而这个包**不需要**
  它才能渲染。

所以「自定义主题」只有两种做法，都不需要重新编译这个库：

```css
:root {
  /* 覆盖本包的令牌 */
  --s-color-primary: #1e80ff;
  /* 或者只覆盖 Element Plus 的令牌，本包会跟着变 */
  --el-color-primary: #1e80ff;
}
```

层级令牌的理由是具体的：Element Plus 把 2000–2999 留给自己的弹层，右键菜单是**被下面那层打开**的，
所以它坐在 3000 —— 比 Element Plus 的弹层更高，但不会被它挤掉。

## 与 0.1.x 的差异

这是破坏性变更的完整清单。要么按单子改一遍，要么暂时留在 0.1.x。

| 项 | 0.1.x | 现在 |
| --- | --- | --- |
| `STab` / `STabItem` | 存在 | **已删除**，连同它们的样式。用 Element Plus 的 `el-tabs` |
| 组件命名 | 两套：注册名（kebab-case `.name`）与导出名（`S` 前缀），同一个组件可以从两个名字摸到 | 只有一套：**导出名**即组件名（`SIcon`、`SClickCopy`、`SContextMenu`、`AliCaptcha`、`SWordCloud`） |
| 图标集 | 91 个，其中 21 个是 Element Plus 已有的字形 | **70 个**，那 21 个重复的已删除，两套图标互补 |
| `@vueuse/core` | 依赖它（例如模块作用域的 `useMouse()`） | **已移除**，运行时依赖只剩 `@floating-ui/vue` |
| 右键菜单定位 | 自己量一次、只在右/下溢出时翻转，被 `transform` 祖先裁掉 | `@floating-ui/vue`：`offset` / `flip` / `shift` / `size` + `autoUpdate`，`strategy: "fixed"`，teleport 到 `<body>` |
| 验证码 SDK | 把 `ct4.js`（14.9 KB 第三方派生构建）冻在 npm 包里，每次挂载重定义全局函数 | **不再内置**：PNVS 必须提供 `scriptSrc`，验证码 2.0 从官方 CDN 加载；脚本按 URL 引用计数、每页只加载一次 |
| `element-plus` | peer 依赖 | **不是**依赖也不是 peer。`peerDependencies` 只有 `vue >= 3.5.0`；`--s-*` 令牌引用 `--el-*` 时带回退值 |
| 样式表入口 | `index.css` 既没有出现在 `exports` 里，也没有被文档提过 | 真实导出的 `@snail-js/vue/style.css` |
| 令牌前缀 | `--snail-*`（外加八个中文名的 Sass 变量） | `--s-*`，纯 CSS 自定义属性，一个 Sass 变量都没有 |
| 页面级样式 | `body { margin: 0 auto; }` 之类的全局重置 | 全部删掉，规则都收在 `s-` 前缀下 |
| `SClickCopy` | 名字 `s-click-copy`；两个 `v-if` 根节点；成功时替换根节点导致焦点丢失；把 `.s-click-copy-parent` 写进宿主的 `parentElement` | 名字 `SClickCopy`；单一根节点；焦点与播报都保留；用修饰符 `is-overlay` 代替那个 DOM 钩子 |
| 词云 props | `hotWords: string[]` | `words`（`string \| { text, weight?, color? }[]`）。`hotWords` 作为废弃别名保留，两个都给时 `words` 生效 |
| 类型导出 | 组件几乎没有导出任何公共类型，包一层都难 | 每个组件的 props / emits / 插槽作用域 / 暴露方法都有具名类型，另有 `IconName`、`ResolvedMenuItem`、`AliCaptchaError` 等 |

还有两件「没变」的事值得说清楚，因为它们是这个包的立场而不是疏忽：

- **不生成、也不依赖响应式包装。** 组件该有多少 reactivity 就有多少：词云的每帧数据直接写 DOM，
  右键菜单的解析树是 `shallowRef`，验证码实例干脆不是 ref。把它们变成响应式只会给「形状从不改变
  的值」加上追踪开销。
- **不接管宿主页面。** 没有全局重置、没有全局事件监听器（0.1.x 在模块作用域装了一个
  `mousemove` 监听器，永远删不掉）、没有把 class 写到别人的 DOM 上。
