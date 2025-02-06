<template>
  <Teleport to="body">
    <div ref="sPopUpMenuRef" v-show="model" class="s-pop-up-menu" :style="menuStyle">
      <MenuItem v-for="(item, index) in props.items" :key="`s-pop-up-menu-${index}`" :options="item" @exce="handleExce"
        @enabled="handleEnabled" @display="handleDisplay">
      </MenuItem>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { PropType, computed, watch, ref } from "vue";
import MenuItem from "./PopupMenuItem.vue";
import { TextAlign, SPopUpMenuItemOptions, TComputedEnabled, TComputedDisplay } from "./type";

import { useMouse, onClickOutside } from "@vueuse/core";

const props = defineProps({
  width: {
    type: Number,
    default: () => 150,
  },
  align: {
    type: String as PropType<TextAlign>,
    default: () => "left",
  },
  context: {
    type: Object,
    default: () => { },
  },
  items: {
    type: Array as PropType<SPopUpMenuItemOptions[]>,
    default: () => [],
  },
});

const emits = defineEmits<{
  (e: 'close'): void
}>()

const model = defineModel({ type: Boolean, required: true, default: false });
const sPopUpMenuRef = ref(null);


const handleHide = () => {
  onClickOutside(sPopUpMenuRef, () => model.value = false)
};

const posX = ref(0);
const posY = ref(0);
const { x, y } = useMouse({ touch: false });
const setPositon = () => {
  const clientX = document.documentElement.clientWidth;
  const clientY = document.documentElement.offsetHeight;
  const timer = setTimeout(() => {
    const menuWidth = (sPopUpMenuRef.value! as HTMLElement).offsetWidth;
    if (x.value + menuWidth > clientX) {
      posX.value = clientX - menuWidth;
    } else {
      posX.value = x.value;
    }
    const menuHeight = (sPopUpMenuRef.value! as HTMLElement).offsetHeight;
    if (y.value + menuHeight > clientY) {
      posY.value = clientY - menuHeight;
    } else {
      posY.value = y.value;
    }
    clearTimeout(timer);
  }, 50);
};

watch(
  () => model.value,
  async () => {
    if (model.value) {
      setPositon();
      const timer = setTimeout(() => {
        document.body.addEventListener("click", handleHide);
        clearTimeout(timer);
      }, 50);
    } else {
      document.body.removeEventListener("click", handleHide);
    }
  }
);

const menuStyle = computed(() => {
  return {
    width: `${props.width}px`,
    textAlign: props.align,
    top: `${posY.value - 5}px`,
    left: `${posX.value - 5}px`,
    display: "block",
  };
});

const handleExce = (command: Function) => {
  command(props.context);
  model.value = false
  emits('close')
};

const handleEnabled = async (computedFn: TComputedEnabled) => {
  return await computedFn(props.context);
};

const handleDisplay = async (computedFn: TComputedDisplay) => {
  return await computedFn();
}

defineOptions({
  name: "s-popup-menu",
});
</script>

<style scoped></style>
