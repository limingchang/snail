<template>
  <div v-if="options.display === undefined ? true : options.display" class="s-pop-up-menu-item" :class="setClass"
    :style="setStyle" @click="clickHanle">
    <SIcon v-if="options.icon">
      <component :is="options.icon"></component>
    </SIcon>
    <span class="item-label">{{ options.label }}</span>
    <ElDivider v-if="options.divider" class="s-pop-up-menu-item-divider"></ElDivider>
  </div>
</template>

<script setup lang="ts">
import { PropType, inject, computed } from "vue";
import { ElDivider } from "element-plus";
import { SIcon } from "../icon";
import { SPopUpMenuItemOptions } from "./type";

const emits = defineEmits(["hide"]);

const props = defineProps({
  options: {
    type: Object as PropType<SPopUpMenuItemOptions>,
    default: () => {
      return {};
    },
  },
});


const setClass = computed(() => {
  const itemClass = {
    'item-disabled': props.options.disabled,
    'item-enabled': !props.options.disabled,
  }
  return itemClass
})
const setStyle = computed(() => {
  return {
    '--hover-color': props.options.hoverColor ? props.options.hoverColor : '#66b1ff',
  }
})

const handleHide = inject("s-popup-menu-handleHide") as () => void;

const clickHanle = () => {
  if (props.options.disabled) return;
  props.options.click(props.options.context);
  handleHide();
};


defineOptions({
  name: "s-popup-menu-item",
});
</script>

<style scoped>
.snail-pop-up-menu-item:hover {
  background-color: var(--hover-color);
}
</style>
