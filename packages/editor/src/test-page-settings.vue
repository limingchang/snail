<template>
  <div class="test-container">
    <h2>页面设置功能测试</h2>
    <div class="toolbar-test">
      <ToolPage />
    </div>
    <div class="preview-area">
      <h3>当前设置预览：</h3>
      <div class="settings-display">
        <p>页边距: 上下左右的设置会在这里显示</p>
        <p>纸张方向: 纵向/横向</p>
        <p>纸张大小: A3/A4/A5</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ToolPage from './components/toolPage.vue'
</script>

<style scoped>
.test-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.toolbar-test {
  border: 1px solid #d9d9d9;
  padding: 10px;
  margin: 20px 0;
  border-radius: 6px;
  background: #fafafa;
}

.preview-area {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
}

.settings-display {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  margin-top: 10px;
}
</style>