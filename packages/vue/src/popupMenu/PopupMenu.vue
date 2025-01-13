<template>
  <Teleport to="body">
    <div ref="sPopUpMenuRef" v-show="model" class="s-pop-up-menu" :style="menuStyle">
      <slot></slot>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { PropType, computed, watch, ref, provide, useTemplateRef } from 'vue'
// import MenuItem from './PopupMenuItem.vue'
import { TextAlign } from './type'

import { useMouse } from "@vueuse/core";


const props = defineProps({
  width: {
    type: Number,
    default: () => 150
  },
  align: {
    type: String as PropType<TextAlign>,
    default: () => 'left'
  },
})

const model = defineModel<boolean>({ required: true, default: () => false })
const sPopUpMenuRef = useTemplateRef('sPopUpMenuRef')

const handleHide = () => {
  model.value = false
}

provide('s-popup-menu-handleHide', handleHide)

const posX = ref(0)
const posY = ref(0)
const { x, y } = useMouse({ touch: false });
const setPositon = () => {
  const clientX = document.documentElement.clientWidth
  const clientY = document.documentElement.offsetHeight
  const timer = setTimeout(() => {
    const menuWidth = (sPopUpMenuRef.value! as HTMLElement).offsetWidth
    if (x.value + menuWidth > clientX) {
      posX.value = clientX - menuWidth
    } else {
      posX.value = x.value
    }
    const menuHeight = (sPopUpMenuRef.value! as HTMLElement).offsetHeight
    if (y.value + menuHeight > clientY) {
      posY.value = clientY - menuHeight
    } else {
      posY.value = y.value
    }
    clearTimeout(timer)
  }, 50)
}

watch(() => model.value, async () => {
  if (model.value) {
    setPositon()
    const timer = setTimeout(() => {
      document.body.addEventListener('click', handleHide)
      clearTimeout(timer)
    }, 50)
  } else {
    document.body.removeEventListener('click', handleHide)
  }
})

const menuStyle = computed(() => {
  return {
    width: `${props.width}px`,
    textAlign: props.align,
    top: `${posY.value - 5}px`,
    left: `${posX.value - 5}px`,
    display: "block",
  }
})


defineOptions({
  name: 's-popup-menu'
})
</script>

<style scoped></style>