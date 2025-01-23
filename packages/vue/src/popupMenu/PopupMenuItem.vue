<template>
  <div v-if="display" class="s-pop-up-menu-item" :class="setClass"
    :style="setStyle" @click="clickHanle">
    <SIcon v-if="options.icon">
      <component :is="options.icon"></component>
    </SIcon>
    <span class="item-label">{{ options.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { PropType, inject, computed, ref, onMounted } from "vue";
// import { ElDivider } from "element-plus";
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

const disabled = ref(false)
const display = ref(true)

const setClass = computed(() => {
  const itemClass = {
    'item-disabled': disabled.value,
    'item-enabled': !disabled.value,
  }
  return itemClass
})

onMounted(async () => {
  await setDisabled()
  await setDisPlay()
})

const setDisabled = async () => {
  if (!props.options.disabled) return
  if (typeof props.options.disabled === 'boolean') {
    disabled.value = props.options.disabled
  } else {
    const fn = props.options.disabled
    disabled.value = await fn(props.options.context)
  }
}
const setDisPlay = async () => {
  if (!props.options.display) return
  if (typeof props.options.display === 'boolean') {
    display.value = props.options.display
  } else {
    const fn = props.options.display
    display.value = await fn(props.options.context)
  }
}

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
