<template>
  <div class="word-cloud" :style="style">
    <WordTag v-for="(word, index) in hotWords" :key="index" :RADIUS="radius" :label="word" :color="randomColor()"
      :count="hotWords.length" :coefficient="computedCoefficient(index)"></WordTag>
  </div>
</template>

<script setup lang="ts">
import { StyleValue, computed } from 'vue';
import WordTag from './wordTag.vue';


const Colors: string[] = [
  "var(--snail-color-primary)",
  "var(--snail-color-primary)",
  "var(--snail-color-success)",
  "var(--snail-color-info)",
  "var(--snail-color-warning)",
  "var(--snail-color-danger)"
]
const randomColor = () => {
  if (props.colors && props.colors.length > 0) {
    return props.colors[Math.floor(Math.random() * props.colors.length)]
  } else {
    return Colors[Math.floor(Math.random() * Colors.length)]
  }
}

const props = defineProps<{
  hotWords: string[]
  radius: number
  baseFontSize?: number
  colors?: string[]
}>()

// const hotWords = ref([])

const computedCoefficient = (index: number) => {
  return (2 * (index + 1) - 1) / props.hotWords.length - 1
}


const style = computed<StyleValue>(() => {
  return {
    fontSize: props.baseFontSize ? `${props.baseFontSize}px` : '1em',
    width: props.radius * 2 + 'px',
    height: props.radius * 2 + 'px',

  }
})

defineOptions({
  name: "s-word-cloud"
})

</script>

<style scoped>
.word-cloud {
  position: relative;
  font-size: 1em;
  background-color: transparent;
}
</style>