<script setup lang="ts">
// 本包的每个图标都是普通组件：import 进来直接用，或者交给 `SIcon` 的 `icon` 属性，
// 由它决定颜色、尺寸和旋转。
import { IconEdit, IconPdf, IconSnail, SIcon } from "@snail-js/vue";
</script>

<template>
  <div class="row">
    <!-- 直接当组件用：编译期就知道是哪一个，打包器最容易摇掉没用的图标 -->
    <IconSnail />

    <!-- 交给 SIcon：color / size / spin 都由它写到根元素上 -->
    <SIcon :icon="IconEdit" color="#409eff" :size="24" />
    <SIcon :icon="IconPdf" :size="32" spin />

    <!-- size 也接受字符串；数字会被读成 px -->
    <SIcon :icon="IconEdit" size="2em" />

    <!-- 没有 icon 时渲染默认插槽：自己的 SVG 也能套用同一个盒子 -->
    <SIcon color="#f56c6c">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="currentColor" />
      </svg>
    </SIcon>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--vp-c-text-1);
}
</style>
