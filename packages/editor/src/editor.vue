<template>
  <div class="s-editor">
    <ToolBar :editor="editor"></ToolBar>
    <EditorContent class="editor-content" :editor="editor"></EditorContent>
  </div>
  <div @click="testExport">测试导出</div>
</template>

<script setup lang="ts">
import { Editor, useEditor, EditorContent } from "@tiptap/vue-3";
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
// import { TableKit } from "./extensions/table/tableKit";

import { ParagraphStyle } from "./extensions/paragraphStyle/index";

// import { Image } from '@tiptap/extension-image'
import { QRCode } from "./extensions/QRCode/index";
import { Variable } from "./extensions/variable/index";

import ToolBar from "./components/toolBar.vue";

import { defaultContent } from "./contents/default";

const editor = useEditor({
  extensions: [
    Document.configure({
      HTMLAttributes: {
        style: "padding: 10mm;",
      },
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
    // TextIndent,
    // Image,
    QRCode,
    Variable.configure({
      // mode:'view'
    }),
  ],
  content: defaultContent,
  autofocus: true,
});

const testExport = () => {
  console.log(editor.value?.getJSON());
};
</script>

<style scoped lang="scss">
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
      border-collapse: collapse;

      td,
      th {
        border: 1px solid #000;
        padding: 5px;
        position: relative;

        div.column-resize-handle {
          background-color: #409EFF;
          bottom: 0px;
          pointer-events: none;
          position: absolute;
          right: -1px;
          top: 0;
          width: 2px;
          // height: 100%;
        }
      }

    }
  }
}
</style>
