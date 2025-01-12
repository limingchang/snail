<template>
  <div>
    <p>monorepo 组件开发测试</p>
    <button style="background-color: var(--snail-color-danger); color: #fff">
      <SIcon icon="icon-hetongqianshu"></SIcon>按钮测试
      <SClickCopy text="复制内容" :display="false"></SClickCopy>
    </button>
    <p>
      <button
        ref="btn"
        style="background-color: var(--snail-color-danger); color: #fff"
        @click="clickHanle"
      >
        <SIcon size="large"><IconSign  /></SIcon>图形验证
        <SIcon><Edit /></SIcon>兼容测试
      </button>
      <ElButton type="primary"
        ><ElIcon><Edit /></ElIcon>测试</ElButton
      >
    </p>
    <button @click="menuHandle">点击菜单</button>
    <!-- <AliCaptcha :captchaId="captchaId" :handle="handle"></AliCaptcha> -->
    <SPopupMenu
      :width="150"
      :items="menuItems"
      :permission="() => true"
      v-model="showMenu"
    ></SPopupMenu>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, useTemplateRef } from "vue";
import { SIcon, SClickCopy } from "@snail-js/vue";
import { IconMobile,IconSign } from "@snail-js/theme";
import { AliCaptcha, CaptchaObj } from "@snail-js/vue";
import { ElButton, ElIcon } from "element-plus";
import { Edit, EditPen } from "@element-plus/icons-vue";
import { SPopupMenu, SnailPopUpMenuItem } from "@snail-js/vue";

// import { SIcon,CaptchaObj,SClickCopy,AliCaptcha } from '../packages/vue'
// const captchaId = ref(import.meta.env.VITE_APP_CAPTCHA_ID);
// const captchaId = ref('xxxxxx');

const showMenu = ref(false);

const menuItems = ref<Array<SnailPopUpMenuItem>>([
  {
    label: "菜单1",
    icon: "icon-snail-fill",
    click: () => {
      console.log("菜单1");
    },
    disabled: true,
  },
  {
    label: "菜单2",
    icon: "icon-mobile",
    click: () => {
      console.log("菜单2");
    },
    disabled: false,
  },
]);

onMounted(() => {
  // console.log(captchaId.value);
});

const menuHandle = () => {
  console.log("menu");
  showMenu.value = true;
};

// const handle = (captchaObj: CaptchaObj) => {
//   captchaObj.onReady(() => {
//     clickHanle.value = () => {
//       captchaObj.showCaptcha()
//     }
//   })
//   captchaObj.onSuccess(() => {
//     console.log(captchaObj.getValidate());
//   });
//   captchaObj.onError((error: any) => {
//     console.log(error);
//   });
// }

const clickHanle = ref(() => {
  console.log("click");
});
</script>

<style lang="scss">
// 发布包引用方式
// @use "@snail-js/theme/iconfont";
// 本地开发引用方式
// @use "@snail-js/theme/src/iconFont/inconfont.css"

@use "@snail-js/theme/index.scss";
@use "@snail-js/theme/iconFont/iconfont.css";
</style>
