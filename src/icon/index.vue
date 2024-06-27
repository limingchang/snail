<template>
  <i class="snail-icon" :class="class">
    <svg class="snail-svg-icon" aria-hidden="true">
      <use :xlink:href="iconClassName" :fill="color ? color : '#333'" />
    </svg>
  </i>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IconPropsType } from './type';

// 引入iconFont图标
import './iconFont/iconfont.js';



const props = defineProps<IconPropsType>();


// 图标在 iconfont 中的名字
const iconClassName = computed(() => {
  return `#${props.icon}`;
})

</script>


<style scoped lang="scss">
.snail-icon {
  font-size: 18px;
  margin-left:5px;
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
  fill: currentColor;
}
</style>