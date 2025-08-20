<template>
  <div class="s-editor">
    <ToolBar :editor="editor"></ToolBar>
    <EditorContent class="editor-content" :editor="editor"></EditorContent>
  </div>
  <div @click="testExport">测试导出</div>
</template>

<script setup lang="ts">
import { Editor, useEditor, EditorContent } from '@tiptap/vue-3'
import { Document } from '@tiptap/extension-document'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { Heading } from '@tiptap/extension-heading'
// import { HeadingPro } from './extensions/heading'
import { Bold } from '@tiptap/extension-bold'
import { Italic } from '@tiptap/extension-italic'
import { Underline } from '@tiptap/extension-underline'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'


import ToolBar from './components/toolBar.vue';

const editor = useEditor({
  extensions: [
    Document,
    Paragraph.configure({
      HTMLAttributes: {
        style: 'text-indent: 2em;line-height: 1.5;',
      },
    }),
    Text,
    TextStyleKit,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Heading.configure({
      levels: [1, 2, 3, 4],
    }),
    Bold,
    Italic,
    Underline,
  ],
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hello World!',
          }
        ]
      }
    ]
  },
})

const testExport = () => {
  console.log(editor.value?.getJSON())
}

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
    }
  }
}
</style>