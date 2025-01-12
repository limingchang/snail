<template>
  <i class="s-icon" :style="iconStyle" @click="clickhandle">
    <slot></slot>
  </i>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  color?: string;
}>();
const emits = defineEmits(["click"]);

const iconStyle = computed(() => {
  return {
    color: props.color || "inherit",
  };
});

const clickhandle = () => {
  emits("click");
};

defineOptions({
  name: "s-icon",
});
</script>
<style scoped lang="scss">
// .snail-icon {
//   font-size: 18px;
//   margin-left: 5px;
//   margin-right: 5px;
//   text-align: center;
//   vertical-align: middle;
// }

// .snail-svg-icon {
//   width: 1em;
//   height: 1em;
//   font-size: 1em;
//   position: relative;
//   vertical-align: -2px;
//   margin: auto;
//   fill: currentColor;
// }
// .pointer-icon {
//   cursor: pointer;
// }
</style>
