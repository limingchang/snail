<template>
  <div class="docx-design">
    <div class="design-toolbar">
      <!-- 主工具栏 -->
      <!-- <div class="toolbar-group">
        <button 
          @click="activeTab = 'styles'" 
          :class="{ active: activeTab === 'styles' }"
        >样式</button>
        <button 
          @click="activeTab = 'insert'" 
          :class="{ active: activeTab === 'insert' }"
        >插入</button>
        <button 
          @click="activeTab = 'references'" 
          :class="{ active: activeTab === 'references' }"
        >引用</button>
        <button 
          @click="activeTab = 'page'" 
          :class="{ active: activeTab === 'page' }"
        >页面</button>
        <button 
          @click="activeTab = 'custom'" 
          :class="{ active: activeTab === 'custom' }"
        >自定义</button>
      </div> -->

      <!-- 样式工具栏 -->
      <div v-show="activeTab === 'styles'" class="toolbar-panel">
        <div class="panel-section">
          <h4>预设样式</h4>
          <select v-model="selectedStyle">
            <option v-for="style in presetStyles" :value="style">{{ style }}</option>
          </select>
        </div>
        <div class="panel-section">
          <h4>样式设置</h4>
          <!-- 样式设置控件 -->
        </div>
      </div>

      <!-- 插入工具栏 -->
      <div v-show="activeTab === 'insert'" class="toolbar-panel">
        <button @click="insertImage">图片</button>
        <button @click="insertLink">链接</button>
        <button @click="insertTextBox">文本框</button>
      </div>

      <!-- 引用工具栏 -->
      <div v-show="activeTab === 'references'" class="toolbar-panel">
        <button @click="createVariable">创建变量</button>
        <button @click="insertSystemVariable">引用系统变量</button>
      </div>

      <!-- 页面工具栏 -->
      <div v-show="activeTab === 'page'" class="toolbar-panel">
        <button @click="setMargins">页边距</button>
        <button @click="setPageSize">页面大小</button>
        <button @click="editHeaderFooter">页眉页脚</button>
        <button @click="addWatermark">水印</button>
      </div>

      <!-- 自定义工具栏 -->
      <div v-show="activeTab === 'custom'" class="toolbar-panel">
        <!-- 自定义工具栏内容 -->
      </div>
    </div>
    <STab v-model="activeTab">
      <STabItem name="styles" label="样式">
        <div class="panel-section">
          <h4>预设样式</h4>
          <select v-model="selectedStyle">
            <option v-for="style in presetStyles" :value="style">{{ style }}</option>
          </select>
        </div>
        <div class="panel-section">
          <h4>样式设置</h4>
          <!-- 样式设置控件 -->
        </div>
      </STabItem>
      <STabItem name="insert" label="插入">
        <button @click="insertImage">图片</button>
        <button @click="insertLink">链接</button>
        <button @click="insertTextBox">文本框</button>
      </STabItem>
      <STabItem name="references" label="引用">
        <button @click="createVariable">创建变量</button>
        <button @click="insertSystemVariable">引用系统变量</button>
      </STabItem>
    </STab>
    <div class="design-container" contenteditable="true">
      <!-- 文档设计画布 -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { STab, STabItem } from '../tab'

const activeTab = ref('styles')
const selectedStyle = ref('')
const presetStyles = ref(['正文', '标题1', '标题2', '标题3'])

const insertImage = () => {
  // 插入图片逻辑
}

const insertLink = () => {
  // 插入链接逻辑
}

const insertTextBox = () => {
  // 插入文本框逻辑
}

const createVariable = () => {
  // 创建变量逻辑
}

const insertSystemVariable = () => {
  // 引用系统变量逻辑
}

const setMargins = () => {
  // 设置页边距逻辑
}

const setPageSize = () => {
  // 设置页面大小逻辑
}

const editHeaderFooter = () => {
  // 编辑页眉页脚逻辑
}

const addWatermark = () => {
  // 添加水印逻辑
}
</script>

<style scoped>
.docx-design {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.design-toolbar {
  background: #f5f5f5;
  padding: 8px;
  border-bottom: 1px solid #ddd;
}

.toolbar-group {
  display: flex;
  gap: 0;
  margin-bottom: 0;

  button {
    padding: 8px 16px;
    background: #fff;
    border: 1px solid #ddd;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    position: relative;
    z-index: 1;
    margin-right: 4px;
    transition: all 0.2s ease;

    &:not(.active) {
      background: #f0f0f0;
      border-bottom: 1px solid #ddd;
      border-radius: 8px;
    }

    &.active {
      border-bottom-color: #fff;
      margin-bottom: -1px;
      box-shadow: none;
      z-index: 2;
      font-weight: bold;
      color: #1890ff;

      /* 新增向外弧度效果 */
      &:after {
        content: '';
        position: absolute;
        bottom: 5px;
        left: 16px;
        right: 16px;
        height: 2px;
        background: #1890ff;
        border-radius: 0;
      }
    }
  }
}

.toolbar-panel {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 0 8px 8px 8px;
  margin-top: -1px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.panel-section {
  margin-right: 16px;
}

.design-container {
  flex: 1;
  padding: 16px;
  overflow: auto;
  border: 1px solid #ddd;
  margin: 8px;
}
</style>