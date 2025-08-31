<template>
  <div class="s-editor">
    <ToolBar :editor="editor" :options="toolBars" :variable="toolBars?.variable"></ToolBar>
    <EditorContent
      class="editor-content"
      :editor="editor"
      :style="`--layout-line-style:${mode === 'view' ? 'none' : 'dashed'}`"
    ></EditorContent>
  </div>
  <div @click="testExport">测试导出</div>
</template>

<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
// import { ParagraphPro } from './extensions/paragraphPro/index'
import { Text } from "@tiptap/extension-text";
import { Heading } from "@tiptap/extension-heading";
// import { HeadingPro } from './extensions/heading'
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { Underline } from "@tiptap/extension-underline";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
// import { TextIndent } from "./extensions/textIndent/index";
import { TableKit } from "@tiptap/extension-table";
// import { Table,TableRow,TableHeader,TableCell } from "@tiptap/extension-table";
// import { TableKit } from "./extensions/table/tableKit";

import { ParagraphStyle } from "./extensions/paragraphStyle/index";

// import { Image } from '@tiptap/extension-image'
import { QRCode } from "./extensions/QRCode/index";
import { Variable } from "./extensions/variable/index";

import { LayoutMode } from "./extensions/layoutMode/index";
import { fixLayoutTable } from "./extensions/layoutMode/fixLayout";

import ToolBar from "./components/toolBar.vue";

import { defaultContent } from "./contents/default";

import { EditorOptions } from "./typing/index";

const { mode = "design", doc = undefined } = defineProps<EditorOptions>();

const editor = useEditor({
  extensions: [
    Document.configure({
      HTMLAttributes: {
        style: "padding: 10mm;",
      },
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
  content: doc || defaultContent,
  autofocus: true,
  onUpdate({ editor, transaction, appendedTransactions }) {
    fixLayoutTable(editor)
  },
});

const testExport = () => {
  console.log(editor.value?.getJSON());
};
</script>

<style scoped lang="scss">
$selectedBorderColor: #109968;

.s-editor {
  width: 100%;
  height: 100%;

  .editor-content {
    padding: 3mm;
    background-color: #ccc;

    :deep(.tiptap) {
      outline: none;
      background-color: #fff;
      min-height: 297mm;
      /* A4纵向高度 */
      max-width: 210mm;
      /* A4宽度 */
      margin: 0 auto;
      /* 居中显示 */
      padding: 20mm;
      /* 页边距 */
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      /* 添加阴影效果 */
      border-radius: 4px;
      /* 轻微圆角 */
      box-sizing: border-box;
      /* 确保padding不影响总宽度 */
      position: relative;

      &.resize-cursor {
        cursor: ew-resize;
        cursor: col-resize;
      }
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
      .selectedCell + .selectedCell::after {
        border-left: none;
        left: 0;
      }

      /* 上方有选中单元格时，去除上边框 */
      tr:has(.selectedCell) + tr .selectedCell::after {
        border-top: none;
        top: 0;
      }
    }
  }
}
</style>
