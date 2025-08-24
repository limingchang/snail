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
        <Select.Option value="mm" title="毫米(mm)">mm</Select.Option>
        <Select.Option value="cm" title="厘米(cm)">cm</Select.Option>
      </Select>
    </div>
    <div class="qrcode-size">
      <span>宽高：</span>
      <InputNumber v-model:value="QRCodeOptions.size.value"></InputNumber>
      <Select v-model:value="QRCodeOptions.size.unit">
        <Select.Option value="px" title="像素(px)">px</Select.Option>
        <Select.Option value="mm" title="毫米(mm)">mm</Select.Option>
        <Select.Option value="cm" title="厘米(cm)">cm</Select.Option>
      </Select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, h } from 'vue'
import { Button, InputNumber, Select, Tooltip, message, Modal } from 'ant-design-vue'
import { QrcodeOutlined } from '@ant-design/icons-vue'
import qrcode from 'qrcode'

import { Editor } from '@tiptap/vue-3'
import { IQRCodeOptions } from '../typing/QRCode'

const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

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
    // 1. 检查编辑器焦点状态
    const hadFocus = props.editor.isFocused;
    let savedSelection = null;
    
    // 2. 如果编辑器有焦点，保存当前光标位置
    if (hadFocus) {
      savedSelection = props.editor.state.selection;
      console.log('编辑器有焦点，保存光标位置:', savedSelection);
    } else {
      console.log('编辑器无焦点，将强制聚焦并插入到文档末尾');
    }
    
    // 3. 强制编辑器获取焦点，确保 state 有效
    props.editor.commands.focus();
    
    // 4. 等待焦点生效
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 5. 验证编辑器状态
    if (!props.editor.state || !props.editor.state.doc) {
      message.error('编辑器状态无效，无法插入二维码');
      return;
    }
    
    // 6. 生成二维码数据
    const dataURL = await qrcode.toDataURL(QRCodeOptions.text, {
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // 7. 使用QRCode扩展中定义的insertQRCode命令插入到文档末尾
    const success = props.editor.commands.insertQRCode({
      ...QRCodeOptions,
      src: dataURL
    });
    
    if (success) {
      message.success('二维码插入成功');
      
      // 8. 如果编辑器原来有焦点，恢复光标位置
      if (hadFocus && savedSelection) {
        // 等待DOM更新后恢复光标位置
        setTimeout(() => {
          try {
            props.editor.commands.setTextSelection(savedSelection);
            console.log('光标位置已恢复');
          } catch (error) {
            console.warn('恢复光标位置失败:', error);
          }
        }, 50);
      }
    } else {
      message.error('插入失败');
    }
    
  } catch (error: any) {
    console.error('插入二维码失败:', error)
    message.error(`插入失败: ${error.message}`)
  }
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