<template>
  <div class="tab-container">
    <div class="tab-labels">
      <slot></slot>
    </div>
    <div class="tab-content">
      <template v-for="item in items" :key="item.name">
        <!-- <div v-if="activeTab === item.name"> -->
        <component v-if="activeTab === item.name" :is="item.content" />
        <!-- </div> -->
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { provide, ref, watch } from 'vue'

import { TabItem } from './typings'

const model = defineModel<string>({ required: true })
const activeTab = ref(model.value)
const items = ref<TabItem[]>([])

provide('activeTab', activeTab)
provide('registerItem', (item: TabItem) => {
  items.value.push(item)
})

watch(activeTab, (newVal) => {
  model.value = newVal
})
</script>

<style scoped lang="scss">
@use '../theme/style/variables.scss' as *;
$labels-height: 56px;
$active-color: #ffffff;
$default-color: #e2e8f8;

.tab-container {}

.tab-labels {
  width: 100%;
  height: $labels-height;
  display: flex;
  // flex-direction: column;
  position: relative;
  z-index: 2;
  border-radius: 12px 12px 0 0;
  background-color: $default-color;
  overflow: hidden;
}

.tab-content {
  background-color: #ffffff;
  padding: 16px;
  display: flex;
  // flex-direction: column;
  justify-content: flex-start;
  align-items: center;

  > * {
    margin-left: 10px;
  }
}
</style>