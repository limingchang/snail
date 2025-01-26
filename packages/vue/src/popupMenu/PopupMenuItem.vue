<template>
  <div v-if="display" class="s-pop-up-menu-item" :class="setClass" :style="setStyle" @click="clickHanle">
    <SIcon v-if="options.icon">
      <component :is="options.icon"></component>
    </SIcon>
    <span class="item-label">{{ options.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { PropType, inject, computed, ref, onMounted } from "vue";
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
  context: {
    type: Object
  }
});

const enabled = ref(true)
const display = ref(true)

const setClass = computed(() => {
  const itemClass = {
    'item-disabled': !enabled.value,
    'item-enabled': enabled.value,
  }
  return itemClass
})

onMounted(async () => {
  await setDisabled()
  await setDisPlay()
})

const setDisabled = async () => {
  if (!props.options.enabled) return
  if (typeof props.options.enabled === 'boolean') {
    enabled.value = props.options.enabled
  } else {
    const fn = props.options.enabled
    enabled.value = await fn(props.context)
  }
}
const setDisPlay = async () => {
  if (!props.options.display) return
  if (typeof props.options.display === 'boolean') {
    display.value = props.options.display
  } else {
    const fn = props.options.display
    display.value = await fn(props.context)
  }
}

const setStyle = computed(() => {
  return {
    '--hover-color': props.options.hoverColor ? props.options.hoverColor : '#66b1ff',
  }
})

// const handleHide = inject("s-popup-menu-handleHide") as () => void;

const clickHanle = async () => {
  if (!enabled.value) return;
  await props.options.click(props.context);
  emits('hide')
  // handleHide();
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
