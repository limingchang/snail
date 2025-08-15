<template>
  <div>
    <p>monorepo 组件开发测试</p>
    <div style="width: 200px">
      <button style="background-color: var(--snail-color-danger); color: #fff">
        <SIcon>
          <IconContract />
        </SIcon>按钮测试
      </button>
      <SClickCopy text="复制内容"></SClickCopy>
    </div>
    <!-- <p>
      <button ref="btn" style="background-color: var(--snail-color-danger); color: #fff" @click="clickHanle">
        <SIcon size="large">
          <IconSign />
        </SIcon>图形验证
        <SIcon>
          <Edit />
        </SIcon>兼容测试
      </button>
      <ElButton type="primary" @click="testHandle">
         <ElButton type="primary"> -->
        <!-- <ElIcon>
          <Edit />
        </ElIcon>山河随机
      </ElButton> -->
    <!-- </p> -->
    <!-- <p> -->
      <!-- <ElButton type="primary" @click="handleNongli"> -->
        <!-- <ElButton type="primary"> -->
        <!-- <ElIcon>
          <Edit />
        </ElIcon>山河农历 -->
      <!-- </ElButton> -->
      <!-- <ElButton type="primary" @click="handleApiTest"> -->
        <!-- <ElButton type="primary"> -->
        <!-- <ElIcon>
          <Edit />
        </ElIcon>Api调试 -->
      <!-- </ElButton> -->
    <!-- </p> -->
    <p>
      <!-- <ElButton type="success" @click="handleSse">SSE测试</ElButton> -->
    </p>
    <!-- <div class="icon-box" v-show="true">
      <span class="icon" v-for="(icon, index) in SIconSvgs" :key="`${icon.name}`">
        <SIcon :icon="icon.name">
        </SIcon>
        <span class="icon-name" style="display: inline-block">{{
        toPascalCase(icon.name!)
      }}</span>
      </span>
    </div> -->
    <p>
      <!-- <button @click="menuHandle">点击菜单</button> -->
      <!-- <AliCaptcha :captchaId="captchaId" :handle="handle"></AliCaptcha> -->
      <!-- <SPopupMenu :width="150" v-model="showMenu" :items="menuItems"></SPopupMenu> -->
    </p>
    <!-- <div>
      <SWordCloud :hotWords="hotWords" :radius="100" :speed="10"></SWordCloud>
    </div> -->
    <p>
      <SAiChat></SAiChat>
    </p>
    <p>
      <SDocxDesign></SDocxDesign>
    </p>
      
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, useTemplateRef, watch } from "vue";
import { SIcon, SClickCopy } from "@snail-js/vue";
import { IconMobile, IconSign, IconContract, SIconSvgs,SAiChat } from "@snail-js/vue";
// import * as SnailIcons from "@snail-js/theme";

import { SWordCloud } from "@snail-js/vue";

import { AliCaptcha, CaptchaObj } from "@snail-js/vue";
import { ElButton, ElIcon } from "element-plus";
import { Edit, EditPen } from "@element-plus/icons-vue";
import { SPopUpMenu, SPopUpMenuItemOptions } from "@snail-js/vue";

// import { SIcon,CaptchaObj,SClickCopy,AliCaptcha } from '../packages/vue'
// const captchaId = ref(import.meta.env.VITE_APP_CAPTCHA_ID);
// const captchaId = ref('xxxxxx');

const showMenu = ref(false);
const checkPermission = async () => {
  return new Promise<boolean>((resolve, reject) => {
    setTimeout(() => {
      return resolve(false);
    }, 500);
    // reject(false)
  });
};

const subMenus = [
  {
    label: "子菜单1",
    icon: "icon-snail-fill",
    command: () => {
      console.log("菜单1");
    },
    enabled: checkPermission,
  },
  {
    label: "子菜单2",
    icon: "icon-word",
    command: () => {
      console.log("子菜单2");
    },
    // enabled: checkPermission,
  },
];

const menuItems = ref<Array<SPopUpMenuItemOptions>>([
  {
    label: "菜单1",
    icon: "icon-snail-fill",
    command: () => {
      console.log("菜单1");
    },
    enabled: checkPermission,
  },
  {
    label: "菜单2",
    icon: "icon-mobile",
    command: () => {
      console.log("菜单2");
    },
    enabled: true,
    children: subMenus,
  },
  {
    label: "菜单3",
    icon: "icon-mobile",
    command: () => {
      console.log("菜单3");
    },
    enabled: true,
  },
]);

onMounted(() => {
  // console.log(captchaId.value);
});

const menuHandle = () => {
  console.log("menu");
  // showMenu.value = true;
  SPopUpMenu(
    {
      context: { a: 1 },
    },
    menuItems.value
  );
};

watch(
  () => showMenu.value,
  () => {
    console.log("showMenu:", showMenu.value);
  }
);

const clickHanle = ref(() => {
  console.log("click");
});

// 转大驼峰函数

const toPascalCase = (str: string) => {
  // 分割字符串为数组，每个元素是以短横线分隔的单词
  const words = str.split("-");
  // 遍历数组，将每个单词的首字母大写，然后拼接成字符串
  return words
    .map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
};

// 词云组件数据
const hotWords = ["java", "javaScript", "HTML", "CSS"];

import { TestApi, ShanHeApiRandom } from "./server/shanhe";

const method = TestApi.shanheRandom<ShanHeApiRandom>();
const { send: shanheRandom } = method;
const testHandle = async () => {
  // const res = await TestApi.shanheRandom<ShanHeApiRandom>()

  // console.log('method:', send)
  const { text, code, data } = await shanheRandom();
  console.log("山河随机api:", code, text);
  // console.log('method:', method.name)
};

const { send: shanheNongli } = TestApi.shanheNongli();
const handleNongli = async () => {
  await shanheNongli();
  console.log("山河农历api:");
};

const { send, onSuccess, onError } = TestApi.test<{ id: string }>();
onSuccess((data) => {
  const { text, code } = data
  console.log('onSuccess')
})
onError((err) => {

})

import { SystemSse } from './server/local'
const { open } = SystemSse;
const handleApiTest = async () => {
  // const { send, onSuccess, onError } = TestApi.test<object>("a1", { b: "cc", type: "admin" });
  open()

  // on("success", () => { });
  // const res = await send("a1", { b: "cc", type: "admin" });
  // const { data } = res
  // console.log("Api调试", res);
};

// import { SystemSse } from "./server/local";
// const { open, close, eventSource } = SystemSse;
// const handleSse = async () => {
//   open();
//   console.log("app:", eventSource);
// };
</script>

<style lang="scss">
// @use "@snail-js/vue/dist/index.css";

.icon-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-items: center;
  color: #333;
  padding: 20px;
}

.icon {
  cursor: pointer;
  display: inline-block;
  padding: 15px;
  text-align: center;
  margin-left: -1px;
  margin-top: -1px;
  // display: flex;
  // align-items: center;
  width: 100px;
  height: 80px;
  border: 1px solid #333;

  i {
    font-size: 2em;
    margin: 0 auto;
    margin-bottom: 10px;
  }
}

.icon-name {
  display: inline-block;
  font-size: 12px;
  text-align: center;
  width: 100%;
}
</style>
