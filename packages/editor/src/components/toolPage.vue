<template>
  <div class="tool-page">


    <!-- 页边距设置区域 -->
    <div class="margin-settings">
      <Dropdown placement="bottom" :trigger="['click']">
        <template #overlay>
          <Menu @click="handlePresetMarginSelect">
            <MenuItem v-for="preset in marginPresets" :key="preset.name">
            <div class="margin-preset-item">
              <div class="margin-icon" :class="preset.iconClass"></div>
              <div class="margin-info">
                <div class="preset-name">{{ preset.name }}</div>
                <div class="preset-values">
                  上:{{ preset.margins.top }}cm 下:{{ preset.margins.bottom }}cm 左:{{ preset.margins.left }}cm 右:{{
                    preset.margins.right }}cm
                </div>
              </div>
            </div>
            </MenuItem>
          </Menu>
        </template>
        <Button :icon="h(IconPageMargin)">页边距
          <DownOutlined />
        </Button>
      </Dropdown>

      <!-- 自定义边距输入 -->
      <div class="custom-margins">
        <InputNumber v-model:value="pageSettings.margins.top" :step="0.1" :min="0" :max="10" :precision="2" size="small"
          addon-before="上：" addon-after="cm" @change="handleCustomMarginChange" />
        <InputNumber v-model:value="pageSettings.margins.bottom" :step="0.1" :min="0" :max="10" :precision="2"
          size="small" addon-before="下：" addon-after="cm" @change="handleCustomMarginChange" />
        <InputNumber v-model:value="pageSettings.margins.left" :step="0.1" :min="0" :max="10" :precision="2"
          size="small" addon-before="左：" addon-after="cm" @change="handleCustomMarginChange" />
        <InputNumber v-model:value="pageSettings.margins.right" :step="0.1" :min="0" :max="10" :precision="2"
          size="small" addon-before="右：" addon-after="cm" @change="handleCustomMarginChange" />
      </div>
    </div>
    <Divider type="vertical" style="height: 100%;"></Divider>
    <!-- 纸张方向设置 -->
    <div class="orientation-settings">
      <Dropdown placement="bottom" :trigger="['click']">
        <Button :icon="h(IconPageOrientation)" size="small">纸张方向
          <DownOutlined />
        </Button>
        <template #overlay>
          <Menu @click="handleOrientationChange">
            <MenuItem v-for="option in orientationOptions" :key="option.value">
            <div class="orientation-item">
              <component :is="option.icon" style="margin-right: 8px;" />
              {{ option.label }}
            </div>
            </MenuItem>
          </Menu>
        </template>
      </Dropdown>
    </div>

    <!-- 纸张大小设置 -->
    <div class="paper-size-settings">
      <Dropdown placement="bottom" :trigger="['click']">
        <Button :icon="h(IconPageSize)" size="small">纸张大小
          <DownOutlined />
        </Button>
        <template #overlay>
          <Menu @click="handlePaperSizeChange">
            <MenuItem v-for="size in paperSizes" :key="size.name">
            <div class="paper-size-item">
              <div class="paper-size-info">
                <div class="size-name">{{ size.name }}</div>
                <div class="size-dimensions">{{ size.label }}</div>
              </div>
            </div>
            </MenuItem>
          </Menu>
        </template>
      </Dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h, ref } from 'vue'
import { Button, Dropdown, Menu, MenuItem, InputNumber, Divider } from 'ant-design-vue'
import type { MenuProps } from 'ant-design-vue'
import {
  VerticalAlignMiddleOutlined,
  FileTextOutlined,
  RotateRightOutlined,
  DownOutlined
} from '@ant-design/icons-vue'
import { IconPageMargin, IconPageOrientation, IconPageSize } from '@snail-js/vue'

import { Editor } from '@tiptap/core'

import type { MarginPreset, PaperSize, PageSettings } from '../extensions/page.bak/typing'
import { Units } from '../extensions/page.bak/typing'
import { PaperFormat } from '../extensions/page.bak/typing/paper'


const props = defineProps({
  editor: {
    type: Object as () => Editor,
    default: () => null
  }
})

