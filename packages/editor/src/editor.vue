<template>
  <div class="s-editor">
    <ToolBar :editor="editor" :options="options" :tools="tools" v-if="mode == 'design'"></ToolBar>
    <EditorContent class="editor-content" :editor="editor"
      :style="`--layout-line-style:${mode === 'view' ? 'none' : 'dashed'}`"></EditorContent>
    <div class="editor-footer">
      <Button type="primary" :icon="h(FileWordOutlined)" @click="handlerExport">导出</Button>
      <Button type="primary" color="#ccc" :icon="h(PrinterOutlined)">打印</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { Button } from "ant-design-vue"
import { PrinterOutlined, FileWordOutlined } from '@ant-design/icons-vue'
import { useEditor, EditorContent } from "@tiptap/vue-3";

import { Page } from "./extensions/page/index"
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Heading } from "@tiptap/extension-heading";
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { Underline } from "@tiptap/extension-underline";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";

import { ParagraphStyle } from "./extensions/paragraphStyle/index";

import { QRCode } from "./extensions/QRCode/index";
import { Variable } from "./extensions/variable/index";

import { LayoutMode } from "./extensions/layoutMode/index";
import { fixLayoutTable } from "./extensions/layoutMode/fixLayout";

import ToolBar from "./components/toolBar.vue";

import { defaultContent } from "./contents/default";

import { EditorOptions } from "./typing/index";

import { VariableType } from './extensions/variable/typing'

const defaultTools = ['style', 'insert', 'page']

const defaultOptions: EditorOptions = {
  mode: 'design',
  tools: defaultTools,
  options: {
    variable: {
      exlude: [VariableType.InnerVariable]
    }
  }
}


const props = defineProps<EditorOptions>();

const mode = computed(() => props.mode || defaultOptions.mode)
const tools = computed(() => props.tools || defaultOptions.tools)
const doc = computed(() => props.doc || defaultContent)
const options = computed(() => {
  if (props.options) {
    return Object.assign({}, defaultOptions.options, props.options)
  }
  return defaultOptions.options
})



const editor = useEditor({
  extensions: [
    Document,
    Page.configure({
      pageHeaderText: '页眉',
      pageHeaderHeight: 35,
      pageHeaderPositon: 'right',
      pageHeaderLine: true,
      pageFooterText: (index, total) => `第${index}页，共${total}页`,
    }),
    LayoutMode.configure({
      types: ["tableRow"],
    }),
    Text,
    // 首先加载 ParagraphStyle，确保属性定义优先生效
    ParagraphStyle,
    Paragraph,
    Heading.configure({
      levels: [1, 2, 3, 4],
    }),
    TextStyleKit,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Bold,
    Italic,
    Underline,
    TableKit.configure({
      table: {
        resizable: true,
      },
    }),
    QRCode,
    Variable.configure({
      // mode:'view'
    }),
  ],
  content: doc.value,
  // autofocus: true,
  onUpdate({ editor, transaction, appendedTransactions }) {
    fixLayoutTable(editor)
  },
  onCreate({ editor }) {
    editor.chain().focus('end').run();
  }
});

const handlerExport = () => {
  console.log(editor.value?.getJSON());
};
</script>

<style scoped lang="scss">
$selectedBorderColor: #109968;

