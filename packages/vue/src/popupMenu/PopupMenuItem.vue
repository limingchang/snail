<template>
  <div
    v-if="display"
    class="s-pop-up-menu-item"
    :class="setClass"
    :style="setStyle"
    @click="clickHanle"
  >
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
  TComputedStatus,
} from "./type";

// const emits = defineEmits(["hide"]);
const emits = defineEmits<{
  (e: "exce", command: HandlerCommandFunc): void;
  (e: "status", func: TComputedStatus): boolean | Promise<boolean>;
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
    // enabled.value = await fn(props.context);
    enabled.value = await emits("status", fn);
  }
};
const setDisPlay = async () => {
  if (!props.options.display) return;
  if (typeof props.options.display === "boolean") {
    display.value = props.options.display;
  } else {
    const fn = props.options.display;
    // display.value = await fn(props.context);
    display.value = await emits("status", fn);
  }
};

const setStyle = computed(() => {
  return {
    "--hover-color": props.options.hoverColor
      ? props.options.hoverColor
      : "#66b1ff",
  };
});

// const handleHide = inject("s-popup-menu-handleHide") as () => void;

const clickHanle = async () => {
  if (!enabled.value) return;
  // await props.options.click(props.context);
  emits("exce", props.options.command);
  // handleHide();
};

defineOptions({
  name: "s-popup-menu-item",
});
</script>

<style scoped>

</style>
