<template>
  <div class="captcha">

  </div>
</template>

<script setup lang="ts">
import { onMounted, PropType } from 'vue'
import { CaptchaConfig, CaptchaHandle } from './type'
import initCaptcha from './ct4'
declare global {
  interface Window {
    initAlicom4: (config: CaptchaConfig, handler: CaptchaHandle) => void;
  }
}

const props = defineProps({
  captchaId: {
    type: String,
    required: true,
  },
  handle: {
    type: Function as PropType<CaptchaHandle>,
    required: true,
  },
})

onMounted(() => {
  initCaptcha(window)
  window.initAlicom4(
    {
      captchaId: props.captchaId,
      product: "bind"
    },
    props.handle
  )
})

// const createScript = () => {
//   const script = document.createElement('script')
//   script.type = 'text/javascript'
//   script.async = true
//   script.src = '/js/ct4.js'
//   document.body.appendChild(script)
//   script.onload = () => {
//     console.log('加载完成')
//     window.initAlicom4({ captchaId: props.captchaId, product: "bind" }, props.handle)
//   }
//   script.onerror = () => {
//     console.log('加载失败')
//   }
// }

defineOptions({
  name: "ali-captcha"
})
</script>

<style scoped></style>