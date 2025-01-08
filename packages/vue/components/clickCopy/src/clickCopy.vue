<template>
  <SIcon v-if="isShow" icon="icon-copy" color="#409EFF" class="pointer-icon" @click="handleCopy()" ref="iconRef">
  </SIcon>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { SIcon } from "@snail-js/vue"

const iconRef = useTemplateRef('iconRef')

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  message: {
    type: String,
    default: () => '复制成功'
  },
  display: {
    type: Boolean,
    default: () => true
  }
})

const isShow = ref(true)

onMounted(() => {
  if (!props.display) {
    const parent: HTMLElement = iconRef.value?.$el.parentElement
    parent.addEventListener('click', handleCopy)
    isShow.value = false
  }
})

const handleCopy = async () => {
  await navigator.clipboard.writeText(props.text)
  ElMessage.success({
    message: props.message || '复制成功'
  })
}
</script>

<style scoped>
.copy-icon {
  cursor: pointer;
  display: inline-block;
}
</style>