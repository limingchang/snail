<template>
  <div class="tool-qrcode">
      <Button :icon="h(QrcodeOutlined)" size="middle" @click="handleInsertQRCodeClick">插入二维码</Button>
    <div class="qrcode-position">
      <span>位置：上</span>
      <InputNumber v-model:value="QRCodeOptions.position.y" @change="handleUpdateQRCode"></InputNumber><span>左</span>
      <InputNumber v-model:value="QRCodeOptions.position.x" @change="handleUpdateQRCode"></InputNumber>
      <Select v-model:value="QRCodeOptions.position.unit" @select="handleUpdateQRCode">
        <Select.Option value="px" title="像素(px)">px</Select.Option>
        <Select.Option value="mm" title="毫米(mm)">mm</Select.Option>
        <Select.Option value="cm" title="厘米(cm)">cm</Select.Option>
      </Select>
    </div>
    <div class="qrcode-size">
      <span>宽高：</span>
      <InputNumber v-model:value="QRCodeOptions.size.value" @change="handleUpdateQRCode"></InputNumber>
      <Select v-model:value="QRCodeOptions.size.unit" @select="handleUpdateQRCode">
        <Select.Option value="px" title="像素(px)">px</Select.Option>
        <Select.Option value="mm" title="毫米(mm)">mm</Select.Option>
        <Select.Option value="cm" title="厘米(cm)">cm</Select.Option>
      </Select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, h } from 'vue'
import { Button, InputNumber, Select, message } from 'ant-design-vue'
import { QrcodeOutlined } from '@ant-design/icons-vue'
import qrcode from 'qrcode'

import { Editor } from '@tiptap/vue-3'
import { IQRCodeOptions } from '../extensions/QRCode/typing'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

const handleTest = () => {
  console.log('[hasQRCode]',props.editor.storage.qrcode.hasQRCode)
  console.log('[qrcode-node:]',props.editor.$node('qrcode'))
}


// 插入二维码

const QRCodeOptions = reactive<IQRCodeOptions>({
  text: '这是一个测试用二维码，内容由文档相关信息生成',
  size: {
    value: 30,
    unit: 'mm',
  },
  position: {
    x: 10,
    y: 10,
    unit: 'mm',
  },
})

const handleInsertQRCodeClick = async () => {
  console.log('插入二维码')

  if (!props.editor) {
    message.error('编辑器实例不存在')
    return
  }

  try {
    // 1.检查文档中是否有二维码
    const {hasQRCode} = props.editor.storage.qrcode
    if (hasQRCode) {
      message.error('文档中已存在二维码')
      return
    }

    const dataURL = await qrcode.toDataURL(QRCodeOptions.text, {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // 5. 使用QRCode扩展中定义的insertQRCode命令插入到文档末尾
    const success = props.editor.chain().insertQRCode({
      ...QRCodeOptions,
      src: dataURL
    }).run();

    if (success) {
      message.success('二维码插入成功');
    } else {
      message.error('插入失败');
    }

  } catch (error: any) {
    console.error('插入二维码失败:', error)
    message.error(`插入失败: ${error.message}`)
  }
  props.editor.chain().focus('end').run()
}

const handleUpdateQRCode = () => {
  // console.log('[position]',QRCodeOptions.position)
  if(props.editor.storage.qrcode.hasQRCode){
    const qrcodeEle = document.querySelector('[data-type="qrcode"]') as HTMLElement
    qrcodeEle.style.width = `${QRCodeOptions.size.value}${QRCodeOptions.size.unit}`
    qrcodeEle.style.height = `${QRCodeOptions.size.value}${QRCodeOptions.size.unit}`
    qrcodeEle.style.top = `${QRCodeOptions.position.y}${QRCodeOptions.position.unit}`
    qrcodeEle.style.left = `${QRCodeOptions.position.x}${QRCodeOptions.position.unit}`
    props.editor.chain().updateQRCode({
      ...QRCodeOptions,
    }).run()
  }else{
    console.error('请先插入二维码')
  }
}


</script>

<style scoped lang="scss">
.tool-qrcode {
  width: 285px;

  .qrcode-position {
    width: 100%;
    margin-top: 10px;

    span {
      margin-left: 5px;
      margin-right: 5px;
    }

    .ant-input-number {
      transform: translateY(-4px);
      width: 60px;
    }
  }

  .qrcode-size {
    margin-top: 10px;
    width: 100%;

    span {
      margin-left: 5px;
      margin-right: 5px;
    }

    .ant-input-number {
      transform: translateY(-4px);
      width: 65px;
    }
  }
}
</style>