.s-editor {
  width: 100%;
  height: 100vh;
  /* 设置明确的高度，而不是 100% */
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .editor-content {
    flex: 1;
    /* 使用 flex 属性控制高度 */
    padding: 5mm;
    background-color: #ccc;
    min-width: calc(100% - 10mm);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    /* 确保内容从顶部开始布局 */
    overflow-y: auto;
    /* 改为 auto，只在必要时显示滚动条 */
    overflow-x: hidden;

    /* 自定义滚动条样式 */
    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: #1677ff;
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background: #0958d9;
    }

    /* Firefox 滚动条样式 */
    scrollbar-width: thin;
    scrollbar-color: #1677ff rgba(0, 0, 0, 0.1);

    :deep(.tiptap) {
      outline: none;
      background-color: #fff;
      min-height: 297mm;
      /* A4纵向高度作为最小高度，移除 !important */
      height: auto;
      /* 确保高度能够自动调整，移除 !important */
      flex-shrink: 0;
      /* 防止在flex布局中被压缩，移除 !important */
      overflow: visible;
      /* 确保内容可以超出容器，移除 !important */
      width: 210mm;
      margin: 0;
      /* padding: 20mm; */
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      box-sizing: border-box;
      position: relative;

      /* 确保内容正常流动 */
      display: block;
      word-wrap: break-word;

      &.resize-cursor {
        cursor: ew-resize;
        cursor: col-resize;
      }

      .tiptap-page {
        height: auto;
        position: relative;

        /* PageContent样式约束 */
        .tiptap-page-header {
          position: relative;
          width: 100%;
          overflow: hidden;

          /* 在设计模式下的边框提示 */
          >div:hover {
            border: 1px dashed #1677ff;
            // box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
          }

          /* 选中状态样式 */
          &.ProseMirror-selectednode {
            border-color: #1677ff;
            box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
          }
        }

        .tiptap-page-content {
          position: relative;
          width: 100%;
          min-height: 20mm;
          overflow: hidden;
          box-sizing: border-box;

          /* 确保内容不会溢出 */
          overflow-wrap: break-word;
          word-wrap: break-word;
          word-break: break-word;

          /* 防止内容绝对定位溢出 */
          contain: layout style;

          /* 强制所有子元素保持在容器内 */
          >* {
            max-width: 100%;
            position: relative;
          }


        }

        .tiptap-page-header,
        .tiptap-page-footer {
          display: flex;
          // position: absolute;
          width: 100%;
          box-sizing: border-box;
        }
      }

    }

    /* 添加 ProseMirror 特定样式重置 */
    :deep(.ProseMirror) {
      height: auto !important;
      min-height: inherit;
      overflow: visible !important;
      display: block;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    :deep(table) {
      //
      border-collapse: collapse;

      tr.layout-mode {

        td,
        th {
          width: 80px;
          border-style: var(--layout-line-style);
        }
      }

      td,
      th {
        border: 1px solid #000;
        padding: 5px;
        position: relative;
        width: 120px;

        .column-resize-handle {
          background-color: #409eff;
          bottom: 0px;
          pointer-events: none;
          position: absolute;
          right: -1px;
          top: 0;
          width: 2px;
          // height: 100%;
        }
      }

      th {
        text-align: center;
        font-weight: bold;
      }

      /* 选中单元格的智能边框样式 - 只显示外框 */
      .selectedCell {
        position: relative;

        /* 背景高亮 */
        &::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(64, 158, 255, 0.1);
          pointer-events: none;
          z-index: 1;
        }
      }

      /* 选中单元格的智能边框样式 - 使用伪元素实现精确控制 */
      .selectedCell {
        position: relative;

        /* 背景高亮 */
        &::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(64, 158, 255, 0.1);
          pointer-events: none;
          z-index: 1;
        }

        /* 使用after伪元素创建边框 */
        &::after {
          content: "";
          position: absolute;
          top: -1px;
          left: -1px;
          right: -1px;
          bottom: -1px;
          border: 2px solid $selectedBorderColor;
          pointer-events: none;
          z-index: 2;
        }
      }

      /* 左侧有选中单元格时，去除左边框 */
      .selectedCell+.selectedCell::after {
        border-left: none;
        left: 0;
      }

      /* 上方有选中单元格时，去除上边框 */
      tr:has(.selectedCell)+tr .selectedCell::after {
        border-top: none;
        top: 0;
      }
    }
  }

  .editor-footer {
    display: flex;
    justify-content: flex-end;
    padding: 5px;

    :last-child {
      margin-left: 10px;
    }
  }
}
</style>