// 页边距预设选项
const marginPresets: MarginPreset[] = [
  {
    name: '普通',
    iconClass: 'normal',
    margins: { top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 }
  },
  {
    name: '窄',
    iconClass: 'narrow',
    margins: { top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 }
  },
  {
    name: '适中',
    iconClass: 'medium',
    margins: { top: 2.54, bottom: 2.54, left: 1.91, right: 1.91 }
  }
]

// 纸张方向选项
const orientationOptions = [
  {
    value: 'portrait',
    label: '纵向',
    icon: FileTextOutlined
  },
  {
    value: 'landscape',
    label: '横向',
    icon: RotateRightOutlined
  }
]

// 纸张大小选项
const paperSizes: PaperSize[] = [
  { name: 'A3', width: 297, height: 420, label: 'A3 (297×420 mm)' },
  { name: 'A4', width: 210, height: 297, label: 'A4 (210×297 mm)' },
  { name: 'A5', width: 148, height: 210, label: 'A5 (148×210 mm)' }
]

// 页面设置状态
const pageSettings = ref<PageSettings>({
  margins: { top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 },
  orientation: 'portrait',
  paperFormat: 'A4'
})


// 预设边距选择处理
const handlePresetMarginSelect: MenuProps['onClick'] = ({ key }) => {
  const preset = marginPresets.find(p => p.name === key)
  if (preset) {
    pageSettings.value.margins = { ...preset.margins }
    const marginsValue = {
      top: `${preset.margins.top}${Units.cm}` as `${number}${Units}`,
      bottom: `${preset.margins.bottom}${Units.cm}` as `${number}${Units}`,
      left: `${preset.margins.left}${Units.cm}` as `${number}${Units}`,
      right: `${preset.margins.right}${Units.cm}` as `${number}${Units}`
    }
    console.log('设置页边距:', marginsValue)
    props.editor.commands.setPageMargins(marginsValue)
    applyPageSettings()
  }
}

// 自定义边距变更处理
const handleCustomMarginChange = () => {
  applyPageSettings()
}

// 纸张方向变更处理
const handleOrientationChange: MenuProps['onClick'] = ({ key }) => {

  const orientationValue = key as 'portrait' | 'landscape'
  pageSettings.value.orientation = orientationValue
  props.editor.commands.setPageOrientation(orientationValue)
  applyPageSettings()
}

// 纸张大小变更处理
const handlePaperSizeChange: MenuProps['onClick'] = ({ key }) => {
  const paperFormat = key as PaperFormat
  pageSettings.value.paperFormat = paperFormat
  props.editor.commands.setPageFormat(paperFormat as PaperFormat)
  applyPageSettings()
}

// 应用页面设置
const applyPageSettings = () => {
  // 这里可以集成到 TipTap 编辑器或其他页面设置逻辑
  console.log('应用页面设置:', pageSettings.value)
  // TODO: 与编辑器集成
}
</script>

<style scoped>
.tool-page {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  height: 100%;
}

.margin-settings {
  display: flex;
  gap: 5px;
  align-items: center;
}

.custom-margins {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  width: 160px;
  height: 100%;
}

.custom-margins :deep(.ant-input-number) {
  width: 65px;
}

.orientation-settings .ant-btn,
.paper-size-settings .ant-btn {
  min-width: 80px;
}

/* 边距预设选项样式 */
.margin-preset-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.margin-icon {
  width: 20px;
  height: 16px;
  border: 2px solid #1890ff;
  background: transparent;
  flex-shrink: 0;
}

.margin-icon.narrow {
  border-width: 1px;
}

.margin-icon.medium {
  border-width: 1.5px;
}

.margin-icon.normal {
  border-width: 2px;
}

.margin-info {
  display: flex;
  flex-direction: column;
}

.preset-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.preset-values {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

/* 方向选项样式 */
.orientation-item {
  display: flex;
  align-items: center;
}

/* 纸张大小选项样式 */
.paper-size-item {
  display: flex;
  align-items: center;
}

.paper-size-info {
  display: flex;
  flex-direction: column;
}

.size-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.size-dimensions {
  font-size: 12px;
  color: #666;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tool-page {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .margin-settings {
    flex-direction: column;
    gap: 4px;
  }

  .custom-margins {
    justify-content: space-between;
  }
}
</style>