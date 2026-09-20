<script setup lang="ts">
import { getCurrentInstance } from "vue";
// 文档站已经在全局注册了 Element Plus，所以 <el-icon> 可以直接写。
import { Edit as ElIconEdit, Search as ElIconSearch } from "@element-plus/icons-vue";
import { IconVariable, SIcon, iconComponents } from "@snail-js/vue";

// 第四种用法要「按名字解析」，这个名字必须已经注册到当前 app 上。
// 真实项目里是 app.use(SnailVue) 一行的事（它把 70 个图标一次注册完）；
// 文档站只注册了 DemoBlock，所以这里单独注册演示用的那一个。
getCurrentInstance()?.appContext.app.component("IconVariable", iconComponents.IconVariable);
</script>

<template>
  <ul class="grid">
    <li>
      <SIcon :icon="IconVariable" :size="22" />
      <code>本包图标（组件）</code>
    </li>
    <li>
      <SIcon :icon="ElIconEdit" :size="22" />
      <code>Element Plus 图标（组件）</code>
    </li>
    <li>
      <el-icon :size="22"><SIcon :icon="ElIconSearch" /></el-icon>
      <code>SIcon 放进 el-icon</code>
    </li>
    <li>
      <SIcon icon="IconVariable" :size="22" />
      <code>已注册的名字（字符串）</code>
    </li>
  </ul>
</template>

<style scoped>
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--vp-c-text-1);
}

.grid li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.grid code {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
</style>
