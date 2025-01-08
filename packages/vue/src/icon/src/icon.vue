<template>
  <i class="iconfont" :class="icon"></i>
</template>

<script setup lang="ts">
import { computed, CSSProperties } from "vue";
// import * as Icons from "@element-plus/icons-vue";
import { SIconPropsType, IconSize } from "./type";
// 引入iconFont图标
// import initIconFont from '@snail-js/vue/theme-chalk/iconFont/iconfont.js';

const props = defineProps<SIconPropsType>();
const emits = defineEmits(["click"]);

const handleClick = (e: MouseEvent) => {
  emits("click", e);
};

// 图标在 iconfont 中的名字
// const iconClassName = computed(() => {
//   return `#${props.iconName}`;
// })
const iconStyle: CSSProperties = computed(() => {
  return {
    color: props.color || "inherit",
    fontSize: fontSize.value,
  };
});

const sizeMap = {
  large: "1.2em",
  normal: "1em",
  small: "0.8em",
};

const fontSize = computed(() => {
  const size = props.size || "normal";
  if (typeof size === "number") {
    return `${props.size}px`;
  }
  if (typeof size === "string") {
    return sizeMap[size as IconSize];
  }
  return "inherit";
});
defineOptions({
  name: "s-icon",
});
</script>
<style scoped lang="scss">
@use "@snail-js/vue/src/theme-chalk/iconFont/iconfont.css";
.snail-icon {
  font-size: 18px;
  margin-left: 5px;
  margin-right: 5px;
  text-align: center;
  vertical-align: middle;
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
.pointer-icon {
  cursor: pointer;
}
</style>
