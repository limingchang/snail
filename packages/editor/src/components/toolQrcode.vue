<template>
  <div class="tool-qrcode">
    <Tooltip title="插入二维码" :color="'#2db7f5'" placement="right">
      <Button :icon="h(QrcodeOutlined)" size="middle" @click="handleInsertQRCodeClick"></Button>
    </Tooltip>
    <div class="qrcode-position">
      <span>位置：上</span>
      <InputNumber v-model:value="QRCodeOptions.position.y"></InputNumber><span>左</span>
      <InputNumber v-model:value="QRCodeOptions.position.x"></InputNumber>
      <Select v-model:value="QRCodeOptions.position.unit">
        <Select.Option value="px" title="像素(px)">px</Select.Option>
        <Select.Option value="%" title="毫米(mm)">mm</Select.Option>
        <Select.Option value="cm" title="厘米(cm)">cm</Select.Option>
      </Select>
    </div>
    <div class="qrcode-size">
      <span>宽高：</span>
      <InputNumber v-model:value="QRCodeOptions.size.value"></InputNumber>
      <Select v-model:value="QRCodeOptions.size.unit">
        <Select.Option value="px" title="像素(px)">px</Select.Option>
        <Select.Option value="%" title="毫米(mm)">mm</Select.Option>
        <Select.Option value="cm" title="厘米(cm)">cm</Select.Option>
      </Select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, h } from 'vue'
import { Button, InputNumber, Select, Tooltip } from 'ant-design-vue'
import { QrcodeOutlined } from '@ant-design/icons-vue'

import { Editor } from '@tiptap/vue-3'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

// 插入二维码

const QRCodeOptions = reactive({
  text: '这是一个测试用二维码，内容由文档相关信息生成',
  size: {
    value: 100,
    unit: 'mm',
  },
  position: {
    x: 10,
    y: 10,
    unit: 'mm',
  },
  download: true,
})

const handleInsertQRCodeClick = () => {
  console.log('插入二维码')
}

</script>

<style scoped lang="scss">
.tool-qrcode {
  width: 345px;
  .qrcode-position{
    width: 100%;
    margin-top: 10px;
    span{
      margin-left: 5px;
      margin-right: 5px;
    }
    .ant-input-number{
      transform: translateY(-4px);
      width: 60px;
    }
  }
  .qrcode-size{
    margin-top: 10px;
    width: 100%;
    span{
      margin-left: 5px;
      margin-right: 5px;
    }
    .ant-input-number{
      transform: translateY(-4px);
      width: 65px;
    }
  }
}
</style>