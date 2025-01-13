<template>
  <div ref="clickCopyRef" class="s-click-copy-icon" @click="handleCopy">
    <SIcon><IconCopy /></SIcon>
    <span>{{ label }}</span>
  </div>

</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { ElMessage } from 'element-plus'
import { SIcon } from '@snail-js/vue'
import { IconCopy } from '@snail-js/theme'

const clickCopyRef = useTemplateRef('clickCopyRef')

const props = defineProps({
  label: {
    type: String,
    default: () => '复制'
  },
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

onMounted(() => {
    // const parent = (iconRef.value! as ComponentInstance<typeof SIcon>).$el.parentElement!
    const parent = clickCopyRef.value!.parentElement!
    console.log(parent);
    parent.classList.add('s-click-copy-icon-parent')
})

const handleCopy = async () => {
  await navigator.clipboard.writeText(props.text)
  ElMessage.success({
    message: props.message || '复制成功'
  })
}

defineOptions({
  name: "s-click-copy"
})
</script>

<style lang="scss" scoped>

</style>