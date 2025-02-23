<template>
  <div v-if="display" class="s-pop-up-menu-item" :class="setClass" :style="setStyle" @click="clickHanle">
    <SIcon v-if="options.icon">
      <component :is="options.icon"></component>
    </SIcon>
    <span class="item-label">{{ options.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { PropType, computed, ref, onMounted } from "vue";
import { SIcon } from "../icon";
import {
  SPopUpMenuItemOptions,
  HandlerCommandFunc,
  TComputedBoolean,
  TComputedDisplay
} from "./type";

const emits = defineEmits<{
  (e: "exce", command: HandlerCommandFunc): void;
  (e: "enabled", func: TComputedBoolean): boolean | Promise<boolean>;
  (e: "display", func: TComputedDisplay): boolean | Promise<boolean>;
}>();

const props = defineProps({
  options: {
    type: Object as PropType<SPopUpMenuItemOptions>,
    default: () => {
      return {};
    },
  },
});

const enabled = ref(true);
const display = ref(true);

const setClass = computed(() => {
  const itemClass = {
    "item-disabled": !enabled.value,
    "item-enabled": enabled.value,
  };
  return itemClass;
});

onMounted(async () => {
  await setDisabled();
  await setDisPlay();
});

const setDisabled = async () => {
  if (!props.options.enabled) return;
  if (typeof props.options.enabled === "boolean") {
    enabled.value = props.options.enabled;
  } else {
    const fn = props.options.enabled;
    enabled.value = await emits("enabled", fn);
  }
};
const setDisPlay = async () => {
  if (!props.options.display) return;
  if (typeof props.options.display === "boolean") {
    display.value = props.options.display;
  } else {
    const fn = props.options.display;
    display.value = await emits("display", fn);
  }
};

const setStyle = computed(() => {
  return {
    "--hover-color": props.options.hoverColor
      ? props.options.hoverColor
      : "#66b1ff",
  };
});

const clickHanle = async () => {
  if (!enabled.value) return;
  emits("exce", props.options.command);
};

defineOptions({
  name: "s-popup-menu-item",
});
</script>

<style scoped></style>
