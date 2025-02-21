<template>
  <span class="s-word-cloud-tag" :style="style" ref="tagRef" @mouseenter="stop" @mouseleave="animate">{{ label }}</span>
</template>

<script setup lang="ts">
import { ref, computed, StyleValue, onMounted, onUnmounted } from 'vue'
const props = defineProps<{
  label: string
  color: string
  coefficient: number
  count: number
  RADIUS: number
  SPEED?: number
}>()
// 直径
const Diameter = computed(() => props.RADIUS * 2)

const tagRef = ref<HTMLSpanElement>()

const size = ref(parseFloat(tagRef.value?.style.fontSize || '12px'))
//初始化旋转角
const angelX = ref<number>(((Math.random() - 0.5) * Math.PI) / 250)
const angelY = ref<number>(((Math.random() - 0.5) * Math.PI) / 250)

const theta = computed(() => {
  return Math.acos(props.coefficient)
})

const psi = computed(() => {
  return theta.value * Math.sqrt(props.count * Math.PI)
})

const x = ref(props.RADIUS * Math.cos(psi.value) * Math.sin(theta.value))

const y = ref(props.RADIUS * Math.sin(psi.value) * Math.sin(theta.value))

const z = ref(props.RADIUS * Math.cos(theta.value))

const scale = computed(() => Diameter.value / (Diameter.value - z.value))

const alpha = computed(() => {
  return (z.value + props.RADIUS) / (props.RADIUS * 2)
})

const style = computed<StyleValue>(() => {
  const { offsetWidth, offsetHeight } = tagRef.value ? tagRef.value : { offsetHeight: 0, offsetWidth: 0 }
  const CX = props.RADIUS
  const CY = props.RADIUS
  return {
    opacity: alpha.value + .05,
    zIndex: Math.floor(scale.value * 100),
    fontWeight: Math.floor(scale.value * 600),
    fontSize: size.value * scale.value + 'px',
    filter: `alpha(opacity = ${(alpha.value + 0.5) * 100}`,
    transform: `translate(${x.value + CX - offsetWidth / 2}px, ${y.value + CY - offsetHeight / 2}px)`,
    color: props.color
  }
})

const timer = ref()

const animate = () => {
  timer.value = setTimeout(() => {
    const speed = props.SPEED ? props.SPEED < 1 ? 50 : props.SPEED > 10 ? 5 : 5 * (10 - props.SPEED) : 15
    intervalId.value = setInterval(() => {
      y.value = y.value * Math.cos(angelX.value) - z.value * Math.sin(angelX.value)
      z.value = z.value * Math.cos(angelX.value) + y.value * Math.sin(angelX.value)
      x.value = x.value * Math.cos(angelY.value) - z.value * Math.sin(angelY.value)
      z.value = z.value * Math.cos(angelY.value) + x.value * Math.sin(angelY.value)
    }, speed)
  }, 50)
}

const stop = () => {
  clearInterval(intervalId.value)
  clearTimeout(timer.value)
}

const intervalId = ref<NodeJS.Timeout>()

onMounted(() => {
  animate()
})
defineExpose({
  animate,
  stop
})
onUnmounted(() => {
  clearTimeout(timer.value)
})

</script>

<style scoped>

</style>