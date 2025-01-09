<template>
  <div>
    monorepo 组件开发测试
    <button style="background-color: var(--snail-color-danger); color: #fff">
      <SIcon icon="icon-hetongqianshu"></SIcon>按钮测试
    </button>
    <SClickCopy text="复制内容"></SClickCopy>
    <p>
      <button ref="btn" style="background-color: var(--snail-color-danger); color: #fff" @click="clickHanle">
        <SIcon icon="icon-hetongqianshu"></SIcon>图形验证
      </button>
    </p>
    <!-- <AliCaptcha :captchaId="captchaId" :handle="handle"></AliCaptcha> -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, useTemplateRef } from "vue";
import { SIcon, SClickCopy, AliCaptcha, CaptchaObj } from "@snail-js/vue";
// import { SIcon,CaptchaObj,SClickCopy,AliCaptcha } from '../packages/vue'
const captchaId = ref(import.meta.env.VITE_APP_CAPTCHA_ID);
// const captchaId = ref('xxxxxx');


onMounted(() => {
  console.log(captchaId.value);
});


const handle = (captchaObj: CaptchaObj) => {
  captchaObj.onReady(() => {
    clickHanle.value = () => {
      captchaObj.showCaptcha()
    }
  })
  captchaObj.onSuccess(() => {
    console.log(captchaObj.getValidate());
  });
  captchaObj.onError((error) => {
    console.log(error);
  });
}

const clickHanle = ref(() => {
  console.log("click");
});
</script>

<style lang="scss"></style>
