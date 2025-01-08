<!-- 聚合ElIcon组件 -->
<template>
  <ElIcon v-if="typeof icon === 'string' && Object.keys(Icons).includes(icon)" class="snail-icon" v-bind="$attrs">
    <!-- ElIcon名称引用 -->
    <component :is="icon"></component>
  </ElIcon>
  <ElIcon v-if="isVNode(icon)" v-bind="$attrs">
    <!-- ElIcon组件引用 -->
    <component :is="icon"></component>
  </ElIcon>
  <i v-if="typeof icon === 'string' && icon.startsWith('icon-')" class="el-icon snail-icon" v-bind="$attrs"
    @click="handleClick" :style="iconStyle">
    <svg class="snail-svg-icon" aria-hidden="true">
      <use :xlink:href="`#${icon}`" />
    </svg>
  </i>
</template>

<script setup lang="ts">
import { computed, isVNode, CSSProperties } from 'vue';
import { ElIcon } from 'element-plus'
import * as Icons from "@element-plus/icons-vue";
import { SELIconPropsType, IconSize } from './type';
// 引入iconFont图标
import '@snail-js/vue/src/theme-chalk/iconFont/iconfont.js';

const props = defineProps<SELIconPropsType>();
const emits = defineEmits(['click']);

const handleClick = (e: MouseEvent) => {
  emits('click', e);
}

// 图标在 iconfont 中的名字
// const iconClassName = computed(() => {
//   return `#${props.iconName}`;
// })
const iconStyle: CSSProperties = computed(() => {
  return {
    color: props.color || 'inherit',
    fontSize: fontSize.value
  }
})

const sizeMap = {
  'large': '1.2em',
  'normal': '1em',
  'small': '0.8em'
}

const fontSize = computed(() => {
  const size = props.size || 'normal'
  if (typeof size === 'number') {
    return `${props.size}px`
  }
  if (typeof size === 'string') {
    return sizeMap[size as IconSize]
  }
  return 'inherit'
})
defineOptions({
  name: "s-el-icon",
});

</script>
<style scoped lang="scss">
.snail-icon {
  font-size: 18px;
  margin-left: 5px;
  margin-right: 5px;
  text-align: center;
  vertical-align: middle
}

.snail-svg-icon {
  width: 1em;
  height: 1em;
  font-size: 1em;
  position: relative;
  vertical-align: -2px;
  margin: auto;
  fill: currentColor;
}
.pointer-icon{
  cursor: pointer;
}
</style>