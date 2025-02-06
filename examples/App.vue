<template>
  <div>
    <p>monorepo 组件开发测试</p>
    <div style="width: 200px;">
      <button style="background-color: var(--snail-color-danger); color: #fff">
        <SIcon>
          <IconContract />
        </SIcon>按钮测试
      </button>
      <SClickCopy text="复制内容"></SClickCopy>
    </div>
    <p>
      <button ref="btn" style="background-color: var(--snail-color-danger); color: #fff" @click="clickHanle">
        <SIcon size="large">
          <IconSign />
        </SIcon>图形验证
        <SIcon>
          <Edit />
        </SIcon>兼容测试
      </button>
      <ElButton type="primary" @click="testHandle">
        <ElIcon>
          <Edit />
        </ElIcon>测试
      </ElButton>
    </p>
    <div class="icon-box">
      <span class="icon" v-for="(icon, index) in SIconSvgs" :key="`${icon.name}`">
        <SIcon :icon="icon.name">
          <!-- <component :is="icon.name"></component> -->
        </SIcon>
        <span class="icon-name" style="display: inline-block;">{{ toPascalCase(icon.name!) }}</span>
      </span>
    </div>
    <p>
      <button @click="menuHandle">点击菜单</button>
      <!-- <AliCaptcha :captchaId="captchaId" :handle="handle"></AliCaptcha> -->
      <SPopupMenu :width="150" v-model="showMenu" :items="menuItems"></SPopupMenu>
    </p>
    <!-- <div>
      <SWordCloud :hotWords="hotWords" :radius="100" :speed="10"></SWordCloud>
    </div> -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, useTemplateRef, watch } from "vue";
import { SIcon, SClickCopy } from "@snail-js/vue";
import { IconMobile, IconSign, IconContract, SIconSvgs } from "@snail-js/vue";
// import * as SnailIcons from "@snail-js/theme";

import { SWordCloud } from "@snail-js/vue"

import { AliCaptcha, CaptchaObj } from "@snail-js/vue";
import { ElButton, ElIcon } from "element-plus";
import { Edit, EditPen } from "@element-plus/icons-vue";
import { SPopupMenu, SPopUpMenuItemOptions } from "@snail-js/vue";

// import { SIcon,CaptchaObj,SClickCopy,AliCaptcha } from '../packages/vue'
// const captchaId = ref(import.meta.env.VITE_APP_CAPTCHA_ID);
// const captchaId = ref('xxxxxx');

const showMenu = ref(false);
const checkPermission = async () => {
  return new Promise<boolean>((resolve, reject) => {
    setTimeout(() => {
      return resolve(false);
    }, 1000);
    // reject(false)
  })

};

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
  showMenu.value = true;

};

watch(() => showMenu.value, () => {
  console.log("showMenu:", showMenu.value)
})

const clickHanle = ref(() => {
  console.log("click");
});

// 转大驼峰函数

const toPascalCase = (str: string) => {
  // 分割字符串为数组，每个元素是以短横线分隔的单词
  const words = str.split('-');
  // 遍历数组，将每个单词的首字母大写，然后拼接成字符串
  return words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join('');
}

// 词云组件数据
const hotWords = [
  "java",
  "javaScript",
  "HTML",
  "CSS"
]

import { TestApi } from './server/test'

const testHandle = async () => {
  const res = await TestApi.send({ version: '0.1.0' })
  const { Catch, error, data } = res
  if (error == null) {
    console.log('Snail-Api:', data)
  }
  Catch((error) => {
    console.log(error)
  })
}

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
