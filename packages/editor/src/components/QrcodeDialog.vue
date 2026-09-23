<template>
  <el-dialog
    v-model="visible"
    class="s-editor-dialog"
    :title="t.qrcode.dialogTitle"
    width="440px"
    append-to-body
    destroy-on-close
  >
    <QrcodeForm :editor="editor" :locale="locale" />
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * `QrcodeDialog` —— 二维码的选项弹窗。
 *
 * ## 为什么要有它
 *
 * 「二维码插入后应该弹出选项」以及「可随时点击二维码调整，和变量类似」都是同一条要求：二维码
 * 的选项不能只藏在工具栏的一个区块里。设计模式下点击页面上的二维码，或从「插入」区块插入一个
 * 码之后，这个弹窗就会出现。
 *
 * ## 它不拥有任何状态
 *
 * 表单从**文档**里读（{@link QrcodeForm} 的每一个控件都如此），所以弹窗不需要、也不持有
 * 「正在编辑哪个码」这类状态：命令通过选区找到那个码，而 `VariableDialog` 那种「把属性复制
 * 进来」的做法在这里既没必要，也会引入第二份会失步的数据。
 *
 * ## 为什么由 `SEditor` 拥有
 *
 * 与变量对话框同一个理由：二维码节点视图自己的点击回调也要打开它，而两个拥有者正是旧版对话框
 * 被共享、并泄漏上一个变量状态的原因（缺陷 27）。
 *
 * `QrcodeDialog` — the QR code's options dialog.
 *
 * ## Why it exists
 *
 * "The options should pop up after a QR code is inserted" and "the code can be clicked to adjust it
 * at any time, like a variable" are one requirement: the options may not live only inside a ribbon
 * section. Clicking the code on the page in design mode, or inserting one from the 插入 section,
 * brings this dialog up.
 *
 * ## It owns no state
 *
 * The form reads from the **document** (every control in {@link QrcodeForm} does), so the dialog
 * needs — and keeps — no notion of "which code is being edited": the commands find it through the
 * selection, and copying the attributes in, as `VariableDialog` does, would only add a second copy
 * that could fall out of step.
 *
 * ## Why `SEditor` owns it
 *
 * The same reason as the variable dialog: the QR node view's own click callback has to open it too,
 * and two owners are exactly how the legacy dialog ended up shared and leaking the previous
 * variable's state (defect 27).
 */

import { computed } from "vue";

import type { Editor } from "@tiptap/core";

import { mergeEditorLocale } from "../editor/locale";
import type { EditorLocale } from "../editor/locale";

import QrcodeForm from "./QrcodeForm.vue";
import { ElDialog } from "element-plus";

defineOptions({ name: "QrcodeDialog" });

const props = withDefaults(
  defineProps<{
    /** 是否打开；配合 `v-model:open` 使用。 / Whether it is open; used with `v-model:open`. */
    open?: boolean;
    /** 编辑器。在它被创建之前为 `undefined`。 / The editor. `undefined` before it exists. */
    editor?: Editor;
    /** 部分语言覆盖。 / Partial locale overrides. */
    locale?: Partial<EditorLocale>;
  }>(),
  { open: false, editor: undefined, locale: undefined }
);

const emits = defineEmits<{
  /** 打开状态变化；配合 `v-model:open` 使用。 / The open state changed; used with `v-model:open`. */
  "update:open": [value: boolean];
}>();

/** 对话框的开关，写回给宿主。 / The dialog's switch, written back to the host. */
const visible = computed<boolean>({
  get: () => props.open === true,
  set: (value) => emits("update:open", value)
});

const t = computed(() => mergeEditorLocale(props.locale));
</script>
