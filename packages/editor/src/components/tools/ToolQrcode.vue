<template>
  <QrcodeForm :editor="editor" :locale="locale" />
</template>

<script setup lang="ts">
/**
 * `ToolQrcode` —— 「二维码」区块。
 *
 * 只有接线：控件本体是 {@link QrcodeForm}，因为同一套控件还要在二维码弹窗里出现，而两处各写
 * 一遍正是它们会走偏的原因。
 *
 * `ToolQrcode` — the 二维码 section.
 *
 * Wiring only: the controls themselves are {@link QrcodeForm}, because the same controls also
 * appear in the QR dialog, and two copies are exactly how they drift apart.
 */

import QrcodeForm from "../QrcodeForm.vue";
import type { ToolProps } from "../../editor/props";

defineOptions({ name: "ToolQrcode" });

// Declared only so the template can read them; `<script setup>` resolves `editor` and `locale`
// to the props, so no local binding is needed and none can go stale.
defineProps<ToolProps>();
</script>
