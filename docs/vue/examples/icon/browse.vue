<script setup lang="ts">
import { computed, ref } from "vue";
import { SIcon, iconComponents } from "@snail-js/vue";
import type { IconName } from "@snail-js/vue";

// `iconComponents` 是生成出来的静态字面量，它的键就是 `IconName` 的全部成员。
const names = Object.keys(iconComponents) as IconName[];
const query = ref("");

const visible = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return keyword ? names.filter((name) => name.toLowerCase().includes(keyword)) : names;
});
</script>

<template>
  <div>
    <input v-model="query" type="search" placeholder="按名字筛选，例如 Document / Page / Snail" />
    <p class="count">共 {{ names.length }} 个，当前显示 {{ visible.length }} 个</p>

    <ul class="grid">
      <li v-for="name in visible" :key="name">
        <SIcon :icon="iconComponents[name]" :size="22" />
        <span>{{ name.replace(/^Icon/, "") }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
input {
  width: 100%;
  max-width: 320px;
  padding: 4px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.count {
  margin: 8px 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.grid li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 132px;
  font-size: 12px;
  color: var(--vp-c-text-1);
}
</style>
