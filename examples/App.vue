<template>
  <div>
    monorepo 组件开发测试
    <button style="background-color: var(--snail-color-danger); color: #fff">
      <SIcon icon="icon-hetongqianshu" color="#409EFF"></SIcon>按钮测试
    </button>
    <SClickCopy text="复制内容"></SClickCopy>
    <p>
      <button
        ref="btn"
        style="background-color: var(--snail-color-danger); color: #fff"
      >
        <SIcon icon="icon-hetongqianshu"></SIcon>图形验证
      </button>
    </p>
    <!-- <AliCaptcha :captchaId="captchaId" :handle="handle"></AliCaptcha> -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, useTemplateRef } from "vue";
import { SIcon, SClickCopy, AliCaptcha, CaptchaObj } from "@snail-js/vue";
const captchaId = ref(import.meta.env.VITE_APP_CAPTCHA_ID);

const btnRef = useTemplateRef("btn");
onMounted(() => {
  console.log(captchaId.value);
  console.log(btnRef.value?);
});

const handle = (captchaObj: CaptchaObj) => {
  
};

const clickHanle = () => {
  console.log("click");
};
</script>

<style lang="scss"></style>
