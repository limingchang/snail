<template>
  <Tooltip title="插入表格" color="#409EFF">
    <Button :icon="h(TableOutlined)" size="large"></Button>
  </Tooltip>
  <Tooltip title="插入布局定位表(一般用于签署分栏)" color="#F56C6C">
    <Button style="padding: 8px;" size="large" :icon="h(IconLayout)"></Button>
  </Tooltip>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { Button, Tooltip } from 'ant-design-vue'
import { TableOutlined } from '@ant-design/icons-vue'
import { IconLayout } from '@snail-js/vue'
import { Editor } from '@tiptap/vue-3'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})
</script>

<style scoped></style>