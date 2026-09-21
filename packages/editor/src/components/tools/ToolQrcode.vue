<template>
  <div class="s-tool-qrcode">
    <el-form label-width="72px" size="small" class="s-tool-qrcode__form">
      <el-form-item :label="t.qrcode.text">
        <el-input v-model="text" type="textarea" :rows="2" placeholder="https://" />
      </el-form-item>

      <el-form-item :label="t.qrcode.size">
        <el-input-number v-model="size" :min="5" :step="5" :controls="false" class="s-tool-qrcode__number" />
        <el-select v-model="unit" class="s-tool-qrcode__unit">
          <el-option v-for="option in QRCODE_UNITS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </el-form-item>

      <el-form-item :label="t.qrcode.position">
        <span class="s-tool-qrcode__axis">{{ t.qrcode.top }}</span>
        <el-input-number v-model="positionY" :min="0" :step="1" :controls="false" class="s-tool-qrcode__number" />
        <span class="s-tool-qrcode__axis">{{ t.qrcode.left }}</span>
        <el-input-number v-model="positionX" :min="0" :step="1" :controls="false" class="s-tool-qrcode__number" />
      </el-form-item>

      <el-form-item :label="t.qrcode.margin">
        <el-input-number v-model="margin" :min="0" :max="10" :step="1" :controls="false" class="s-tool-qrcode__number" />
        <span class="s-tool-qrcode__axis">{{ t.qrcode.color }}</span>
        <el-color-picker v-model="dark" size="small" />
        <span class="s-tool-qrcode__axis">{{ t.qrcode.background }}</span>
        <el-color-picker v-model="light" size="small" />
      </el-form-item>
    </el-form>

    <div class="s-tool-qrcode__actions">
      <el-button size="small" type="primary" :disabled="!canInsert" @click="insert">
        <el-icon><Plus /></el-icon>
        <span>{{ t.qrcode.insert }}</span>
      </el-button>
      <el-button size="small" :disabled="!exists" @click="update">
        <el-icon><Refresh /></el-icon>
        <span>{{ t.qrcode.update }}</span>
      </el-button>
      <el-button size="small" :disabled="!exists" @click="regenerate">
        <span>{{ t.qrcode.regenerate }}</span>
      </el-button>
      <el-button size="small" type="danger" plain :disabled="!exists" @click="remove">
        <el-icon><Delete /></el-icon>
        <span>{{ t.qrcode.remove }}</span>
      </el-button>
    </div>

    <p class="s-tool-qrcode__hint">{{ exists ? t.qrcode.exists : t.qrcode.notExists }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `ToolQrcode` —— 文档二维码的内容、尺寸、位置和颜色。
 *
 * ## 这里修好的问题
 *
 * - **不再用 `document.querySelector`。** 旧版的更新路径用
 *   `document.querySelector('[data-type="qrcode"]')` 找节点，这是全文档范围的（可能找到
 *   *别的*编辑器的节点），删除后又会返回 `null`，于是下一次交互就抛错（缺陷 33）。现在通过
 *   遍历这个编辑器自己的文档来定位节点。
 * - **不再直接写 DOM。** 旧版的尺寸/位置改动是 `element.style.width = …`，它不在文档里，所以
 *   下一次重渲染、撤销或重新加载时都会丢失（缺陷 32）。这里的每一次改动都走命令或
 *   `setNodeMarkup`。
 * - **一个文档只有一个二维码，由扩展强制。** 旧版检查的是 `storage.qrcode.hasQRCode`，它从不
 *   复位，所以删掉二维码之后，在这个编辑器的余生里都无法再插入一个（缺陷 31）。这里的闸门
 *   每次都去问扩展和文档。
 *
 * `ToolQrcode` — the payload, size, position and colours of the document's QR code.
 *
 * ## What is fixed here
 *
 * - **No `document.querySelector`.** The legacy update path found the node by
 *   `document.querySelector('[data-type="qrcode"]')`, which is document-global (it could
 *   find *another* editor's node) and returned `null` after a delete, so the next
 *   interaction threw (defect 33). The node is located by walking *this* editor's
 *   document.
 * - **No direct DOM writes.** The legacy size/position changes were
 *   `element.style.width = …`, which is not in the document, so they were lost on the
 *   next re-render, on undo and on reload (defect 32). Every change here goes through a
 *   command or through `setNodeMarkup`.
 * - **One QR code per document, enforced by the extension.** The legacy checked
 *   `storage.qrcode.hasQRCode`, which was never reset, so after deleting the code you
 *   could never insert another for that editor's lifetime (defect 31). The gate here asks
 *   the extension and the document every time.
 */

import { computed, ref } from "vue";

import { Delete, Plus, Refresh } from "@element-plus/icons-vue";
import { toDataURL } from "qrcode";

import { findNodes } from "../../editor/documentNodes";
import { toMillimetres } from "../../editor/cssLength";
import { mergeEditorLocale } from "../../editor/locale";
import type { ToolProps } from "../../editor/props";
import { useEditorSelection } from "../../editor/useEditorSelection";
import type { QRCodeInput } from "../../extensions/qrcode";
import { QRCODE_UNITS } from "./constants";
import { ElMessage, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption, ElColorPicker, ElButton, ElIcon } from "element-plus";

defineOptions({ name: "ToolQrcode" });

/**
 * 本面板的 props：编辑器实例与语言覆盖，二者都来自 `ToolProps`，默认均为 `undefined`。
 *
 * This panel's props: the editor and the locale override, both from `ToolProps` and both
 * defaulting to `undefined`.
 */
const props = withDefaults(defineProps<ToolProps>(), { editor: undefined, locale: undefined });

const t = computed(() => mergeEditorLocale(props.locale));

const text = ref("");
const size = ref(30);
const unit = ref<"mm" | "cm" | "px">("mm");
const positionX = ref(10);
const positionY = ref(10);
const margin = ref(1);
const dark = ref("#000000");
const light = ref("#ffffff");

/**
 * 在每次文档变化时自增，好让判断存在性的计算属性保持最新。
 *
 * Bumped on every document change so the existence computeds stay current.
 */
const revision = ref(0);

/**
 * 二维码扩展已注册、即其命令存在时为 `true`。
 *
 * `true` when the QR-code extension is registered, so its commands exist.
 */
const qrcodeReady = computed(
  () => props.editor?.extensionManager.extensions.some((extension) => extension.name === "qrcode") ?? false
);

/** 实时的二维码节点，如果存在的话。 / The live QR-code node, if any. */
const node = computed(() => {
  void revision.value;
  return props.editor ? findNodes(props.editor, "qrcode")[0] : undefined;
});

const exists = computed(() => node.value !== undefined);

/**
 * 以扩展自己的回答为准，文档作为兜底。
 *
 * `hasQRCode` 是扩展该回答的问题 —— 被它取代的那个存储标志是一次性闩锁（缺陷 31）—— 但文档
 * 才是最终权威，所以一个尚未派发的命令给出的 `false` 不会放进第二个码。
 *
 * The extension's own answer, with the document as the fallback.
 *
 * `hasQRCode` is the extension's question to answer — the storage flag it replaced was a
 * write-once latch (defect 31) — but the document is the final authority, so a `false`
 * from a command that has not been dispatched cannot let a second code in.
 */
function hasQrCode(): boolean {
  const editor = props.editor;
  if (!editor || !qrcodeReady.value) return false;
  const answer = editor.commands.hasQRCode();
  return answer === true || findNodes(editor, "qrcode").length > 0;
}

const canInsert = computed(() => {
  void revision.value;
  return qrcodeReady.value && !hasQrCode() && text.value.trim() !== "";
});

/**
 * 把节点的属性重新读进表单，好让面板描述文档。
 *
 * Re-read the node's attributes into the form, so the panel describes the document.
 */
function sync(): void {
  revision.value += 1;

  const attributes = node.value?.attrs;
  if (!attributes) return;

  if (typeof attributes.text === "string") text.value = attributes.text;
  if (typeof attributes.margin === "number") margin.value = attributes.margin;

  const color = attributes.color as { dark?: unknown; light?: unknown } | undefined;
  if (typeof color?.dark === "string") dark.value = color.dark;
  if (typeof color?.light === "string") light.value = color.light;

  const sizeAttr = attributes.size as { value?: unknown; unit?: unknown } | undefined;
  if (typeof sizeAttr?.value === "number") size.value = sizeAttr.value;
  if (sizeAttr?.unit === "mm" || sizeAttr?.unit === "cm" || sizeAttr?.unit === "px") unit.value = sizeAttr.unit;

  const position = attributes.position as { x?: unknown; y?: unknown } | undefined;
  if (typeof position?.x === "number") positionX.value = position.x;
  if (typeof position?.y === "number") positionY.value = position.y;
}

useEditorSelection(() => props.editor, sync);

/**
 * 位图宽度，单位设备像素。
 *
 * 内容在文档里的尺寸是一个 CSS 长度（默认毫米），而 `qrcode` 按像素宽度生成位图。每英寸
 * 96 px 是 CSS 的参考分辨率，所以 30 mm 的码生成约 113 px —— 偏小，但它会被节点视图缩放，
 * 而另一种做法（无论要多大都用 200 px）正是旧版的 bug：请求的尺寸毫无意义。
 *
 * The raster width, in device pixels.
 *
 * The payload's size is a CSS length in the document (millimetres by default), while
 * `qrcode` rasterises at a pixel width. 96 px per inch is the CSS reference resolution,
 * so a 30 mm code rasterises at ~113 px — small, but it is scaled by the node view, and
 * the alternative (200 px regardless of the request) is the legacy bug where a requested
 * size meant nothing.
 */
function rasterWidth(): number {
  const millimetres = toMillimetres(`${size.value}${unit.value}`);
  const pixels = millimetres === undefined ? size.value : (millimetres / 25.4) * 96;
  return Math.max(64, Math.round(pixels));
}

/**
 * 每条命令接收的选项。`QRCodeInput` 是 `Partial<QRCodeAttrs>`。
 *
 * The options every command receives. `QRCodeInput` is `Partial<QRCodeAttrs>`.
 */
function options(source: string): QRCodeInput {
  return {
    text: text.value,
    src: source,
    // The raster is regenerated here from the payload, so the command is given an explicit
    // `src` and does no asynchronous work of its own — a command cannot await.
    alt: text.value,
    size: { value: size.value, unit: unit.value },
    position: { x: positionX.value, y: positionY.value, unit: unit.value },
    // One `QRColor` object, not two flat attributes: the schema stores `{ dark, light }`
    // and that is the shape `qrcode` itself rasterises from.
    color: { dark: dark.value, light: light.value },
    margin: margin.value
  };
}

/** 为当前内容生成位图。 / Generate the raster for the current payload. */
async function render(): Promise<string | undefined> {
  try {
    return await toDataURL(text.value, {
      width: rasterWidth(),
      margin: margin.value,
      color: { dark: dark.value, light: light.value }
    });
  } catch {
    ElMessage.error(t.value.qrcode.insertFailed);
    return undefined;
  }
}

/** 插入文档唯一的那个二维码。 / Insert the document's one QR code. */
async function insert(): Promise<void> {
  const editor = props.editor;
  if (!editor) return;

  if (hasQrCode()) {
    ElMessage.error(t.value.qrcode.exists);
    return;
  }

  const source = await render();
  if (source === undefined) return;

  const inserted = editor.chain().focus().insertQRCode(options(source)).run();
  if (!inserted) {
    ElMessage.error(t.value.qrcode.insertFailed);
    return;
  }
  sync();
}

/** 把当前表单推送到已有的节点上。 / Push the current form onto the existing node. */
async function update(): Promise<void> {
  const editor = props.editor;
  if (!editor || !exists.value) return;

  const source = await render();
  if (source === undefined) return;

  const updated = editor.chain().focus().updateQRCode(options(source)).run();
  if (!updated) {
    ElMessage.error(t.value.qrcode.insertFailed);
    return;
  }
  sync();
}

/**
 * 请扩展根据存下来的内容重建位图。
 *
 * Ask the extension to rebuild the raster from the stored payload.
 */
function regenerate(): void {
  const regenerated = props.editor?.chain().focus().regenerateQRCode().run();
  if (regenerated !== true) {
    ElMessage.error(t.value.qrcode.insertFailed);
    return;
  }
  sync();
}

/**
 * 删除二维码。之后 {@link exists} 又变回 `false`，因为它是派生出来的。
 *
 * Delete the QR code. Afterwards {@link exists} is false again, because it is derived.
 */
function remove(): void {
  props.editor?.chain().focus().removeQRCode().run();
  sync();
}
</script>

<style scoped lang="scss">
.s-tool-qrcode {
  min-width: 340px;
  max-width: 420px;

  &__form {
    :deep(.el-form-item) {
      margin-bottom: 8px;
    }
  }

  &__number {
    width: 72px;
  }

  &__unit {
    width: 68px;
    margin-left: 5px;
  }

  &__axis {
    color: var(--se-color-text-secondary);
    font-size: 12px;
    margin: 0 4px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  &__hint {
    margin: 8px 0 0;
    color: var(--se-color-text-secondary);
    font-size: 12px;
  }
}
</style>
