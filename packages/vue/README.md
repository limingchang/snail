# @snail-js/vue

<p>
  <img src="https://img.shields.io/npm/v/%40snail-js%2Fvue?label=%40snail-js%2Fvue&labelColor=1e80ff&color=67C23A"></img>
  <img src="https://img.shields.io/npm/v/vue?label=vue&labelColor=1e80ff&color=67C23A"></img>
  <img src="https://img.shields.io/badge/TypeScript-1e80ff"></img>
</p>

[官方文档 | Document](https://limingchang.github.io/snail/)

Vue 3 组件库：补齐 Element Plus 缺失的图标，外加验证码、一键复制、右键菜单与 3D 词云。

## 安装

```bash
pnpm add @snail-js/vue
# 或
npm install @snail-js/vue
```

`vue >= 3.5.0` 是 peer 依赖，需要由应用自己安装。`@floating-ui/vue` 是本包的直接依赖，
随包自动安装。

样式是**一个**文件，且是真实的导出入口：

```ts
// main.ts
import "@snail-js/vue/style.css";
```

> 旧的 `@snail-js/vue/index.css` 既没有被 `exports` 导出、也没有出现在文档里，实际无法引入。
> 现在 `package.json` 的 `exports` 中有 `"./style.css": "./dist/style.css"`，构建也只会产出
> 这一个样式文件（不是每个组件一个）。

## 两种使用方式

**按需引入（推荐，可摇树）**

```vue
<script setup lang="ts">
import { SClickCopy, SIcon, IconVariable } from "@snail-js/vue";
</script>

<template>
  <SIcon :icon="IconVariable" />
  <SClickCopy text="要复制的文本" @success="onCopied" />
</template>
```

**全局注册**

```ts
import { createApp } from "vue";
import SnailVue from "@snail-js/vue";
import "@snail-js/vue/style.css";

createApp(App).use(SnailVue).mount("#app");
```

插件注册来自一个**静态组件表**，因此只引入 `SClickCopy` 的应用不会因为 `.use(SnailVue)` 之外
的原因把整套图标打进产物。`install` 会注册 `SIcon`、70 个图标组件、`SClickCopy`、`AliCaptcha`、
`SContextMenu`、`SWordCloud`、`SWordTag`。

## 组件列表

| 组件 | 说明 |
| --- | --- |
| `SIcon` | 图标包装器，接受组件、已注册的名字或插槽内容 |
| `SIcon` 图标集 | 70 个 `Icon*` 组件，同时导出 `iconComponents` 映射与 `IconName` 类型 |
| `SClickCopy` | 点击复制，带成功/失败反馈与无障碍状态播报 |
| `AliCaptcha` | 阿里云验证码，同时支持 PNVS 与验证码 2.0（V3） |
| `SPopUpMenu` | 函数式右键菜单，`@floating-ui/vue` 定位，支持任意层级子菜单 |
| `SWordCloud` | 3D 旋转立体词云 |
| `SWordTag` | 词云中的单个词，可独立使用 |

没有 `STab` / `STabItem`：这两个组件已从包中移除，样式也一并删除。

## 为什么需要这个图标库

`@element-plus/icons-vue` 已经有 293 个图标，本包不重复它们：**21 个重复图标被移除**，图标数从
91 降到 70。留下的都是 Element Plus 没有的字形 —— 表格/行列操作（`IconAddColumnAfter`、
`IconMergeCells`、`IconPageSize`…）、合同场景标记（`IconVariable`、`IconQRCode`、`IconSign`…）
以及品牌标记（`IconSnail*`、`IconWechat`…）。

所以两套图标是**互补**的，可以混用 —— `SIcon` 接受任何组件，包括 Element Plus 的图标组件：

```vue
<script setup lang="ts">
// Element Plus 的图标（@element-plus/icons-vue 导出的就是 Edit 这个名字）
import { Edit } from "@element-plus/icons-vue";
import { SIcon, IconVariable } from "@snail-js/vue";
</script>

<template>
  <!-- 直接传组件即可 -->
  <SIcon :icon="Edit" />

  <!-- 本包中 Element Plus 没有的图标 -->
  <SIcon :icon="IconVariable" />

  <!-- 交给 Element Plus 的容器 -->
  <el-icon><SIcon :icon="Edit" /></el-icon>
</template>
```

`SIcon` 自身是一个普通 `<i>`，继承 `color` 与 `font-size`，**不依赖 Element Plus**：没有安装
Element Plus 的应用也能正常渲染本包的图标。

## SClickCopy 一键复制

```vue
<SClickCopy
  text="订单号 A-1024"
  html="<b>订单号 A-1024</b>"
  label="复制订单号"
  success-message="已复制"
  @success="({ text }) => console.log(text)"
  @error="({ error }) => console.warn(error)"
/>
```

- `text` 优先；没有 `text` 时读取默认插槽的文本，也可以用 `source="slot"` 显式指定。
- `html` 存在且平台支持 `ClipboardItem` 时走富文本复制，**失败也会退回纯文本**，不会因为富文本
  不可用而复制不了。
- `navigator.clipboard` 只存在于安全上下文，因此同时提供了 `textarea` +
  `document.execCommand("copy")` 兜底；两条路径都失败才会触发 `error`。
- 通过模板 ref 可以拿到 `copy()` 主动复制：

```ts
const copyRef = ref<InstanceType<typeof SClickCopy>>();
await copyRef.value?.copy(); // true 表示真的写进剪贴板了
```

默认插槽是作用域插槽，作用域为 `{ state, label, copy }`。旧版会给父元素加上
`s-click-copy-parent` 类（且永不移除）；现在改为在组件自己的根元素上使用可选的 `is-overlay`
修饰类。

## AliCaptcha 阿里云验证码

两个产品用 `product` 区分，**两个 SDK 都不随包发布**，都是运行时按需动态加载：

```vue
<!-- 号码认证服务（PNVS）图形验证码 -->
<AliCaptcha
  product="pnvs"
  captcha-id="你的 captchaId"
  script-src="/vendor/aliyun/ct4.js"
  @success="({ result }) => verify(result)"
  @error="(error) => console.warn(error.code, error.message)"
/>

<!-- 验证码 2.0（V3 架构） -->
<AliCaptcha
  product="captcha2"
  scene-id="你的场景 ID"
  prefix="你的身份标"
  @success="({ captchaVerifyParam }) => verify(captchaVerifyParam)"
/>
```

- `product="pnvs"` 需要 `scriptSrc`：`ct4.js` 是第三方（Geetest 衍生）文件，旧版把它冻结在 npm
  包里，既没有出处也没有升级路径，现在必须由使用者自己托管并传入 URL，缺失时会抛出带
  `code: "missing-script-src"` 的可操作错误。
- `product="captcha2"` 从 `https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js`
  动态加载，并在插入 `<script>` **之前**写入 `window.AliyunCaptchaConfig = { region, prefix }`。
  回调是 V3 的 `success(captchaVerifyParam)` / `fail(result)`，不是 V2 的
  `captchaVerifyCallback`。`prefix` 是控制台的**身份标**，不是资源基础路径。
- 同一个页面上多个实例共享**同一个**脚本加载（模块级 promise + 引用计数），不会重复引入 ——
  阿里云文档明确禁止重复引入与重复初始化。
- 通过 ref 暴露 `show()` / `hide()` / `reset()` / `refresh()` / `instance`，各自映射到当前产品
  真实支持的方法（见类型注释）；事件为 `success`、`fail`、`error`、`close`、`ready`。
- 模块级代码不触碰 `window`/`document`，只有在 `onMounted` 之后才会初始化，可以安全地在 SSR 中
  导入。

## SPopUpMenu 右键菜单

```ts
import { SPopUpMenu } from "@snail-js/vue";

function onContextMenu(event: MouseEvent) {
  const menu = SPopUpMenu(
    { context: { id: 1 }, onError: (error) => console.warn(error) },
    [
      {
        label: "编辑",
        // 异步判定：解析完成前该项是**隐藏**的，不会先渲染出来再消失
        display: () => canEdit({ id: 1 }),
        command: async ({ id }) => {
          await api.save(id); // 命令可以是异步的，菜单会等待
        }
      },
      { label: "删除", danger: true, command: () => api.remove(1) }
    ],
    event // 传入事件即可在鼠标位置打开；不传则贴着当前焦点元素
  );

  // 需要时可以自己关掉
  menu.close();
}
```

- **异步判定是 fail-closed 的**：`display` 是函数时该项在解析完成前隐藏，`enabled` 是函数时
  在解析完成前禁用；判定抛错/拒绝时保持隐藏/禁用，并通过 `onError` 上报**一次**。
- **命令是真正被 await 的**：执行期间该项显示忙碌状态且不可重复触发；失败时菜单保持打开并
  上报错误，成功才关闭（除非 `closeOnClick: false`）。
- 子菜单支持任意层级，鼠标悬停和键盘（`→` / `←`）都能打开与返回。
- 定位使用 `@floating-ui/vue`：`offset` + `flip` + `shift` + `size`，配合 `autoUpdate` 在滚动、
  尺寸变化时重新定位，菜单被 teleport 到 `body`，`size` 会把过高的菜单限制成可滚动列表。
- 通过 `createContextMenu(options, items, event)` 也可以使用新名字，两者是同一个函数。
- 菜单打开时会记录焦点，关闭后焦点回到打开前的元素。

菜单项类型为 `SPopUpMenuItemOptions`：`label`、`icon?`、`hoverColor?`、`display?`、`enabled?`、
`command?`、`children?`、`separator?`、`danger?`、`disabled?`、`closeOnClick?`、`id?`；
菜单选项为 `SPopUpMenuOptions`：`width?`、`minWidth?`、`align?`、`context?`、`closeOnClick?`、
`onError?`、`loadingText?`、`zIndex?`、`position?`。全部类型都从包根导出。

## SWordCloud 3D 词云

```vue
<SWordCloud
  :words="[
    { text: '合同', weight: 120 },
    { text: '模板', weight: 40 },
    '签署'
  ]"
  :radius="160"
  :base-font-size="16"
  :colors="['#409eff', '#67c23a']"
  :pause-on-hover="true"
  @word-click="({ text }) => console.log(text)"
/>
```

- `words` 接受 `string[]` 或 `{ text, weight?, color? }[]`；旧名 `hotWords` 仍然可用（同时传入时
  以 `words` 为准并给出开发提示）。
- 整个词云只有**一个** `requestAnimationFrame` 循环，尺寸只在布局变化（`ResizeObserver`、字体
  加载完成、属性变化）时测量一次。
- 尊重 `prefers-reduced-motion`（渲染静态词云），鼠标悬停暂停（`pauseOnHover`，默认 `true`）、
  元素离开视口暂停、标签页隐藏暂停，卸载时全部取消。
- 颜色由词的下标决定，重新渲染不会重新洗牌；`colors` 可以整体替换调色板。

## 与 0.1.x 的差异

| 变化 | 说明 |
| --- | --- |
| 移除 `STab` / `STabItem` | 组件与样式一并删除 |
| 组件名只有一套 | 导出名就是组件名（`SIcon`、`SClickCopy`、`AliCaptcha`、`SPopUpMenu`、`SWordCloud`），不再同时维护 kebab-case 的 `.name` |
| 图标 91 → 70 | 移除 21 个 Element Plus 已提供的重复图标 |
| 不再依赖 `@vueuse/core` | 需要的小工具在包内自行实现 |
| 右键菜单改用 `@floating-ui/vue` | 定位、翻转、边界收缩、高度限制与滚动重定位都由它负责 |
| 不再内置验证码 SDK | `ct4.js` 由使用者通过 `scriptSrc` 托管；验证码 2.0 从阿里云 CDN 动态加载 |
| `element-plus` 不再是 peer 依赖 | 包内没有任何地方需要它；`SIcon` 在没有 Element Plus 的应用中同样可用 |
| 样式入口修正 | 真实导出的 `./style.css`；不再有 `body { margin: 0 auto }` 这类影响宿主页面的全局规则 |
| 全部公共类型导出 | 每个组件的 props / emits / 插槽 / 实例类型都可以从包根引入 |

## 类型与可访问性

- 所有组件的 `props`、`emits`、插槽作用域与命令式实例类型都从包根导出。
- 复制组件使用 `role="button"` + `tabindex`，`Enter`/`Space` 可触发，反馈文本通过
  `aria-live="polite"` 播报，成功/失败状态不会销毁获得焦点的元素。
- 右键菜单使用 `role="menu"` / `role="menuitem"` / `aria-disabled` / `aria-haspopup` /
  `aria-expanded`，支持方向键、`Home`/`End`、`Enter`/`Space` 与 `Escape`。

## 开发

```bash
pnpm install
pnpm --filter @snail-js/vue build      # 产出 dist/*.js + dist/style.css + dist/**/*.d.ts
pnpm --filter @snail-js/vue typecheck  # vue-tsc --noEmit
pnpm --filter @snail-js/vue test       # vitest（Node 环境，纯逻辑测试）
```

图标是生成的：在 `src/icon/icons/` 中增删 `.vue` 文件后运行
`node ./scripts/generate-icons.mjs`，测试会校验生成的索引与目录内容是否一致。

## 作者

- mc.lee
