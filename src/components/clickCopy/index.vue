<template>
  <div class="copy-icon">
    <ElIcon color="#409EFF" @click="handleCopy()">
      <DocumentCopy />
    </ElIcon>
  </div>
</template>

<script setup lang="ts">
import { ElIcon, ElMessage } from 'element-plus'

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  message: {
    type: String,
    default: ()=>'复制成功'
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
.copy-icon{
  cursor: pointer;
  display: inline-block;
}
</style>