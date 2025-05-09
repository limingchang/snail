<template>
  <div class="tab-label" :class="{ active: isActive }" @click="handleClick">
    {{ label }}
  </div>
</template>

<script setup lang="ts">
import { inject, computed, onMounted, Ref } from 'vue'

import { TabItem } from './typings'

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  }
})

const slots = defineSlots()
const activeTab = inject('activeTab') as Ref<string>
const registerItem = inject('registerItem') as (item: TabItem) => void

const isActive = computed(() => activeTab.value === props.name)

const handleClick = () => {
  activeTab.value = props.name
}

onMounted(() => {
  registerItem({
    name: props.name,
    content: slots.default
  })
})
</script>

<style scoped lang="scss">
@use '../theme/style/variables.scss' as *;
$labels-height: 56px;
$tab-label-height: 40px;
$active-color: #ffffff;
$default-color: #e2e8f8;

.tab-label {
  // flex: 1;
  height: $tab-label-height;
  line-height: $tab-label-height; // 垂直居中，兼容ie;
  // display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.2em;
  // opacity: 0.65;   // 暂时删除，不选中样式需要重新编写
  color: $snail-color-primary;
  position: relative;
  cursor: pointer;
  padding: 8px 15px;
  // padding-bottom: 0;

  &:not(.active) {
    background: #f0f0f0;
    border-bottom: 1px solid #ddd;
    border-radius: 8px;
    &::before {
      content: '';
      position: absolute;
      left: 5px;
      width: 12px;
      bottom: 0;
      height: $labels-height;
      background: $default-color;
      border-bottom-left-radius: 12px;
      transform: skewX(15deg);
    }
    &::after {
      content: '';
      position: absolute;
      right: 5px;
      width: 12px;
      bottom: 0;
      height: $labels-height;
      background: $default-color;
      border-bottom-right-radius: 12px;
      transform: skewX(-15deg); 
    }
  }

  &.active {
    z-index: 2;
    font-weight: bold;
    opacity: 1;
    background: $active-color;
    border-radius: 12px 12px 0 0;
    // box-shadow: 12px 35px 0 $active-color, -12px 35px 0 0 $active-color;
    // box-shadow: 5px $tab-height 0 5px $active-color;

    &::before{
      content: '';
      position: absolute;
      left: -5px;
      bottom: 0;
      width: 12px;
      height: $labels-height;
      border-top-left-radius: 12px;
      background-color: $active-color;
      transform: skewX(-15deg);
    }
    &::after {
      content: '';
      position: absolute;
      right: -5px;
      bottom: 0;
      width: 12px;
      height: $labels-height;
      border-top-right-radius: 12px;
      background-color: $active-color;
      transform: skewX(15deg);
    }
  }
}

// .tab-item.active {
//   border-bottom-color: #1890ff;
//   color: #1890ff;
//   font-weight: bold;
// }
</style>