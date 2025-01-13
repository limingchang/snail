<template>
  <div
    class="s-pop-up-menu-item"
    :class="{
      'item-disabled': !options.disabled,
      'item-enabled': options.disabled,
    }"
    :style="{
      '--hover-color': options.hoverColor ? options.hoverColor : '#66b1ff',
    }"
    @click="clickHanle"
  >
    <SIcon v-if="options.icon"
      ><component :is="options.icon"></component
    ></SIcon>
    <span class="item-label">{{ options.label }}</span>
    <ElDivider
      v-if="options.divider"
      class="s-pop-up-menu-item-divider"
    ></ElDivider>
  </div>
</template>

<script setup lang="ts">
import { PropType, onMounted } from "vue";
import { ElDivider } from "element-plus";
import { SIcon } from "../icon";
import { SnailPopUpMenuItem } from "./type";

const emits = defineEmits(["hide"]);

const props = defineProps({
  options: {
    type: Object as PropType<SnailPopUpMenuItem>,
    default: () => {
      return {};
    },
  },
});

onMounted(() => {
  // console.log(props.options);
});
const clickHanle = () => {
  if (!props.options.disabled) return;
  props.options.click();
  emits("hide");
};
</script>

<style scoped>
.snail-pop-up-menu-item:hover {
  background-color: var(--hover-color);
}
</style>
