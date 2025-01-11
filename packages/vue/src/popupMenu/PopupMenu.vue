<template>
  <Teleport to="body">
    <div ref="sPopUpMenuRef" v-show="model" class="s-pop-up-menu" :style="menuStyle">
      <MenuItem v-for="(item, index) in props.items" :options="item" :key="`s-pop-up-menu-item${index}`"
        @hide="handleHide">
      </MenuItem>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { PropType, computed, watch, ref } from 'vue'
import MenuItem from './MenuItem.vue'
import { TextAlign, SnailPopUpMenuItem } from './type'

import { useMouse } from "@vueuse/core";
const { x, y } = useMouse();

const props = defineProps({
  width: {
    type: Number,
    default: () => 150
  },
  align: {
    type: String as PropType<TextAlign>,
    default: () => 'left'
  },
  items: {
    type: Array as PropType<SnailPopUpMenuItem[]>,
    default: () => {
      return []
    }
  },
  permission: {
    type: Function as PropType<(flag?: string) => boolean>,
    default: () => {
      return () => true
    }
  }
})

const model = defineModel<boolean>({ required: true, default: () => false })

const handleHide = () => {
  model.value = false
}

const pos = ref({
  x: 0,
  y: 0
})

watch(() => model.value, () => {
  if (model.value && !props.permission()) {
    model.value = false
    return
  }
  if (model.value) {
    pos.value = {
      x: x.value,
      y: y.value
    }
  }
})

const menuStyle = computed(() => {
  return {
    width: `${props.width}px`,
    textAlign: props.align,
    top: `${pos.value.x - 5}px`,
    left: `${pos.value.y - 5}px`,
    display: "block",
  }
})


defineOptions({
  name: 's-popup-menu'
})
</script>

<style scoped></style>