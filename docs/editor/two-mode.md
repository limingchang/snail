# 两种模式

<script setup>
import BasicEditor from "./examples/basic-editor.vue";
import basicEditorSource from "./examples/basic-editor.vue?raw";
import ModeSwitch from "./examples/mode-switch.vue";
import modeSwitchSource from "./examples/mode-switch.vue?raw";
import FillDialog from "./examples/fill-dialog.vue";
import fillDialogSource from "./examples/fill-dialog.vue?raw";
</script>

`mode` 默认是 `design`，页面 / 变量 / 二维码 / 水印 / 打印扩展默认注册，工具栏默认给出
`["template", "font", "paragraph", "insert", "table", "page", "watermark"]` 七组。

内容用 `createStarterDocument()` 装一份真实文档，第一次打开就能看到主标题、二级标题、正文、
金额变量（小写与中文大写各一次）、普通表格、无边框布局表和一个二维码 —— 空文档也能用，只是这些
能力都得自己先写一遍 ProseMirror JSON 才看得见。二维码节点只存**内容**，位图是异步生成的，所以
同步的工厂没法把它一起给你；宿主也不必为此做任何事：二维码扩展在文档打开后会为每一个「有载荷、
还没有位图」的节点补上位图，不需要谁记得调 `regenerateQRCode()`。

## 填写模式

填写模式的文档是只读的，工具栏默认不渲染，变量按值显示。唯一的例外是「模板」页签：模板如果
不是由 `template`（`kind: "remote"`）定死的，打印员就得能自己挑一份本机模板来填，所以那时只
渲染这一个页签。填写数据通过 `data` 传入，按变量的 `key` 查表（`company.name` 这样的点号路径
同样有效）。

<DemoBlock title="填写模式" description="点「打开填写对话框」可以看到按变量类型生成的表单。" :code="fillDialogSource">
  <FillDialog />
</DemoBlock>

同一个组件的两种用法，模式决定了几乎其他一切：

| | `design` 设计 | `fill` 填写 |
| --- | --- | --- |
| 用途 | 编写模板 | 填好并打印 |
| 文档 | 可编辑 | 只读 |
| 工具栏 | 按 `tools` 渲染 | 默认不渲染，只在模板没被 `template` 定死时渲染「模板」一个页签 |
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