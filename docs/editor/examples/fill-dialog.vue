<script setup lang="ts">
/**
 * 填写模式：文档是只读的，变量按值渲染。
 *
 * `data` 就是填写数据，按变量 `key` 取值；`openFillDialog()` 来自
 * `SEditorExposed`，由组件 `ref` 暴露。它不修改文档，只把新的填写数据交给
 * 变量的渲染层。
 */
import { ref } from "vue";
import { SEditor } from "@snail-js/editor";
import type { SEditorExposed, TemplateContent, VariableFillData } from "@snail-js/editor";

const editorRef = ref<SEditorExposed>();

const doc = ref<TemplateContent>({
  type: "doc",
  content: [
    {
      type: "page",
      content: [
        {
          type: "pageContent",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "甲方：" },
                { type: "variable", attrs: { label: "甲方名称", key: "partyA", data: { type: "text" } } }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "合同金额（小写）：" },
                {
                  type: "variable",
                  attrs: {
                    label: "合同金额",
                    key: "amount",
                    data: { type: "money", precision: 2, currency: "￥", thousands: true }
                  }
                }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "合同金额（大写）：" },
                {
                  type: "variable",
                  attrs: {
                    label: "金额大写",
                    key: "amountUpper",
                    data: { type: "formula", expression: "amount", prefix: "人民币" }
                  }
                }
              ]
            }
          ]
        },
        {
          type: "pageFooter",
          content: [
            {
              type: "paragraph",
              content: [{ type: "pageNumber", attrs: { format: "第{page}页，共{total}页" } }]
            }
          ]
        }
      ]
    }
  ]
});

const values = ref<VariableFillData>({
  partyA: "杭州某某科技有限公司",
  amount: 1234567.89
});
</script>

<template>
  <div class="demo-mode-bar">
    <span>填写模式，文档只读；点右侧按钮打开填写对话框。</span>
    <button type="button" @click="editorRef?.openFillDialog()">打开填写对话框</button>
  </div>
  <div class="demo-editor-stage">
    <SEditor ref="editorRef" v-model="doc" mode="fill" :data="values" :tools="[]" />
  </div>
</template>

<style scoped>
.demo-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.demo-mode-bar button {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
</style>
