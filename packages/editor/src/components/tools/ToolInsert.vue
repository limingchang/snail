<template>
  <div class="s-tool-insert">
    <div class="s-tool-insert__group">
      <!-- The variable dialog is owned by `SEditor`, not by this panel: the variable node
           view's own click callback opens it too, and two owners is exactly how the legacy
           dialog ended up shared and leaking the previous variable's state. -->
      <el-button size="small" @click="emits('insertVariable')">
        <SIcon :icon="IconVariable" />
        <span class="s-tool-insert__label">{{ t.insert.variable }}</span>
      </el-button>

      <el-button size="small" :disabled="!qrcodeReady" @click="insertQrcode">
        <SIcon :icon="IconQRCode" />
        <span class="s-tool-insert__label">{{ t.insert.qrcode }}</span>
      </el-button>
    </div>

    <el-divider direction="vertical" class="s-tool-insert__divider" />

    <div class="s-tool-insert__group s-tool-insert__group--column">
      <el-button size="small" :disabled="!pageReady" @click="addNewPage">
        <SIcon :icon="IconNewPage" />
        <span class="s-tool-insert__label">{{ t.insert.newPage }}</span>
      </el-button>
      <!-- Defect 21: the legacy 「分页」 button had no handler at all. It is wired to
           `insertPageBreak` here, and disabled when the extension is not registered. -->
      <el-button size="small" :disabled="!pageReady" @click="insertPageBreak">
        <el-icon><Scissor /></el-icon>
        <span class="s-tool-insert__label">{{ t.insert.pageBreak }}</span>
      </el-button>

      <el-upload
        :auto-upload="false"
        :show-file-list="false"
        accept="image/*"
        :on-change="onImageSelected"
      >
        <el-button size="small">
          <SIcon :icon="IconFileUpload" />
          <span class="s-tool-insert__label">{{ t.insert.image }}</span>
        </el-button>
      </el-upload>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolInsert` —— *插入*面板：变量、二维码、页面、分页符、图片。
 *
 * ## 为什么表格控件搬走了
 *
 * 这个面板以前还放着两个表格网格和八个单元格/行/列操作，把两件不同的事混在一起：「往文档里
 * 放一个新东西」和「改动光标所在的那张表」。表格工具现在住在自己的 `table` 区块里，所以本
 * 面板只讲插入。
 *
 * ## 二维码的内容
 *
 * 内容为空的二维码毫无价值，而扩展自己的默认文本就是空字符串，所以这个按钮会自行推导一个：
 * 文档的第一个标题，取不到时回退到 {@link STARTER_QR_TEXT}。这样按钮点一下就有用，也绝不
 * 会插入一个什么都没编码的码。内容之后可以在「二维码」区块里编辑，尺寸、位置、颜色和边距
 * 也都在那里。
 *
 * ## 这里修好的问题
 *
 * - 「分页」现在会调用 `insertPageBreak`；在旧版工具栏里它**完全没有处理函数**（缺陷 21），
 *   而它本该调用的五个命令只声明过、从未实现。
 * - `el-input-number` 上没有 `addon-before`/`addon-after`：那个 API 并不存在，旧版页面面板
 *   却照样调用（缺陷 42）。
 *
 * `ToolInsert` — the *insertion* pane: a variable, a QR code, a page, a page break, an image.
 *
 * ## Why the table controls left
 *
 * This pane used to hold the two table grids and the eight cell/row/column operations as
 * well, which mixed two different jobs: "put a new thing into the document" and "change the
 * table the caret is standing in". The table tools now live in their own `table` section, so
 * this pane describes insertion only.
 *
 * ## The QR payload
 *
 * A QR code with an empty payload is worthless, and the extension's own default text is the
 * empty string, so this button derives one: the document's first heading, falling back to
 * {@link STARTER_QR_TEXT}. That makes the button useful in one click and never inserts a code
 * that encodes nothing. The payload is editable afterwards in the 二维码 section, which is
 * where size, position, colour and margin live.
 *
 * ## What is fixed here
 *
 * - 「分页」 now calls `insertPageBreak`; in the legacy toolbar it had **no handler at all**
 *   (defect 21), and the five commands it should have called were declared but never
 *   implemented.
 * - No `addon-before`/`addon-after` on `el-input-number`: that API does not exist, and the
 *   legacy page panel called it anyway (defect 42).
 */

import { computed, ref } from "vue";
import type { JSONContent } from "@tiptap/core";

import { Scissor } from "@element-plus/icons-vue";
import type { UploadFile } from "element-plus";

import { SIcon } from "@snail-js/vue";
import { IconFileUpload, IconNewPage, IconQRCode, IconVariable } from "@snail-js/vue";

import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { STARTER_QR_TEXT } from "../../editor/starter";
import { useEditorSelection } from "../../editor/useEditorSelection";
import { ElMessage, ElButton, ElDivider, ElIcon, ElUpload } from "element-plus";

defineOptions({ name: "ToolInsert" });

/**
 * 本面板的 props：编辑器实例与语言覆盖，二者都来自 `ToolProps`，默认均为 `undefined`。
 *
 * This panel's props: the editor and the locale override, both from `ToolProps` and both
 * defaulting to `undefined`.
 */
const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const emits = defineEmits<{
  /**
   * 用户要求插入一个变量；对话框由 `SEditor` 负责。
   *
   * The user asked to insert a variable; `SEditor` owns the dialog.
   */
  insertVariable: [];
}>();

const t = computed(() => mergeEditorLocale(props.locale));

/**
 * 在每次选区或文档变化时自增，好让扩展检查重新求值。
 *
 * Bumped on every selection/document change so the extension checks re-evaluate.
 */
const revision = ref(0);

useEditorSelection(
  () => props.editor,
  () => {
    revision.value += 1;
  }
);

/**
 * 当名为 `name` 的扩展已注册、即其命令存在时为 `true`。
 *
 * `true` when an extension with this name is registered, i.e. its commands exist.
 */
function hasExtension(name: string): boolean {
  // `revision` is read so the answer is recomputed when the extension set could have
  // changed; the manager itself is not reactive.
  void revision.value;
  return props.editor?.extensionManager.extensions.some((extension) => extension.name === name) ?? false;
}

const pageReady = computed(() => hasExtension("page"));
const qrcodeReady = computed(() => hasExtension("qrcode"));

/** 在当前页之后新增一页。 / Add a page after the current one. */
function addNewPage(): void {
  if (!pageReady.value) {
    ElMessage.warning(t.value.notReady);
    return;
  }
  props.editor?.chain().focus().addNewPage().run();
}

/**
 * 插入一个显式分页符 —— 旧版按钮从未有过的处理函数。
 *
 * Insert an explicit page break — the handler the legacy button never had.
 */
function insertPageBreak(): void {
  if (!pageReady.value) {
    ElMessage.warning(t.value.notReady);
    return;
  }
  props.editor?.chain().focus().insertPageBreak().run();
}

/**
 * 在文档 JSON 树里深度优先查找第一个标题的文本。
 *
 * Depth-first search for the first heading's text in a document JSON tree.
 */
function findHeadingText(node: JSONContent | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "heading") {
    const value = (node.content ?? [])
      .map((child) => child.text ?? "")
      .join("")
      .trim();
    if (value !== "") return value;
  }
  for (const child of node.content ?? []) {
    const found = findHeadingText(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * 插入一个内容取自文档自身标题的二维码。
 *
 * 从调用方看 `insertQRCode` 是同步的 —— 它返回插入是否被接受，并在后台生成位图（有在途
 * 保护，所以双击不会插入两个码）。
 *
 * Insert a QR code whose payload is the document's own title.
 *
 * `insertQRCode` is synchronous from the caller's side — it returns whether the insertion was
 * accepted and generates the raster in the background (there is an in-flight guard, so a
 * double click cannot insert two codes).
 */
function insertQrcode(): void {
  const editor = props.editor;
  if (!editor) return;

  const text = findHeadingText(editor.getJSON()) ?? STARTER_QR_TEXT;
  const accepted = editor.chain().focus().insertQRCode({ text }).run();

  if (!accepted) ElMessage.warning(t.value.notReady);
}

/**
 * 把选中的文件读成 data URL，使文档保持自包含。
 *
 * Read a picked file as a data URL, so the document stays self-contained.
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("image read produced a non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("image read failed"));
    reader.readAsDataURL(file);
  });
}

/** 把选中的图片作为行内图片插入。 / Insert the picked image inline. */
async function onImageSelected(file: UploadFile): Promise<void> {
  const editor = props.editor;
  const raw = file.raw;
  if (!editor || !raw) return;

  try {
    const source = await readAsDataUrl(raw);
    editor.chain().focus().setImage({ src: source, alt: file.name }).run();
  } catch {
    // The failure is a *read* failure (an unreadable file, a revoked permission), not a
    // document failure; the document is untouched, so a message is the whole response.
    ElMessage.error(t.value.loadFailed);
  }
}
</script>

<style scoped lang="scss">
.s-tool-insert {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 560px;

  &__group {
    display: flex;
    align-items: center;
    gap: 5px;

    &--column {
      flex-direction: column;
      align-items: stretch;
    }
  }

  &__divider {
    height: auto;
    align-self: stretch;
  }

  &__label {
    margin-left: 4px;
  }
}
</style>
