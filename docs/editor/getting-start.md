# 快速开始

## 安装

```bash
pnpm add @snail-js/editor
pnpm add element-plus vue
```

`element-plus`（`>=2.9.0`）和 `vue`（`>=3.5.0`）是 peer 依赖：由使用方提供，本包不重复安装
一份，避免同一页面出现两个 Element Plus 实例。

### 只需引入本包一个样式文件

组件内部**按需 import 自己用到的 Element Plus 组件**（`<script setup>` 的局部注册），组件样式也
由本包的样式表一起下发：

```ts
import "@snail-js/editor/style.css";
```

```ts
// main.ts
import { createApp } from "vue";
import "@snail-js/editor/style.css";
import App from "./App.vue";

createApp(App).mount("#app");
```

**不需要** `app.use(ElementPlus)`，也**不需要** `import "element-plus/dist/index.css"`：

- 全局注册整份 Element Plus 会让每个用到合同编辑器的页面都打进整套组件（约 1MB 的 JS/CSS）；
- 本包只声明自己渲染的那些组件与样式，`element-plus` 仍然是使用方提供的那一份，不会出现两个实例；
- 如果使用方本来就全局注册了 Element Plus（很多项目如此），两者并存也没有冲突：这里的 import 解析到
  的是同一份依赖。

Element Plus 组件自身的文案（颜色选择器的「确定 / 清空」等）由编辑器内部的 `el-config-provider`
提供，默认中文；使用方全局注册了别的语言包时，用 `element-locale` prop 传进来即可覆盖。


<script setup>
import BasicEditor from "./examples/basic-editor.vue";
import basicEditorSource from "./examples/basic-editor.vue?raw";
</script>

<DemoBlock title="最小可用示例" description="v-model 绑定的内容可以是 JSON 文档、HTML 字符串，或一整份 TemplateDocument。" :code="basicEditorSource">
  <BasicEditor />
</DemoBlock>