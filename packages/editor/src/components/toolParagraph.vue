<template>
  <div class="tool-paragraph">
    <div class="tool-heading">
      <Select v-model:value="headingLevel" class="heading-select" style="width: 80px;" @change="handleHeadingChange">
        <Select.Option v-for="(item, key) in HeadingList" :key="key" :value="item">{{ key }}</Select.Option>
      </Select>
    </div>
    <div class="tool-indent">
      <Button :icon="h(MenuUnfoldOutlined)" size="small" @click="handleIndentClick"
        :type="isIndentActivate ? 'primary' : 'ghost'"></Button>
      <Button :icon="h(MenuFoldOutlined)" size="small" @click="handleUnIndentClick"
        :type="isIndentActivate ? 'ghost' : 'primary'"></Button>
    </div>
    <div class="tool-align">
      <Button :icon="h(AlignLeftOutlined)" size="small" @click="handleAlignLeftClick"
        :type="isAlignLeftActivate ? 'primary' : 'ghost'"></Button>
      <Button :icon="h(AlignCenterOutlined)" size="small" @click="handleAlignCenterClick"
        :type="isAlignCenterActivate ? 'primary' : 'ghost'"></Button>
      <Button :icon="h(AlignRightOutlined)" size="small" @click="handleAlignRightClick"
        :type="isAlignRightActivate ? 'primary' : 'ghost'"></Button>
      <Button :icon="h(MenuOutlined)" size="small" @click="handleAlignJustifyClick"
        :type="isAlignJustifyActivate ? 'primary' : 'ghost'"></Button>
    </div>
    <div class="tool-line-height">
      <span>行距&nbsp;</span>
      <Select v-model:value="lineHeightType" class="line-height-select" @change="handleLineHeightTypeChange">
        <Select.Option value="single" :key="1" @click="lineHeightUnit = '倍'">单倍行距</Select.Option>
        <Select.Option value="1.5times" :key="1.5" @click="lineHeightUnit = '倍'">1.5倍行距</Select.Option>
        <Select.Option value="multiple" :key="2" @click="lineHeightUnit = '倍'">多倍行距</Select.Option>
        <Select.Option value="fixedValue" :key="4" @click="lineHeightUnit = '磅'">固定值</Select.Option>
      </Select>
      <InputNumber v-model:value="lineHeight" style="width: 60px;" @change="handleLineHeightChange"></InputNumber>
      <span>{{ lineHeightUnit }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { Select, Button, InputNumber } from 'ant-design-vue'
import { MenuUnfoldOutlined, MenuFoldOutlined, AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined, MenuOutlined } from '@ant-design/icons-vue';
import { Editor } from '@tiptap/vue-3'

import { HeadingList, Level } from '../typing/heading'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

const headingLevel = ref<number>(0)

// type 定义命令类型,因未引入对应插件，防止报错
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blod: {
      toggleBold: () => ReturnType
    }
    italic: {
      toggleItalic: () => ReturnType
      unsetItalic: () => ReturnType;
      setItalic: () => ReturnType;
    }
    underline: {
      toggleUnderline: () => ReturnType
      unsetUnderline: () => ReturnType;
      setUnderline: () => ReturnType;
    }
    heading: {
      setHeading: (attributes: {
        level: Level;
      }) => ReturnType,
      toggleHeading: (attributes: {
        level: Level;
      }) => ReturnType,
    }
    textAlign: {
      setTextAlign: (align:string) => ReturnType,
      toggleTextAlign: (align: string ) => ReturnType,
      unsetTextAlign: () => ReturnType;
    }
  }
}

// 大纲级别
const handleHeadingChange = (value: any) => {
  if (value == 0) {
    console.log('设置正文')
    props.editor?.chain().focus().setNode('paragraph').run()
  }
  props.editor?.chain().focus().setHeading({ level: value }).run()
}

//对齐处理
const handleAlignLeftClick = () => {
  props.editor?.chain().focus().toggleTextAlign('left').run()
}
const handleAlignCenterClick = () => {
  props.editor?.chain().focus().toggleTextAlign('center').run()
}
const handleAlignRightClick = () => {
  props.editor?.chain().focus().toggleTextAlign('right').run()
}
const handleAlignJustifyClick = () => {
  props.editor?.chain().focus().toggleTextAlign('justify').run()
}

const isAlignLeftActivate = computed(() => {
  return props.editor?.isActive({ textAlign: 'left' })
})
const isAlignCenterActivate = computed(() => {
  return props.editor?.isActive({ textAlign: 'center' })
})
const isAlignRightActivate = computed(() => {
  return props.editor?.isActive({ textAlign: 'right' })
})
const isAlignJustifyActivate = computed(() => {
  return props.editor?.isActive({ textAlign: 'justify' })
})

// 缩进工具
const isIndentActivate = computed(() => {
  // return props.editor?.isActive({ textIndent: "2em" })
  console.log()
  return false
})

const handleIndentClick = () => {
  console.log('缩进设置')
  props.editor.chain()
  .updateAttributes('paragraph',{
    style:{
      textIndent: '2em'
    }
    // textIndent: '2em'
  }).run()
  // props.editor?.chain().focus().setTextIndent("2em").run()
}
const handleUnIndentClick = () => {
  console.log('取消缩进')
  console.log(props.editor.state.selection)
  props.editor.chain().selectParentNode().updateAttributes('paragraph',{
    HTMLAttributes:{
      style: 'text-indent: 0em'
    }
  })
  // .updateAttributes('paragraph',{
  //   style:`text-indent: 0em;`
  // })
  .run()
  
  console.log(props.editor.state.selection)
}

// 行高工具
const lineHeightType = ref<'single' | 'multiple' | '1.5times' | 'fixedValue'>('single')
const lineHeight = ref(1)
const lineHeightUnit = ref('倍')
const handleLineHeightTypeChange = (value: any, option: any) => {
  if (value === 'fixedValue') {
    lineHeightUnit.value = '磅'
    lineHeight.value = 28
  } else {
    lineHeightUnit.value = '倍'
    lineHeight.value = option.key as number
  }
}


const handleLineHeightChange = (value: any) => {
  if (lineHeightType.value !== 'fixedValue' && lineHeightUnit.value == '倍' && lineHeight.value >= 2) {
    lineHeightType.value = 'multiple'
  }
}

</script>

<style scoped lang="scss">
.tool-paragraph {
  width: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  align-content: space-between;
  flex-wrap: wrap;

  // flex-direction: row;
  .tool-heading {
    width: 100px;
  }

  .tool-indent {
    width: 60px;
  }

  .tool-align {

    width: 100px;
  }

  .tool-line-height {
    width: 245px;
    line-height: 32px;
    margin-top: 10px;

    span {
      margin-right: 5px;
    }

    .line-height-select {
      width: 115px;
    }

    .ant-input-number {
      width: 60px;
      transform: translateY(-4px);
    }
  }

}
</style>