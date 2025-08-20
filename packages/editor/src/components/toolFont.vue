<template>
  <div class="tool-font">
    <div class="font-style">
      <Select v-model:value="fontFamily" class="font-family-select" @change="handleFontFamilyChange">
        <Select.Option v-for="(item, key) in FontFamilyList" :key="key" :value="item">{{ key }}</Select.Option>
      </Select>
      <Select v-model:value="fontSize" class="font-size-select" @change="handleFontSizeChange">
        <Select.Option v-for="(item, key) in FontSizeList" :key="key" :value="item">{{ key }}</Select.Option>
      </Select>
    </div>
    <div class="font-marks">
      <Button :icon="h(BoldOutlined)" size="small" :type="isBlodActivate ? 'primary' : 'ghost'"
        @click="handleBoldClick"></Button>
      <Button :icon="h(ItalicOutlined)" size="small" :type="isItalicActivate ? 'primary' : 'ghost'"
        @click="handleItalicClick"></Button>
      <Button :icon="h(UnderlineOutlined)" size="small" :type="isUnderlineActivate ? 'primary' : 'ghost'"
        @click="handleUnderlineClick"></Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { Select, Button } from 'ant-design-vue'
import { BoldOutlined, ItalicOutlined, UnderlineOutlined } from '@ant-design/icons-vue';

import { FontFamilyList } from '../typing/fontFamily'
import { FontSizeList } from '../typing/fontSize'

import { Editor } from '@tiptap/vue-3'
const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

const fontFamily = ref('宋体')
const fontSize = ref('四号')

// font style工具
// 设置字体
const handleFontFamilyChange = (value: any) => {
  props.editor?.chain().focus().setFontFamily(value).run()
}
// 设置字体大小
const handleFontSizeChange = (value: any) => {
  props.editor?.chain().focus().setFontSize(value).run()
}

// marks工具
const isBlodActivate = computed(() => {
  return props.editor?.isActive('bold')
})
const isItalicActivate = computed(() => {
  return props.editor?.isActive('italic')
})

const isUnderlineActivate = computed(() => {
  return props.editor?.isActive('underline')
})

const handleBoldClick = () => {
  props.editor?.chain().focus().toggleBold().run()
}
const handleItalicClick = () => {
  props.editor?.chain().focus().toggleItalic().run()
}
const handleUnderlineClick = () => {
  props.editor?.chain().focus().toggleUnderline().run()
}
</script>

<style scoped lang="scss">
.tool-font {
  width: 200px;

  .font-family-select {
    width: 120px;

    :deep(.ant-select-selector) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
  }

  .font-size-select {
    width: 80px;

    :deep(.ant-select-selector) {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      margin-left: -1px;
    }
  }

  .font-marks {
    margin-top: 10px;

    button {
      margin-right: 5px;
    }

    button:last-child {
      margin-right: 0;
    }

  }
}
</style>