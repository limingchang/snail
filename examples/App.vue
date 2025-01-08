<template>
  <div>
    monorepo 组件开发测试
    <button style="background-color: var(--snail-color-danger);color: #fff;">
      <SIcon icon="icon-hetongqianshu" color="#409EFF"></SIcon>按钮测试
    </button>
    <SClickCopy text="复制内容" :display="false"></SClickCopy>
  </div>
</template>

<script setup lang="ts">
import { SIcon,SClickCopy } from "@snail-js/vue"
</script>

<style lang="scss">
@use '@snail-js/theme-chalk/style/index.scss';

@use '@snail-js/theme-chalk/style/snailVariables.scss';
</style>
